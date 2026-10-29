import AsyncStorage from "@react-native-async-storage/async-storage";

import { buildBackup, parseAndValidateBackup, validateBackup } from "../../src/backup/backupFormat";
import { applyRestore, listRestoreSnapshots, RestoreBlockedError } from "../../src/backup/restore";
import { checkPin, migratePlaintextPin } from "../../src/security/pinVerifier";
import { KEYS } from "../../src/storage/keys";
import { runMigrations } from "../../src/storage/migrations";
import { loadFinancialState, readSetup } from "../../src/storage/repository";
import { recoverJournal } from "../../src/storage/safeStorage";
import { LEGACY_PIN, seedLegacyStorage } from "../fixtures/legacyDataset";
import { crashAfterWrites, resetStores } from "../helpers";

beforeEach(resetStores);

const makeBackup = async () => {
    await seedLegacyStorage();
    await runMigrations();
    const state = await loadFinancialState();
    return buildBackup({ state, setup: await readSetup(), appVersion: "1.1.0", schemaVersion: 2 });
};

describe("JSON backup format", () => {
    test("round-trips, excludes credentials and reports totals", async () => {
        const backup = await makeBackup();
        const json = JSON.stringify(backup);
        expect(json).not.toContain(LEGACY_PIN);
        expect(json).not.toContain("\"pin\"");
        const validation = parseAndValidateBackup(json);
        expect(validation.errors).toEqual([]);
        expect(validation.ok).toBe(true);
        expect(backup.counts).toMatchObject({ members: 8, obligations: 16, payments: 10 });
        // 3 x 500 + 5 x 1000 for September, 400 + 1199.50 for October
        expect(backup.totalReceivedPaise).toBe(650000 + 40000 + 119950);
    });

    test("detects tampering, broken relationships and bad money values", async () => {
        const backup = await makeBackup();
        const tampered = JSON.parse(JSON.stringify(backup));
        tampered.data.payments[0].actualCollectedAmount = 5;
        expect(validateBackup(tampered).errors.join()).toContain("Checksum");

        const orphan = JSON.parse(JSON.stringify(backup));
        orphan.data.payments[0].obligationId = "missing";
        const { sha256Hex } = jest.requireActual("../../src/domain/checksum");
        orphan.checksum = sha256Hex(JSON.stringify(orphan.data));
        expect(validateBackup(orphan).errors.join()).toContain("missing obligation");

        const negative = JSON.parse(JSON.stringify(backup));
        negative.data.payments[0].actualCollectedAmount = -10;
        negative.checksum = sha256Hex(JSON.stringify(negative.data));
        expect(validateBackup(negative).ok).toBe(false);

        const dupe = JSON.parse(JSON.stringify(backup));
        dupe.data.members.push(dupe.data.members[0]);
        dupe.checksum = sha256Hex(JSON.stringify(dupe.data));
        expect(validateBackup(dupe).errors.join()).toContain("Duplicate member");

        expect(parseAndValidateBackup("not json").ok).toBe(false);
        expect(parseAndValidateBackup("{\"format\":\"other\"}").ok).toBe(false);
    });
});

describe("restore", () => {
    test("restores, keeps a recovery snapshot and does not touch the PIN", async () => {
        const backup = await makeBackup();
        await migratePlaintextPin();
        // Local data changes after the backup.
        const state = await loadFinancialState();
        await AsyncStorage.setItem(KEYS.payments, JSON.stringify([...state.payments, { ...state.payments[0], id: "extra" }]));

        await expect(applyRestore(backup, { confirmedDestructive: false, reason: "test" })).rejects.toMatchObject({
            needsConfirmation: true,
        });
        await applyRestore(backup, { confirmedDestructive: true, reason: "test" });
        const restored = await loadFinancialState();
        expect(restored.payments).toHaveLength(10);
        const snapshots = await listRestoreSnapshots();
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].data.payments).toHaveLength(11);
        expect(await checkPin(LEGACY_PIN)).toBe(true);
    });

    test("an empty backup is blocked without explicit confirmation", async () => {
        await seedLegacyStorage();
        await runMigrations();
        const empty = buildBackup({
            state: { members: [], obligations: [], payments: [], waivers: [], auditLog: [], settings: {} },
            setup: null,
            appVersion: "1.1.0",
            schemaVersion: 2,
        });
        await expect(applyRestore(empty, { confirmedDestructive: false, reason: "t" })).rejects.toBeInstanceOf(
            RestoreBlockedError
        );
        expect((await loadFinancialState()).members).toHaveLength(8);
    });

    test("an invalid backup is rejected at commit time even if previewed earlier", async () => {
        const backup = await makeBackup();
        backup.data.payments[0].actualCollectedAmount = 1;
        await expect(applyRestore(backup, { confirmedDestructive: true, reason: "t" })).rejects.toBeInstanceOf(
            RestoreBlockedError
        );
    });

    test("an interrupted restore completes from the journal on next start", async () => {
        const backup = await makeBackup();
        backup.data.members[0] = { ...backup.data.members[0] };
        const local = await loadFinancialState();
        await AsyncStorage.setItem(KEYS.payments, JSON.stringify(local.payments.slice(0, 3)));
        const restore = crashAfterWrites(3);
        await expect(applyRestore(backup, { confirmedDestructive: true, reason: "t" })).rejects.toThrow();
        restore();
        await recoverJournal();
        expect((await loadFinancialState()).payments).toHaveLength(10);
        expect(await AsyncStorage.getItem(KEYS.journal)).toBeNull();
    });
});
