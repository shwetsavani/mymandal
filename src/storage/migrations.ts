import AsyncStorage from "@react-native-async-storage/async-storage";

import { compareYearMonth, type YearMonth } from "../domain/calendar";
import { deriveLegacySchedule } from "../domain/installments";
import type { FinancialState, MandalSettings, Member } from "../domain/types";
import { CURRENT_SCHEMA_VERSION, KEYS } from "./keys";
import { readFinancialStateUnlocked } from "./repository";
import { commitJournaled, readJson, readRaw, recoverJournal, StorageReadError, withStorageLock } from "./safeStorage";

/** Keys captured verbatim in the immutable pre-migration snapshot. */
const SNAPSHOT_KEYS = [
    KEYS.members,
    KEYS.obligations,
    KEYS.payments,
    KEYS.legacyCloudDeletions,
    KEYS.reminderSettings,
    KEYS.language,
    KEYS.biometricEnabled,
] as const;

export type PremigrationSnapshot = {
    kind: "my-mandal-premigration-snapshot";
    createdAt: string;
    fromSchemaVersion: number;
    /** Raw stored strings, byte-for-byte, keyed by AsyncStorage key. */
    raw: Record<string, string | null>;
    /** Mandal setup with the PIN removed. */
    setupWithoutPin: Record<string, unknown> | null;
};

export const readSchemaVersion = async (): Promise<number> => {
    const raw = await readRaw(KEYS.schemaVersion);
    if (raw === null) {
        return 1;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new StorageReadError(KEYS.schemaVersion, "corrupt");
    }
    return value;
};

/**
 * Writes the immutable financial snapshot exactly once. If one already exists
 * (for example after an interrupted migration) it is kept unchanged.
 */
export const ensurePremigrationSnapshot = async (fromSchemaVersion: number): Promise<PremigrationSnapshot> => {
    const existing = await readRaw(KEYS.premigrationSnapshot);
    if (existing !== null) {
        try {
            return JSON.parse(existing) as PremigrationSnapshot;
        } catch {
            // An unparsable snapshot can only come from an interrupted first
            // write; the source data has not been modified yet, so rewrite it.
        }
    }
    const raw: Record<string, string | null> = {};
    for (const key of SNAPSHOT_KEYS) {
        raw[key] = await readRaw(key);
    }
    const setup = await readJson<Record<string, unknown> | null>(KEYS.setup, null);
    let setupWithoutPin: Record<string, unknown> | null = null;
    if (setup && typeof setup === "object") {
        const { pin: _pin, ...rest } = setup;
        setupWithoutPin = rest;
    }
    const snapshot: PremigrationSnapshot = {
        kind: "my-mandal-premigration-snapshot",
        createdAt: new Date().toISOString(),
        fromSchemaVersion,
        raw,
        setupWithoutPin,
    };
    const serialized = JSON.stringify(snapshot);
    await AsyncStorage.setItem(KEYS.premigrationSnapshot, serialized);
    const readBack = await readRaw(KEYS.premigrationSnapshot);
    if (readBack !== serialized) {
        throw new Error("Pre-migration snapshot could not be verified. Migration stopped; data unchanged.");
    }
    return snapshot;
};

const earliest = (items: YearMonth[]): YearMonth | null =>
    items.reduce<YearMonth | null>((min, item) => (!min || compareYearMonth(item, min) < 0 ? item : min), null);

/** Pure plan for schema v2: only adds fields, never changes existing values. */
export const planMigrationV2 = (state: FinancialState, nowIso: string): { members: Member[]; settings: MandalSettings } => {
    const mandalStart =
        state.settings.mandalStartYear && state.settings.mandalStartMonth
            ? { year: state.settings.mandalStartYear, month: state.settings.mandalStartMonth }
            : earliest(state.obligations.map((o) => ({ year: o.year, month: o.month })));

    const members = state.members.map((member) => {
        const own = state.obligations.filter((o) => o.memberId === member.id);
        const existingStart =
            member.obligationStartYear && member.obligationStartMonth
                ? { year: member.obligationStartYear, month: member.obligationStartMonth }
                : null;
        const start = existingStart ?? earliest(own.map((o) => ({ year: o.year, month: o.month }))) ?? mandalStart;
        const next: Member = { ...member };
        if (!existingStart && start) {
            next.obligationStartYear = start.year;
            next.obligationStartMonth = start.month;
        }
        if (!next.installmentSchedule) {
            next.installmentSchedule = deriveLegacySchedule(member, own, start);
        }
        if (!next.membershipStatus) {
            // The original app's isActive flag was only a UI toggle. Every
            // existing member is treated as active; closure is explicit.
            next.membershipStatus = "active";
        }
        return next;
    });

    const settings: MandalSettings = {
        ...state.settings,
        migratedAt: state.settings.migratedAt ?? nowIso,
    };
    if (mandalStart && !settings.mandalStartYear) {
        settings.mandalStartYear = mandalStart.year;
        settings.mandalStartMonth = mandalStart.month;
    }
    return { members, settings };
};

export type MigrationReport = {
    journalReplayed: boolean;
    fromVersion: number;
    toVersion: number;
    snapshotCreated: boolean;
    freshInstall: boolean;
};

/**
 * Brings stored data to CURRENT_SCHEMA_VERSION. Safe to run on every start:
 * idempotent, journaled, and recoverable if interrupted at any point.
 */
export const runMigrations = async (now: Date = new Date()): Promise<MigrationReport> => {
    const journal = await recoverJournal();
    return withStorageLock(async () => {
        const fromVersion = await readSchemaVersion();
        const report: MigrationReport = {
            journalReplayed: journal.replayed,
            fromVersion,
            toVersion: fromVersion,
            snapshotCreated: false,
            freshInstall: false,
        };
        if (fromVersion >= CURRENT_SCHEMA_VERSION) {
            return report;
        }

        const hasAnyData =
            (await readRaw(KEYS.members)) !== null ||
            (await readRaw(KEYS.obligations)) !== null ||
            (await readRaw(KEYS.payments)) !== null ||
            (await readRaw(KEYS.setup)) !== null;

        if (hasAnyData) {
            const hadSnapshot = (await readRaw(KEYS.premigrationSnapshot)) !== null;
            await ensurePremigrationSnapshot(fromVersion);
            report.snapshotCreated = !hadSnapshot;
        } else {
            report.freshInstall = true;
        }

        // Throws StorageReadError for corrupt data; nothing has been changed.
        const state = await readFinancialStateUnlocked();
        const plan = planMigrationV2(state, now.toISOString());

        await commitJournaled("migration-v2", {
            [KEYS.members]: state.members.length > 0 || (await readRaw(KEYS.members)) !== null ? JSON.stringify(plan.members) : null,
            [KEYS.settings]: JSON.stringify(plan.settings),
            [KEYS.schemaVersion]: String(CURRENT_SCHEMA_VERSION),
        });
        report.toVersion = CURRENT_SCHEMA_VERSION;
        return report;
    });
};

export const readPremigrationSnapshot = async (): Promise<PremigrationSnapshot | null> =>
    readJson<PremigrationSnapshot | null>(KEYS.premigrationSnapshot, null);
