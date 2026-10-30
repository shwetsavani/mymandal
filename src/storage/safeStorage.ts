import AsyncStorage from "@react-native-async-storage/async-storage";

import { KEYS } from "./keys";

/**
 * Thrown when stored data cannot be read or parsed. Callers must surface this
 * as a recoverable error and must never fall back to an empty list that could
 * later be written over valid records.
 */
export class StorageReadError extends Error {
    readonly key: string;
    readonly kind: "read_failed" | "corrupt" | "wrong_shape";

    constructor(key: string, kind: StorageReadError["kind"], cause?: unknown) {
        super(`Stored data for "${key}" could not be ${kind === "read_failed" ? "read" : "parsed"} (${kind}).${cause ? ` ${String(cause)}` : ""}`);
        this.name = "StorageReadError";
        this.key = key;
        this.kind = kind;
    }
}

export const readRaw = async (key: string): Promise<string | null> => {
    try {
        return await AsyncStorage.getItem(key);
    } catch (error) {
        throw new StorageReadError(key, "read_failed", error);
    }
};

export const readJson = async <T>(key: string, fallback: T): Promise<T> => {
    const raw = await readRaw(key);
    if (raw === null) {
        return fallback;
    }
    try {
        return JSON.parse(raw) as T;
    } catch (error) {
        throw new StorageReadError(key, "corrupt", error);
    }
};

export const readArray = async <T>(key: string): Promise<T[]> => {
    const value = await readJson<unknown>(key, []);
    if (!Array.isArray(value)) {
        throw new StorageReadError(key, "wrong_shape");
    }
    return value as T[];
};

export const readObject = async <T extends object>(key: string, fallback: T): Promise<T> => {
    const value = await readJson<unknown>(key, fallback);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new StorageReadError(key, "wrong_shape");
    }
    return value as T;
};

let lockChain: Promise<unknown> = Promise.resolve();

/**
 * Serializes every read-modify-write sequence on financial data so two
 * operations can never read the same array and overwrite each other.
 * Do not call withStorageLock from inside another locked callback.
 */
export const withStorageLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = lockChain.then(task, task);
    lockChain = run.catch(() => undefined);
    return run;
};

type JournalEntry = {
    id: string;
    label: string;
    createdAt: string;
    /** key -> new serialized value, or null to remove the key */
    writes: Record<string, string | null>;
};

/**
 * Writes several keys as one recoverable unit.
 *
 * AsyncStorage (including multiSet) is not a guaranteed transaction. Instead:
 * 1. The complete set of new values is written to a journal key.
 * 2. Each key is written.
 * 3. The journal is removed.
 * If the app stops between 1 and 3, recoverJournal() replays the journal on
 * the next start. Replaying is idempotent because it writes full values.
 * If step 1 fails nothing has changed.
 */
export const commitJournaled = async (label: string, writes: Record<string, string | null>): Promise<void> => {
    const entry: JournalEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        label,
        createdAt: new Date().toISOString(),
        writes,
    };
    await AsyncStorage.setItem(KEYS.journal, JSON.stringify(entry));
    await applyWrites(writes);
    await AsyncStorage.removeItem(KEYS.journal);
};

const applyWrites = async (writes: Record<string, string | null>): Promise<void> => {
    for (const [key, value] of Object.entries(writes)) {
        if (value === null) {
            await AsyncStorage.removeItem(key);
        } else {
            await AsyncStorage.setItem(key, value);
        }
    }
};

export type JournalRecoveryResult = { replayed: false } | { replayed: true; label: string; createdAt: string };

/** Replays an interrupted journaled commit. Run once at startup before any read. */
export const recoverJournal = async (): Promise<JournalRecoveryResult> =>
    withStorageLock(async () => {
        const raw = await readRaw(KEYS.journal);
        if (raw === null) {
            return { replayed: false };
        }
        let entry: JournalEntry;
        try {
            entry = JSON.parse(raw) as JournalEntry;
        } catch (error) {
            // A journal that did not finish writing means step 1 failed and no
            // data key was touched. It is safe to discard.
            await AsyncStorage.removeItem(KEYS.journal);
            return { replayed: false };
        }
        if (!entry || typeof entry !== "object" || !entry.writes || typeof entry.writes !== "object") {
            await AsyncStorage.removeItem(KEYS.journal);
            return { replayed: false };
        }
        await applyWrites(entry.writes);
        await AsyncStorage.removeItem(KEYS.journal);
        return { replayed: true, label: entry.label, createdAt: entry.createdAt };
    });
