import type { FinancialState } from "../domain/types";
import { CURRENT_SCHEMA_VERSION, KEYS } from "../storage/keys";
import { planMigrationV2 } from "../storage/migrations";
import { notifyFinancialChange, readFinancialStateUnlocked } from "../storage/repository";
import { commitJournaled, readJson, withStorageLock } from "../storage/safeStorage";
import { isDestructiveRestore, summarizeData, validateBackup, type MandalBackup } from "./backupFormat";

export type RestoreSnapshot = {
    id: string;
    createdAt: string;
    reason: string;
    data: FinancialState;
};

const MAX_RESTORE_SNAPSHOTS = 3;

export class RestoreBlockedError extends Error {
    readonly needsConfirmation: boolean;
    constructor(message: string, needsConfirmation = false) {
        super(message);
        this.name = "RestoreBlockedError";
        this.needsConfirmation = needsConfirmation;
    }
}

export type RestorePreview = {
    destructive: boolean;
    current: ReturnType<typeof summarizeData>;
    incoming: ReturnType<typeof summarizeData>;
    warnings: string[];
};

export const previewRestore = async (backup: MandalBackup): Promise<RestorePreview> =>
    withStorageLock(async () => {
        const validation = validateBackup(backup);
        if (!validation.ok) {
            throw new RestoreBlockedError(validation.errors.join("\n"));
        }
        const current = await readFinancialStateUnlocked();
        return {
            destructive: isDestructiveRestore(current, backup.data),
            current: summarizeData(current),
            incoming: summarizeData(backup.data),
            warnings: validation.warnings,
        };
    });

/**
 * Replaces local financial data with a validated backup.
 * - Validation runs again inside the lock (the preview is not trusted).
 * - The current data is saved as a recovery snapshot first.
 * - Empty or shrinking restores require explicit confirmation.
 * - All collections are committed through the write journal, so an
 *   interrupted restore completes on the next start.
 * The PIN, PIN verifier, login security and Firebase session are untouched.
 */
export const applyRestore = async (
    backup: MandalBackup,
    options: { confirmedDestructive: boolean; reason: string }
): Promise<{ snapshotId: string }> => {
    const result = await withStorageLock(async () => {
        const validation = validateBackup(backup);
        if (!validation.ok) {
            throw new RestoreBlockedError(validation.errors.join("\n"));
        }
        const current = await readFinancialStateUnlocked();
        if (isDestructiveRestore(current, backup.data) && !options.confirmedDestructive) {
            throw new RestoreBlockedError("This restore would remove existing records and needs explicit confirmation.", true);
        }

        const snapshots = await readJson<RestoreSnapshot[]>(KEYS.restoreSnapshots, []);
        const snapshot: RestoreSnapshot = {
            id: `${Date.now()}`,
            createdAt: new Date().toISOString(),
            reason: options.reason,
            data: current,
        };
        const keptSnapshots = [snapshot, ...(Array.isArray(snapshots) ? snapshots : [])].slice(0, MAX_RESTORE_SNAPSHOTS);

        const incoming: FinancialState = {
            ...backup.data,
            waivers: backup.data.waivers ?? [],
            auditLog: [
                ...(backup.data.auditLog ?? []),
                {
                    id: `${Date.now()}-restore`,
                    at: new Date().toISOString(),
                    action: "restore",
                    reason: options.reason,
                    details: `Restored ${backup.source} backup created ${backup.createdAt}. Previous data kept in recovery snapshot ${snapshot.id}.`,
                },
            ],
            // Keep this phone's cloud owner binding.
            settings: { ...backup.data.settings, cloudOwnerUid: current.settings.cloudOwnerUid },
        };
        const plan = planMigrationV2(incoming, new Date().toISOString());

        await commitJournaled("restore", {
            [KEYS.restoreSnapshots]: JSON.stringify(keptSnapshots),
            [KEYS.members]: JSON.stringify(plan.members),
            [KEYS.obligations]: JSON.stringify(incoming.obligations),
            [KEYS.payments]: JSON.stringify(incoming.payments),
            [KEYS.waivers]: JSON.stringify(incoming.waivers),
            [KEYS.auditLog]: JSON.stringify(incoming.auditLog),
            [KEYS.settings]: JSON.stringify(plan.settings),
            [KEYS.schemaVersion]: String(CURRENT_SCHEMA_VERSION),
        });
        return { snapshotId: snapshot.id };
    });
    notifyFinancialChange();
    return result;
};

export const listRestoreSnapshots = async (): Promise<RestoreSnapshot[]> => {
    const snapshots = await readJson<RestoreSnapshot[]>(KEYS.restoreSnapshots, []);
    return Array.isArray(snapshots) ? snapshots : [];
};
