import { sha256Hex } from "../domain/checksum";

/** Firestore documents are limited to 1 MiB; stay well below it. */
export const CHUNK_CHARS = 300_000;

export const splitIntoChunks = (text: string, size = CHUNK_CHARS): string[] => {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    return chunks.length > 0 ? chunks : [""];
};

export type ChunkDoc = { index: number; data: string };

export const assembleChunks = (chunks: ChunkDoc[], expectedCount: number, expectedSha256: string): string => {
    const sorted = [...chunks].sort((a, b) => a.index - b.index);
    if (sorted.length !== expectedCount || sorted.some((c, i) => c.index !== i)) {
        throw new Error(`Cloud backup is incomplete (${sorted.length}/${expectedCount} parts).`);
    }
    const text = sorted.map((c) => c.data).join("");
    if (sha256Hex(text) !== expectedSha256) {
        throw new Error("Cloud backup failed its integrity check.");
    }
    return text;
};

export type RecoveryIdentity = { uid: string; email: string | null; emailVerified: boolean };

/**
 * Decides whether a freshly signed-in Firebase account may be trusted for
 * cloud backup or PIN recovery on this phone.
 */
export const assessRecoveryIdentity = (
    user: RecoveryIdentity,
    setupEmail: string | undefined,
    ownerUid: string | undefined
): { ok: true } | { ok: false; reason: string } => {
    if (!user.emailVerified) return { ok: false, reason: "This recovery email is not verified yet." };
    if (!setupEmail || !user.email || user.email.trim().toLowerCase() !== setupEmail.trim().toLowerCase()) {
        return { ok: false, reason: "This account does not match the recovery email saved in My Mandal." };
    }
    if (ownerUid && ownerUid !== user.uid) {
        return { ok: false, reason: "This account is not the cloud backup owner for this phone." };
    }
    return { ok: true };
};
