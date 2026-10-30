import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import appJson from "../../app.json";
import { CURRENT_SCHEMA_VERSION } from "../storage/keys";
import { loadFinancialState, readSetup } from "../storage/repository";
import { buildBackup, parseAndValidateBackup, parseAnyBackup, type MandalBackup } from "./backupFormat";
import { recordBackupAttempt } from "./backupStatus";

export const APP_VERSION: string = appJson.expo.version;
const BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;
const KEEP_LOCAL_COPIES = 5;

export const createBackupObject = async (): Promise<MandalBackup> =>
    buildBackup({
        state: await loadFinancialState(),
        setup: await readSetup(),
        appVersion: APP_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
    });

const pruneOldCopies = async () => {
    try {
        const files = (await FileSystem.readDirectoryAsync(BACKUP_DIR)).filter((f) => f.endsWith(".json")).sort();
        for (const file of files.slice(0, Math.max(0, files.length - KEEP_LOCAL_COPIES))) {
            await FileSystem.deleteAsync(`${BACKUP_DIR}${file}`, { idempotent: true });
        }
    } catch {
        // Pruning is best effort.
    }
};

/**
 * Writes a complete backup file, reads it back and validates it, keeps a copy
 * in the app's document folder (last 5), then opens the share sheet so it
 * can be saved off the phone. Status is recorded as completed only after the
 * written file verified successfully.
 */
export const createAndShareLocalBackup = async (): Promise<{ fileName: string; backup: MandalBackup }> => {
    try {
        const backup = await createBackupObject();
        const json = JSON.stringify(backup);
        const fileName = `my-mandal-backup-${backup.createdAt.replace(/[:.]/g, "-")}.json`;
        const info = await FileSystem.getInfoAsync(BACKUP_DIR);
        if (!info.exists) await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
        const uri = `${BACKUP_DIR}${fileName}`;
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
        const verify = parseAndValidateBackup(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 }));
        if (!verify.ok) {
            throw new Error(`Backup file did not verify: ${verify.errors.join("; ")}`);
        }
        await recordBackupAttempt("local-file", {
            ok: true,
            id: fileName,
            payments: backup.counts.payments,
            totalReceivedPaise: backup.totalReceivedPaise,
        });
        await pruneOldCopies();
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "My Mandal backup" });
        }
        return { fileName, backup };
    } catch (error) {
        await recordBackupAttempt("local-file", { ok: false, error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
};

type PickedBackup = ReturnType<typeof parseAnyBackup> | null;

// The native picker rejects a second call while one is open, so repeated taps share the pending pick.
let pickInFlight: Promise<PickedBackup> | null = null;

const pickBackupFileOnce = async (): Promise<PickedBackup> => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return null;
    const json = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
    return parseAnyBackup(json, APP_VERSION);
};

/** Lets the user pick a backup file and returns the validated backup (not yet applied). */
export const pickBackupFile = (): Promise<PickedBackup> => {
    if (!pickInFlight) {
        pickInFlight = pickBackupFileOnce().finally(() => {
            pickInFlight = null;
        });
    }
    return pickInFlight;
};
