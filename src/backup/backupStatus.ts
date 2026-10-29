import AsyncStorage from "@react-native-async-storage/async-storage";

import { KEYS } from "../storage/keys";

export type BackupKind = "local-file" | "cloud";

export type BackupStatus = {
    /** Only set after every part of a backup was confirmed written. */
    lastCompleted?: { kind: BackupKind; at: string; id: string; payments: number; totalReceivedPaise: number };
    lastCloudCompleted?: { at: string; id: string };
    lastAttempt?: { kind: BackupKind; at: string; ok: boolean; error?: string };
};

export const readBackupStatus = async (): Promise<BackupStatus> => {
    try {
        const raw = await AsyncStorage.getItem(KEYS.backupStatus);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

export const recordBackupAttempt = async (
    kind: BackupKind,
    result: { ok: true; id: string; payments: number; totalReceivedPaise: number } | { ok: false; error: string }
): Promise<void> => {
    const status = await readBackupStatus();
    const at = new Date().toISOString();
    status.lastAttempt = { kind, at, ok: result.ok, error: result.ok ? undefined : result.error };
    if (result.ok) {
        status.lastCompleted = { kind, at, id: result.id, payments: result.payments, totalReceivedPaise: result.totalReceivedPaise };
        if (kind === "cloud") status.lastCloudCompleted = { at, id: result.id };
    }
    await AsyncStorage.setItem(KEYS.backupStatus, JSON.stringify(status));
};

export const BACKUP_NUDGE_DAYS = 7;

export const isBackupStale = (status: BackupStatus, now: number): boolean => {
    const last = status.lastCompleted ? Date.parse(status.lastCompleted.at) : NaN;
    return !Number.isFinite(last) || now - last > BACKUP_NUDGE_DAYS * 24 * 60 * 60 * 1000;
};
