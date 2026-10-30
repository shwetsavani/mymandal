import AsyncStorage from "@react-native-async-storage/async-storage";

import { KEYS } from "../../src/storage/keys";
import { readPremigrationSnapshot, runMigrations } from "../../src/storage/migrations";
import { loadFinancialState } from "../../src/storage/repository";
import { StorageReadError } from "../../src/storage/safeStorage";
import { seedLegacyStorage } from "../fixtures/legacyDataset";
import { crashAfterWrites, dumpStorage, resetStores } from "../helpers";

beforeEach(resetStores);

describe("schema v2 migration on a populated legacy dataset", () => {
    test("preserves every obligation and payment byte-for-byte and only adds member fields", async () => {
        const raw = await seedLegacyStorage();
        const report = await runMigrations(new Date("2026-10-29T06:00:00Z"));
        expect(report).toMatchObject({ fromVersion: 1, toVersion: 2, snapshotCreated: true });

        expect(await AsyncStorage.getItem(KEYS.obligations)).toBe(raw.mandal_monthly_obligations);
        expect(await AsyncStorage.getItem(KEYS.payments)).toBe(raw.mandal_payments);

        const before = JSON.parse(raw.mandal_members) as Record<string, unknown>[];
        const state = await loadFinancialState();
        expect(state.members).toHaveLength(8);
        state.members.forEach((member, i) => {
            for (const [key, value] of Object.entries(before[i])) {
                expect((member as unknown as Record<string, unknown>)[key]).toEqual(value);
            }
            expect(member.membershipStatus).toBe("active");
            expect(member.obligationStartYear).toBe(2026);
            expect(member.obligationStartMonth).toBe(9);
        });
        expect(state.settings).toMatchObject({ mandalStartYear: 2026, mandalStartMonth: 9 });

        const gopi = state.members.find((m) => m.id === "m8")!;
        expect(gopi.installmentSchedule).toEqual([
            { year: 2026, month: 9, amount: 1000 },
            { year: 2026, month: 11, amount: 500 },
        ]);
        expect(await AsyncStorage.getItem(KEYS.schemaVersion)).toBe("2");
    });

    test("creates an immutable snapshot of the original raw data without the PIN", async () => {
        const raw = await seedLegacyStorage();
        await runMigrations();
        const snapshot = await readPremigrationSnapshot();
        expect(snapshot!.raw[KEYS.members]).toBe(raw.mandal_members);
        expect(snapshot!.raw[KEYS.payments]).toBe(raw.mandal_payments);
        expect(snapshot!.raw[KEYS.obligations]).toBe(raw.mandal_monthly_obligations);
        expect(JSON.stringify(snapshot)).not.toContain("4826");
        expect(snapshot!.setupWithoutPin).toMatchObject({ mandalName: "Test Mandal" });

        const firstSnapshot = await AsyncStorage.getItem(KEYS.premigrationSnapshot);
        await AsyncStorage.removeItem(KEYS.schemaVersion);
        await runMigrations();
        expect(await AsyncStorage.getItem(KEYS.premigrationSnapshot)).toBe(firstSnapshot);
    });

    test("is idempotent", async () => {
        await seedLegacyStorage();
        await runMigrations();
        const afterFirst = await dumpStorage();
        const second = await runMigrations();
        expect(second.toVersion).toBe(2);
        expect(await dumpStorage()).toEqual(afterFirst);
    });

    test.each([0, 1, 2, 3, 4])("recovers when interrupted after %i writes and produces the same result", async (writes) => {
        const raw = await seedLegacyStorage();
        const restore = crashAfterWrites(writes);
        await runMigrations().catch(() => undefined);
        restore();
        // Original financial data is never lost at any interruption point.
        expect(await AsyncStorage.getItem(KEYS.payments)).toBe(raw.mandal_payments);
        expect(await AsyncStorage.getItem(KEYS.obligations)).toBe(raw.mandal_monthly_obligations);

        await runMigrations();
        const interrupted = await dumpStorage();

        await resetStores();
        await seedLegacyStorage();
        await runMigrations();
        const clean = await dumpStorage();

        const strip = (dump: Record<string, string | null>) => {
            const copy = { ...dump };
            delete copy[KEYS.premigrationSnapshot];
            copy[KEYS.settings] = JSON.stringify({ ...JSON.parse(copy[KEYS.settings]!), migratedAt: "x" });
            return copy;
        };
        expect(strip(interrupted)).toEqual(strip(clean));
    });

    test("stops on corrupt data without changing anything", async () => {
        await seedLegacyStorage();
        await AsyncStorage.setItem(KEYS.payments, "[{broken");
        const before = await dumpStorage();
        await expect(runMigrations()).rejects.toBeInstanceOf(StorageReadError);
        const after = await dumpStorage();
        delete after[KEYS.premigrationSnapshot];
        expect(after).toEqual(before);
        expect(await AsyncStorage.getItem(KEYS.schemaVersion)).toBeNull();
    });

    test("a fresh install migrates without inventing records", async () => {
        const report = await runMigrations();
        expect(report.freshInstall).toBe(true);
        const state = await loadFinancialState();
        expect(state.members).toEqual([]);
        expect(await AsyncStorage.getItem(KEYS.premigrationSnapshot)).toBeNull();
    });
});
