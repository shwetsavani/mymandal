import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

import { parseAnyBackup, type BackupValidation } from "../backup/backupFormat";
import { recordBackupAttempt } from "../backup/backupStatus";
import { assembleChunks, assessRecoveryIdentity, splitIntoChunks, type ChunkDoc } from "../backup/cloudChunks";
import { APP_VERSION, createBackupObject } from "../backup/localBackup";
import { sha256Hex } from "../domain/checksum";
import { loadFinancialState, mutateFinancialState, readSetup } from "../storage/repository";
import { auth, db } from "./firebase";
import { signInRecoveryAccount } from "./firebaseAuth";

/**
 * Cloud BACKUP (not synchronisation):
 * - Each backup is a new immutable snapshot at mandals/{uid}/backups/{id},
 *   stored in chunks; the metadata document is written last with
 *   complete: true, so a partial upload is never listed as a backup.
 * - Nothing is ever overwritten or deleted in the cloud by the app.
 * - Uploads happen only when the administrator taps "Back up now".
 * - The legacy mirror (members/obligations/payments collections written by
 *   the old app) is only ever read.
 */

export type CloudBackupMeta = {
    id: string;
    createdAt: string;
    appVersion: string;
    complete: boolean;
    chunkCount: number;
    sha256: string;
    counts: { members: number; obligations: number; payments: number };
    totalReceivedPaise: number;
};

const requireTrustedUser = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in to the recovery account first.");
    await user.reload();
    const setup = await readSetup();
    const state = await loadFinancialState();
    const verdict = assessRecoveryIdentity(
        { uid: user.uid, email: user.email, emailVerified: user.emailVerified },
        setup?.email,
        state.settings.cloudOwnerUid
    );
    if (!verdict.ok) throw new Error(verdict.reason);
    return { user, ownerUid: state.settings.cloudOwnerUid };
};

export const signInForCloud = async (password: string) => {
    const setup = await readSetup();
    if (!setup?.email) throw new Error("No recovery email is saved in My Mandal.");
    const user = await signInRecoveryAccount(setup.email, password);
    await user.reload();
    return user;
};

export const currentCloudAccount = () => {
    const user = auth.currentUser;
    return user ? { email: user.email, uid: user.uid, verified: user.emailVerified } : null;
};

let uploadInFlight: Promise<CloudBackupMeta> | null = null;

export const uploadCloudBackup = (): Promise<CloudBackupMeta> => {
    if (uploadInFlight) return uploadInFlight;
    uploadInFlight = (async () => {
        try {
            const { user, ownerUid } = await requireTrustedUser();
            // The snapshot is read inside the storage lock, so it is internally consistent.
            const backup = await createBackupObject();
            const text = JSON.stringify(backup);
            const chunks = splitIntoChunks(text);
            const id = `${backup.createdAt.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
            const base = doc(db, "mandals", user.uid, "backups", id);
            for (let index = 0; index < chunks.length; index++) {
                await setDoc(doc(base, "chunks", String(index)), { index, data: chunks[index] });
            }
            const meta: CloudBackupMeta = {
                id,
                createdAt: backup.createdAt,
                appVersion: APP_VERSION,
                complete: true,
                chunkCount: chunks.length,
                sha256: sha256Hex(text),
                counts: { members: backup.counts.members, obligations: backup.counts.obligations, payments: backup.counts.payments },
                totalReceivedPaise: backup.totalReceivedPaise,
            };
            await setDoc(base, meta);
            // Read back the metadata and every chunk before reporting success.
            const verify = await downloadCloudBackup(id, user.uid);
            if (!verify.ok) throw new Error(`Uploaded backup did not verify: ${verify.errors.join("; ")}`);
            if (!ownerUid) {
                await mutateFinancialState("cloud-owner", (state) => ({
                    state: { ...state, settings: { ...state.settings, cloudOwnerUid: user.uid } },
                    result: true,
                }));
            }
            await recordBackupAttempt("cloud", { ok: true, id, payments: backup.counts.payments, totalReceivedPaise: backup.totalReceivedPaise });
            return meta;
        } catch (error) {
            await recordBackupAttempt("cloud", { ok: false, error: error instanceof Error ? error.message : String(error) });
            throw error;
        } finally {
            uploadInFlight = null;
        }
    })();
    return uploadInFlight;
};

export const listCloudBackups = async (): Promise<CloudBackupMeta[]> => {
    const { user } = await requireTrustedUser();
    const snapshot = await getDocs(collection(db, "mandals", user.uid, "backups"));
    return snapshot.docs
        .map((d) => d.data() as CloudBackupMeta)
        .filter((m) => m && m.complete === true)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const downloadCloudBackup = async (id: string, uid?: string): Promise<BackupValidation> => {
    const ownerUid = uid ?? (await requireTrustedUser()).user.uid;
    const base = doc(db, "mandals", ownerUid, "backups", id);
    const metaSnap = await getDoc(base);
    if (!metaSnap.exists()) throw new Error("Cloud backup not found.");
    const meta = metaSnap.data() as CloudBackupMeta;
    if (!meta.complete) throw new Error("This cloud backup did not finish uploading.");
    const chunkSnap = await getDocs(collection(base, "chunks"));
    const text = assembleChunks(
        chunkSnap.docs.map((d) => d.data() as ChunkDoc),
        meta.chunkCount,
        meta.sha256
    );
    return parseAnyBackup(text, APP_VERSION);
};

/** Reads the old app's cloud mirror (read-only) as an unverified backup. */
export const readLegacyCloudMirror = async (): Promise<BackupValidation & { legacyMirror: boolean }> => {
    const { user } = await requireTrustedUser();
    const read = async (name: string) => (await getDocs(collection(db, "mandals", user.uid, name))).docs.map((d) => d.data());
    const [members, obligations, payments] = await Promise.all([read("members"), read("obligations"), read("payments")]);
    return parseAnyBackup(
        JSON.stringify({ kind: "my-mandal-firestore-readonly-export", exportedAt: new Date().toISOString(), members, obligations, payments }),
        APP_VERSION
    );
};
