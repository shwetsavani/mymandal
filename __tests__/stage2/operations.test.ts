import { computeObligation, sumSummaries } from "../../src/domain/financeEngine";
import {
    addWaiver,
    cancelInstallmentChange,
    checkMembershipClosure,
    closeMembership,
    correctPaymentDate,
    FinanceError,
    generateObligations,
    previewMonthReset,
    recordPayment,
    resetMonthPayments,
    reversePayment,
    scheduleInstallmentChange,
    setPaymentAllocation,
    summarize,
    summarizeAll,
} from "../../src/domain/operations";
import type { FinancialState } from "../../src/domain/types";
import { ist, member, obligation, payment, state } from "../fixtures/builders";

const NOW = ist(2026, 10, 29, 12);

const base = (): FinancialState => {
    const m1 = member("m1", 1000);
    const m2 = member("m2", 500);
    const obligations = [
        obligation("m1", 2026, 9, 1000),
        obligation("m1", 2026, 10, 1000),
        obligation("m2", 2026, 9, 500),
        obligation("m2", 2026, 10, 500),
    ];
    return state({
        members: [m1, m2],
        obligations,
        payments: [
            payment(obligations[0], 1000, ist(2026, 9, 5, 10)),
            payment(obligations[2], 500, ist(2026, 9, 6, 10)),
        ],
    });
};

const pay = (s: FinancialState, extra: Partial<Parameters<typeof recordPayment>[1]>) =>
    recordPayment(
        s,
        {
            idempotencyKey: `k-${Math.random()}`,
            memberId: "m1",
            year: 2026,
            month: 10,
            receivedAt: NOW,
            amountPaise: 0,
            principalPaise: 0,
            penaltyPaise: 0,
            mode: "manual",
            ...extra,
        },
        NOW
    );

describe("payments", () => {
    test("Pay Full Amount creates ONE transaction with the allocation inside it", () => {
        const s = base();
        const o = s.obligations[1];
        const due = summarize(s, o, NOW);
        expect(due.totalOutstandingPaise).toBe(160000);
        const r = pay(s, { mode: "full", amountPaise: 160000, principalPaise: 100000, penaltyPaise: 60000 });
        const added = r.state.payments.filter((p) => p.obligationId === o.id);
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({ amountPaise: 160000, principalPaise: 100000, penaltyPaise: 60000, allocationSource: "full", actualCollectedAmount: 1600 });
        expect(summarize(r.state, o, NOW).status).toBe("settled");
        expect(summarize(r.state, o, ist(2027, 6, 1)).totalOutstandingPaise).toBe(0);
    });

    test("a stale full amount is rejected at commit time", () => {
        expect(() => pay(base(), { mode: "full", amountPaise: 140000, principalPaise: 100000, penaltyPaise: 40000 })).toThrow(FinanceError);
    });

    test("manual allocation validation", () => {
        const s = base();
        expect(() => pay(s, { amountPaise: 50000, principalPaise: 30000, penaltyPaise: 10000 })).toThrow(/add up/);
        expect(() => pay(s, { amountPaise: 110000, principalPaise: 110000, penaltyPaise: 0 })).toThrow(/installment outstanding/);
        expect(() => pay(s, { amountPaise: 70000, principalPaise: 0, penaltyPaise: 70000 })).toThrow(/penalty outstanding/);
        expect(() => pay(s, { amountPaise: -100, principalPaise: -100, penaltyPaise: 0 })).toThrow(FinanceError);
        expect(() => pay(s, { amountPaise: 0, principalPaise: 0, penaltyPaise: 0 })).toThrow(FinanceError);
        expect(() => pay(s, { amountPaise: 1.5, principalPaise: 1.5, penaltyPaise: 0 })).toThrow(FinanceError);
        expect(() => pay(s, { amountPaise: 1000, principalPaise: 1000, penaltyPaise: 0, receivedAt: NOW + 86400000 })).toThrow(/future/);
        const ok = pay(s, { amountPaise: 70000, principalPaise: 50000, penaltyPaise: 20000 });
        const after = summarize(ok.state, s.obligations[1], NOW);
        expect(after.principalOutstandingPaise).toBe(50000);
        expect(after.penaltyOutstandingPaise).toBe(40000);
    });

    test("allocation is validated against the balance on the received date", () => {
        // On Oct 10 no penalty existed yet, so a penalty part is invalid.
        expect(() =>
            pay(base(), { amountPaise: 20000, principalPaise: 0, penaltyPaise: 20000, receivedAt: ist(2026, 10, 10) })
        ).toThrow(/penalty outstanding/);
    });

    test("duplicate submission with the same identifier records one payment", () => {
        const s = base();
        const input = { idempotencyKey: "same", memberId: "m1", year: 2026, month: 10, receivedAt: NOW, amountPaise: 10000, principalPaise: 10000, penaltyPaise: 0, mode: "simple" as const };
        const first = recordPayment(s, input, NOW);
        const second = recordPayment(first.state, input, NOW);
        expect(second.duplicate).toBe(true);
        expect(second.state).toBe(first.state);
        expect(second.state.payments).toHaveLength(3);
    });

    test("the administrator's chosen month is used (no automatic oldest-first)", () => {
        let s = base();
        s = { ...s, payments: s.payments.filter((p) => p.obligationId !== "m1-2026-9") };
        const r = pay(s, { month: 10, amountPaise: 100000, principalPaise: 100000, penaltyPaise: 0, receivedAt: ist(2026, 10, 10) });
        expect(summarize(r.state, r.state.obligations[0], NOW).principalOutstandingPaise).toBe(100000);
        expect(summarize(r.state, r.state.obligations[1], NOW).principalOutstandingPaise).toBe(0);
    });

    test("selected arrears month can be paid later with its accrued penalty", () => {
        let s = base();
        s = { ...s, payments: s.payments.filter((p) => p.obligationId !== "m1-2026-9") };
        const sep = summarize(s, s.obligations[0], NOW);
        // September: Sep 16/21/26 + Oct 1/6/11/16/21/26 = 9 x ₹200
        expect(sep.penaltyOutstandingPaise).toBe(180000);
        const r = pay(s, { month: 9, mode: "full", amountPaise: 280000, principalPaise: 100000, penaltyPaise: 180000 });
        expect(summarize(r.state, r.state.obligations[0], NOW).status).toBe("settled");
    });

    test("advance payment for a future month avoids that month's penalty", () => {
        const r = pay(base(), { month: 12, amountPaise: 100000, principalPaise: 100000, penaltyPaise: 0 });
        const dec = r.state.obligations.find((o) => o.id === "m1-2026-12")!;
        expect(dec.generatedBy).toBe("advance");
        expect(summarize(r.state, dec, ist(2026, 12, 28)).totalOutstandingPaise).toBe(0);
        expect(summarize(r.state, dec, NOW).status).toBe("settled");
        expect(() => pay(base(), { year: 2028, month: 1, amountPaise: 100, principalPaise: 100, penaltyPaise: 0 })).toThrow(/ahead/);
    });

    test("an unpaid future month is upcoming, not overdue", () => {
        const s = generateObligations(base(), NOW).state;
        const nov = { ...obligation("m1", 2026, 11, 1000) };
        expect(computeObligation({ obligation: nov, payments: s.payments, waivers: [], asOf: NOW }).status).toBe("upcoming");
    });
});

describe("Tarul regression (test data only)", () => {
    test("reversing the mistaken ₹400 October payment", () => {
        let s = base();
        const oct = s.obligations[1];
        const mistaken = payment(oct, 400, ist(2026, 10, 8, 12));
        s = { ...s, payments: [...s.payments, mistaken] };
        const othersBefore = s.obligations.filter((o) => o.id !== oct.id).map((o) => summarize(s, o, NOW));
        const sepPaymentBefore = JSON.stringify(s.payments[0]);

        s = reversePayment(s, mistaken.id, "Entered by mistake, no money received", NOW);
        const after = summarize(s, oct, ist(2026, 10, 29, 9));
        expect(after.cashCollectedPaise).toBe(0);
        expect(after.principalOutstandingPaise).toBe(100000);
        expect(after.penaltyOutstandingPaise).toBe(60000);
        expect(after.totalOutstandingPaise).toBe(160000);
        expect(after.reversedPaise).toBe(40000);
        // Not hardcoded: it continues to accrue.
        expect(summarize(s, oct, ist(2026, 11, 1)).totalOutstandingPaise).toBe(180000);

        const othersAfter = s.obligations.filter((o) => o.id !== oct.id).map((o) => summarize(s, o, NOW));
        expect(othersAfter).toEqual(othersBefore);
        expect(JSON.stringify(s.payments[0])).toBe(sepPaymentBefore);
        const kept = s.payments.find((p) => p.id === mistaken.id)!;
        expect(kept).toMatchObject({ status: "reversed", actualCollectedAmount: 400, paidAt: mistaken.paidAt });
        expect(s.auditLog.some((e) => e.action === "payment_reversed" && e.paymentId === mistaken.id)).toBe(true);
        expect(s.waivers).toHaveLength(0);
    });
});

describe("month reset", () => {
    test("reverses only the selected member's selected month", () => {
        let s = base();
        s = pay(s, { amountPaise: 30000, principalPaise: 30000, penaltyPaise: 0, receivedAt: ist(2026, 10, 3) }).state;
        s = pay(s, { amountPaise: 20000, principalPaise: 20000, penaltyPaise: 0, receivedAt: ist(2026, 10, 4) }).state;
        s = pay(s, { memberId: "m2", amountPaise: 50000, principalPaise: 50000, penaltyPaise: 0, receivedAt: ist(2026, 10, 4) }).state;
        s = addWaiver(s, { idempotencyKey: "w1", memberId: "m1", year: 2026, month: 10, principalPaise: 0, penaltyPaise: 10000, reason: "goodwill" }, NOW).state;
        const before = JSON.stringify(s.payments.filter((p) => p.obligationId !== "m1-2026-10"));
        const preview = previewMonthReset(s, "m1", { year: 2026, month: 10 });
        expect(preview.payments).toHaveLength(2);
        expect(preview.totalPaise).toBe(50000);
        expect(() => resetMonthPayments(s, "m1", { year: 2026, month: 10 }, "", NOW)).toThrow(/reason/);

        const r = resetMonthPayments(s, "m1", { year: 2026, month: 10 }, "Wrong entries", NOW);
        expect(r.reversedCount).toBe(2);
        expect(JSON.stringify(r.state.payments.filter((p) => p.obligationId !== "m1-2026-10"))).toBe(before);
        expect(r.state.payments).toHaveLength(s.payments.length);
        expect(r.state.obligations).toEqual(s.obligations);
        expect(r.state.waivers).toEqual(s.waivers);
        const oct = summarize(r.state, r.state.obligations[1], NOW);
        expect(oct.principalCollectedPaise).toBe(0);
        expect(oct.penaltyWaivedPaise).toBe(10000);
        expect(oct.penaltyOutstandingPaise).toBe(50000);
        expect(r.state.auditLog.some((e) => e.action === "month_reset")).toBe(true);
    });
});

describe("single payment corrections", () => {
    test("allocation correction keeps amount and date; history is kept", () => {
        let s = base();
        s = pay(s, { amountPaise: 70000, principalPaise: 70000, penaltyPaise: 0 }).state;
        const p = s.payments[s.payments.length - 1];
        s = setPaymentAllocation(s, p.id, 50000, 20000, "Split was wrong", NOW);
        const updated = s.payments.find((x) => x.id === p.id)!;
        expect(updated).toMatchObject({ amountPaise: 70000, actualCollectedAmount: 700, paidAt: p.paidAt, principalPaise: 50000, penaltyPaise: 20000 });
        expect(updated.corrections![0]).toMatchObject({ previousPrincipalPaise: 70000, previousPenaltyPaise: 0 });
        expect(() => setPaymentAllocation(s, p.id, 50000, 10000, "bad", NOW)).toThrow(/add up/);
    });

    test("legacy ambiguous payment can be classified without changing amount or date", () => {
        let s = base();
        const oct = s.obligations[1];
        const legacy = payment(oct, 1100, ist(2026, 10, 17));
        s = { ...s, payments: [...s.payments, legacy] };
        expect(summarize(s, oct, NOW).status).toBe("needs_review");
        expect(() => pay(s, { amountPaise: 100, principalPaise: 100, penaltyPaise: 0 })).toThrow(/Classify/);
        s = setPaymentAllocation(s, legacy.id, 100000, 10000, "Confirmed with member", NOW);
        const classified = s.payments.find((x) => x.id === legacy.id)!;
        expect(classified).toMatchObject({ actualCollectedAmount: 1100, paidAt: legacy.paidAt, allocationSource: "classified" });
        const sum = summarize(s, oct, NOW);
        expect(sum.reliable).toBe(true);
        // ₹100 penalty left after Oct 17; Oct 21 and Oct 26 add ₹100 each.
        expect(sum.penaltyOutstandingPaise).toBe(30000);
        expect(s.auditLog.some((e) => e.action === "legacy_payment_classified")).toBe(true);
    });

    test("date correction never changes the amount", () => {
        let s = base();
        s = pay(s, { amountPaise: 100000, principalPaise: 100000, penaltyPaise: 0, receivedAt: ist(2026, 10, 20) }).state;
        const p = s.payments[s.payments.length - 1];
        s = correctPaymentDate(s, p.id, ist(2026, 10, 12), "Typed wrong date", NOW);
        const updated = s.payments.find((x) => x.id === p.id)!;
        expect(updated.actualCollectedAmount).toBe(1000);
        expect(updated.corrections![0].previousPaidAt).toBe(p.paidAt);
        expect(summarize(s, s.obligations[1], NOW).totalOutstandingPaise).toBe(0);
    });
});

describe("waivers", () => {
    test("validated against outstanding and idempotent", () => {
        const s = base();
        expect(() =>
            addWaiver(s, { idempotencyKey: "a", memberId: "m1", year: 2026, month: 10, principalPaise: 0, penaltyPaise: 70000, reason: "x" }, NOW)
        ).toThrow(/reason/);
        expect(() =>
            addWaiver(s, { idempotencyKey: "a", memberId: "m1", year: 2026, month: 10, principalPaise: 0, penaltyPaise: 70000, reason: "too much" }, NOW)
        ).toThrow(/more than/);
        const r = addWaiver(s, { idempotencyKey: "a", memberId: "m1", year: 2026, month: 10, principalPaise: 100000, penaltyPaise: 60000, reason: "Hardship" }, NOW);
        expect(addWaiver(r.state, { idempotencyKey: "a", memberId: "m1", year: 2026, month: 10, principalPaise: 1, penaltyPaise: 0, reason: "dup" }, NOW).duplicate).toBe(true);
        const sum = summarize(r.state, s.obligations[1], ist(2027, 1, 1));
        expect(sum.totalOutstandingPaise).toBe(0);
        expect(sum.cashCollectedPaise).toBe(0);
        expect(sum.penaltyCollectedPaise).toBe(0);
    });
});

describe("obligation generation", () => {
    test("creates every missed month idempotently, with the right installment", () => {
        let s = base();
        s = { ...s, members: s.members.map((m) => (m.id === "m2" ? { ...m, pendingMonthlyInstallment: 1000, pendingInstallmentEffectiveYear: 2026, pendingInstallmentEffectiveMonth: 12, installmentSchedule: [{ year: 2026, month: 9, amount: 500 }, { year: 2026, month: 12, amount: 1000 }] } : m)) };
        const jan = ist(2027, 1, 15);
        const r = generateObligations(s, jan);
        expect(r.created.map((o) => o.id).sort()).toEqual(
            ["m1-2026-11", "m1-2026-12", "m1-2027-1", "m2-2026-11", "m2-2026-12", "m2-2027-1"].sort()
        );
        const amounts = Object.fromEntries(r.state.obligations.map((o) => [o.id, o.originalInstallment]));
        expect(amounts["m2-2026-10"]).toBe(500);
        expect(amounts["m2-2026-11"]).toBe(500);
        expect(amounts["m2-2026-12"]).toBe(1000);
        expect(r.state.members.find((m) => m.id === "m2")!.monthlyInstallment).toBe(1000);
        expect(r.state.members.find((m) => m.id === "m2")!.pendingMonthlyInstallment).toBeUndefined();
        const again = generateObligations(r.state, jan);
        expect(again.created).toHaveLength(0);
        expect(again.state).toBe(r.state);
        // Penalties accrue for missed months even though the app was not opened.
        const nov = r.state.obligations.find((o) => o.id === "m1-2026-11")!;
        expect(summarize(r.state, nov, jan).penaltyChargedPaise).toBeGreaterThan(0);
    });

    test("existing obligations keep their historical amounts", () => {
        const s = base();
        const r = generateObligations(s, ist(2027, 1, 15));
        expect(r.state.obligations.slice(0, 4)).toEqual(s.obligations);
    });
});

describe("installment changes", () => {
    test("scheduled change is visible and cancellable before it takes effect", () => {
        let s = scheduleInstallmentChange(base(), "m1", 500, NOW);
        const m1 = s.members[0];
        expect(m1).toMatchObject({ monthlyInstallment: 1000, pendingMonthlyInstallment: 500, pendingInstallmentEffectiveYear: 2026, pendingInstallmentEffectiveMonth: 11 });
        s = cancelInstallmentChange(s, "m1", NOW);
        expect(s.members[0].pendingMonthlyInstallment).toBeUndefined();
        const nov = generateObligations(s, ist(2026, 11, 2)).state.obligations.find((o) => o.id === "m1-2026-11")!;
        expect(nov.originalInstallment).toBe(1000);
    });

    test("re-entering the current amount cancels a pending change", () => {
        let s = scheduleInstallmentChange(base(), "m1", 500, NOW);
        s = scheduleInstallmentChange(s, "m1", 1000, NOW);
        expect(s.members[0].pendingMonthlyInstallment).toBeUndefined();
    });
});

describe("membership closure", () => {
    test("blocked while dues remain, allowed after settlement or waiver, stops future obligations", () => {
        let s = base();
        expect(checkMembershipClosure(s, "m1", NOW).canClose).toBe(false);
        expect(() => closeMembership(s, "m1", "Leaving", NOW)).toThrow(/settled or waived/);
        s = addWaiver(s, { idempotencyKey: "x", memberId: "m1", year: 2026, month: 10, principalPaise: 0, penaltyPaise: 60000, reason: "Leaving" }, NOW).state;
        s = pay(s, { amountPaise: 100000, principalPaise: 100000, penaltyPaise: 0 }).state;
        s = closeMembership(s, "m1", "Moving away", NOW);
        expect(s.members[0]).toMatchObject({ membershipStatus: "closed", closedThroughYear: 2026, closedThroughMonth: 10 });
        const later = generateObligations(s, ist(2027, 3, 1));
        expect(later.created.filter((o) => o.memberId === "m1")).toHaveLength(0);
        expect(later.created.filter((o) => o.memberId === "m2").length).toBe(5);
    });
});

describe("shared totals", () => {
    test("month totals equal the sum of member rows and of valid payments", () => {
        let s = base();
        s = pay(s, { amountPaise: 70000, principalPaise: 50000, penaltyPaise: 20000 }).state;
        s = reversePayment(s, s.payments[0].id, "test reversal", NOW);
        const summaries = summarizeAll(s, NOW);
        const totals = sumSummaries(summaries);
        const validCash = s.payments.filter((p) => p.status !== "reversed").reduce((sum, p) => sum + (p.amountPaise ?? Math.round(p.actualCollectedAmount * 100)), 0);
        expect(totals.cashCollectedPaise).toBe(validCash);
        expect(totals.principalCollectedPaise + totals.penaltyCollectedPaise + totals.unclassifiedPaise + totals.excessPaise).toBe(validCash);
        expect(totals.totalOutstandingPaise).toBe(totals.principalOutstandingPaise + totals.penaltyOutstandingPaise);
        expect(totals.penaltyChargedPaise).toBe(totals.penaltyCollectedPaise + totals.penaltyWaivedPaise + totals.penaltyOutstandingPaise);
        expect(totals.reversedCount).toBe(1);
    });
});
