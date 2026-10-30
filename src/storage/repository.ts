import type { FinancialState, MandalSetup } from "../domain/types";
import { KEYS } from "./keys";
import { commitJournaled, readArray, readObject, readRaw, StorageReadError, withStorageLock } from "./safeStorage";

const COLLECTION_KEYS = {
    members: KEYS.members,
    obligations: KEYS.obligations,
    payments: KEYS.payments,
    waivers: KEYS.waivers,
    auditLog: KEYS.auditLog,
    settings: KEYS.settings,
} as const satisfies Record<keyof FinancialState, string>;

/** Reads all financial collections. Throws StorageReadError on corrupt data. */
export const readFinancialStateUnlocked = async (): Promise<FinancialState> => {
    const [members, obligations, payments, waivers, auditLog, settings] = await Promise.all([
        readArray<FinancialState["members"][number]>(KEYS.members),
        readArray<FinancialState["obligations"][number]>(KEYS.obligations),
        readArray<FinancialState["payments"][number]>(KEYS.payments),
        readArray<FinancialState["waivers"][number]>(KEYS.waivers),
        readArray<FinancialState["auditLog"][number]>(KEYS.auditLog),
        readObject<FinancialState["settings"]>(KEYS.settings, {}),
    ]);
    return { members, obligations, payments, waivers, auditLog, settings };
};

export const loadFinancialState = (): Promise<FinancialState> => withStorageLock(readFinancialStateUnlocked);

/** Builds journal writes for every collection that changed (by reference). */
export const diffWrites = (
    before: FinancialState,
    after: FinancialState,
    extra: Record<string, string | null> = {}
): Record<string, string | null> => {
    const writes: Record<string, string | null> = {};
    (Object.keys(COLLECTION_KEYS) as (keyof FinancialState)[]).forEach((name) => {
        if (before[name] !== after[name]) {
            writes[COLLECTION_KEYS[name]] = JSON.stringify(after[name]);
        }
    });
    return { ...writes, ...extra };
};

export type MutationResult<R> = { state: FinancialState; result: R; extraWrites?: Record<string, string | null> };

const listeners = new Set<() => void>();

/** Subscribe to committed financial changes (used by screens and reminders). */
export const subscribeFinancialChanges = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const notifyFinancialChange = (): void => {
    listeners.forEach((listener) => {
        try {
            listener();
        } catch (error) {
            console.error("Financial change listener failed:", error);
        }
    });
};

/**
 * Runs a validated mutation against freshly read state inside the storage lock
 * and commits the changed collections as one journaled unit.
 * The mutator must be pure with respect to storage (no nested locking).
 */
export const mutateFinancialState = async <R>(
    label: string,
    mutator: (state: FinancialState) => MutationResult<R> | Promise<MutationResult<R>>
): Promise<R> => {
    const result = await withStorageLock(async () => {
        const before = await readFinancialStateUnlocked();
        const outcome = await mutator(before);
        const writes = diffWrites(before, outcome.state, outcome.extraWrites);
        if (Object.keys(writes).length > 0) {
            await commitJournaled(label, writes);
        }
        return { outcome, changed: Object.keys(writes).length > 0 };
    });
    if (result.changed) {
        notifyFinancialChange();
    }
    return result.outcome.result;
};

const SETUP_FIELDS = ["mandalName", "adminName", "mobile", "email", "pin", "createdAt"] as const;

const looksLikeSetup = (value: unknown): value is MandalSetup =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    SETUP_FIELDS.some((field) => typeof (value as Record<string, unknown>)[field] === "string");

/**
 * Returns null only when no setup has ever been saved. A setup record that
 * exists but cannot be parsed or has the wrong shape is a recovery error, so
 * the app never treats it as a fresh install and never writes over it.
 */
export const readSetup = async (): Promise<MandalSetup | null> => {
    const raw = await readRaw(KEYS.setup);
    if (raw === null) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new StorageReadError(KEYS.setup, "corrupt", error);
    }
    if (!looksLikeSetup(parsed)) throw new StorageReadError(KEYS.setup, "wrong_shape");
    return parsed;
};
