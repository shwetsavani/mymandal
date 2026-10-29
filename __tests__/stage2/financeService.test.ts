import AsyncStorage from "@react-native-async-storage/async-storage";

import { summarize } from "../../src/domain/operations";
import { KEYS } from "../../src/storage/keys";
import { runMigrations } from "../../src/storage/migrations";
import { loadFinancialState } from "../../src/storage/repository";
import { recoverJournal } from "../../src/storage/safeStorage";
import { submitMonthReset, submitPayment, submitPaymentReversal } from "../../src/services/financeService";
import { ist } from "../fixtures/builders";
import { seedLegacyStorage } from "../fixtures/legacyDataset";
import { crashAfterWrites, resetStores } from "../helpers";

beforeEach(async () => {
    await resetStores();
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    jest.setSystemTime(ist(2026, 10, 29, 12));
});
afterEach(() => jest.useRealTimers());

const input = (key: string, rupees: number, memberId = "m3") => ({
    idempotencyKey: key,
    memberId,
    year: 2026,
    month: 10,
    receivedAt: ist(2026, 10, 29, 11),
    amountPaise: rupees * 100,
    principalPaise: rupees * 100,
    penaltyPaise: 0,
    mode: "manual" as const,
});

describe("finance service on migrated legacy data", () => {
    test("concurrent payments are all kept (no lost updates)", async () => {
        await seedLegacyStorage();
        await runMigrations();
        await Promise.all([submitPayment(input("a", 100)), submitPayment(input("b", 100, "m4")), submitPayment(input("c", 100, "m5"))]);
        const s = await loadFinancialState();
        expect(s.payments.filter((p) => ["a", "b", "c"].includes(p.idempotencyKey ?? ""))).toHaveLength(3);
        expect(s.payments).toHaveLength(13);
    });

    test("double-tap with the same identifier stores one payment", async () => {
        await seedLegacyStorage();
        await runMigrations();
        const [first, second] = await Promise.all([submitPayment(input("same", 100)), submitPayment(input("same", 100))]);
        expect(first.duplicate).toBe(false);
        expect(second.duplicate).toBe(true);
        expect((await loadFinancialState()).payments.filter((p) => p.idempotencyKey === "same")).toHaveLength(1);
    });

    test("Tarul reversal through storage leaves every other record byte-identical", async () => {
        await seedLegacyStorage();
        await runMigrations();
        const before = await loadFinancialState();
        await submitPaymentReversal("p-oct-m1", "Entered by mistake");
        const after = await loadFinancialState();
        expect(after.payments.filter((p) => p.id !== "p-oct-m1")).toEqual(before.payments.filter((p) => p.id !== "p-oct-m1"));
        expect(after.obligations).toEqual(before.obligations);
        const oct = after.obligations.find((o) => o.id === "m1-2026-10")!;
        expect(summarize(after, oct, ist(2026, 10, 29, 9)).totalOutstandingPaise).toBe(160000);
        const sep = after.obligations.find((o) => o.id === "m1-2026-9")!;
        expect(summarize(after, sep, Date.now()).status).toBe("settled");
    });

    test("an interrupted month reset is completed by journal replay, not half-applied", async () => {
        await seedLegacyStorage();
        await runMigrations();
        await submitPayment(input("x1", 100));
        await submitPayment({ ...input("x2", 100), receivedAt: ist(2026, 10, 29, 11, 30) });
        // journal write succeeds, payments key fails
        const restore = crashAfterWrites(1);
        await expect(submitMonthReset("m3", { year: 2026, month: 10 }, "Wrong entries")).rejects.toThrow();
        restore();
        expect(await AsyncStorage.getItem(KEYS.journal)).not.toBeNull();
        await recoverJournal();
        const s = await loadFinancialState();
        const oct = s.payments.filter((p) => p.obligationId === "m3-2026-10");
        expect(oct.every((p) => p.status === "reversed")).toBe(true);
        expect(s.auditLog.some((e) => e.action === "month_reset")).toBe(true);
    });
});
