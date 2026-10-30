import { daysInMonth, penaltyBoundaries } from "../../src/domain/calendar";
import { boundaryCharge, computeObligation } from "../../src/domain/financeEngine";
import { ist, obligation, payment, waiver } from "../fixtures/builders";

const total = (amount: number, at: number, payments: ReturnType<typeof payment>[] = [], waivers: ReturnType<typeof waiver>[] = []) => {
    const o = obligation("m", 2026, 10, amount);
    return computeObligation({ obligation: o, payments: payments.map((p) => ({ ...p, obligationId: o.id })), waivers, asOf: at });
};

describe("fixed rupee step", () => {
    test.each([
        [100000, 0, 20000],
        [60000, 0, 20000],
        [50001, 0, 20000],
        [50000, 0, 10000],
        [25000, 0, 10000],
        [1, 0, 10000],
        [0, 20000, 10000],
        [0, 10000, 10000],
        [0, 0, 0],
    ])("principal %i, penalty %i -> %i", (principal, penalty, expected) => {
        expect(boundaryCharge(principal, penalty)).toBe(expected);
    });
});

describe("completely unpaid October installment", () => {
    const cases: [string, number, number, number][] = [
        ["Oct 1", ist(2026, 10, 1), 1000, 500],
        ["Oct 15 23:59", ist(2026, 10, 15, 23, 59), 1000, 500],
        ["Oct 16 00:00", ist(2026, 10, 16), 1200, 600],
        ["Oct 20", ist(2026, 10, 20, 18), 1200, 600],
        ["Oct 21", ist(2026, 10, 21), 1400, 700],
        ["Oct 25", ist(2026, 10, 25, 23, 59), 1400, 700],
        ["Oct 26", ist(2026, 10, 26), 1600, 800],
        ["Oct 31 23:59", ist(2026, 10, 31, 23, 59), 1600, 800],
        ["Nov 1", ist(2026, 11, 1), 1800, 900],
        ["Nov 5", ist(2026, 11, 5, 23), 1800, 900],
        ["Nov 6", ist(2026, 11, 6), 2000, 1000],
        ["Nov 10", ist(2026, 11, 10, 12), 2000, 1000],
        ["Nov 11", ist(2026, 11, 11), 2200, 1100],
        ["Nov 15", ist(2026, 11, 15, 23, 59), 2200, 1100],
    ];
    test.each(cases)("%s: ₹1,000 -> ₹%i, ₹500 -> ₹%i", (_label, at, thousand, fiveHundred) => {
        expect(total(1000, at).totalOutstandingPaise).toBe(thousand * 100);
        expect(total(500, at).totalOutstandingPaise).toBe(fiveHundred * 100);
    });

    test("there is no step on day 31 and reopening does not duplicate charges", () => {
        const a = total(1000, ist(2026, 10, 31, 12));
        const b = total(1000, ist(2026, 10, 31, 12));
        expect(a.penaltyChargedPaise).toBe(60000);
        expect(b).toEqual(a);
    });
});

describe("partial payments and ordering", () => {
    test("₹500 paid Oct 10 on ₹1,000: Oct 16 +₹100, Oct 21 +₹100, remaining ₹700", () => {
        const p = payment(obligation("m", 2026, 10, 1000), 500, ist(2026, 10, 10, 11), { principal: 500, penalty: 0 });
        const s = total(1000, ist(2026, 10, 23), [p]);
        expect(s.principalOutstandingPaise).toBe(50000);
        expect(s.penaltyOutstandingPaise).toBe(20000);
        expect(s.totalOutstandingPaise).toBe(70000);
        expect(s.cashCollectedPaise).toBe(50000);
    });

    test("₹600 outstanding gives ₹200 steps, ₹250 outstanding gives ₹100 steps", () => {
        const p600 = payment(obligation("m", 2026, 10, 1000), 400, ist(2026, 10, 5), { principal: 400, penalty: 0 });
        expect(total(1000, ist(2026, 10, 16)).penaltyChargedPaise).toBe(20000);
        expect(total(1000, ist(2026, 10, 16), [p600]).penaltyChargedPaise).toBe(20000);
        const p250 = payment(obligation("m", 2026, 10, 500), 250, ist(2026, 10, 5), { principal: 250, penalty: 0 });
        expect(total(500, ist(2026, 10, 16), [p250]).penaltyChargedPaise).toBe(10000);
    });

    test("later principal payment does not reduce an earlier charge", () => {
        const p = payment(obligation("m", 2026, 10, 1000), 600, ist(2026, 10, 18), { principal: 600, penalty: 0 });
        const s = total(1000, ist(2026, 10, 22), [p]);
        // Oct 16: ₹1,000 unpaid -> ₹200. Oct 21: ₹400 unpaid -> ₹100.
        expect(s.penaltyChargedPaise).toBe(30000);
        expect(s.timeline.filter((t) => t.type === "charge").map((t) => t.amountPaise)).toEqual([20000, 10000]);
    });

    test("boundary charge applies before a payment made at the boundary instant", () => {
        const atBoundary = payment(obligation("m", 2026, 10, 1000), 1000, ist(2026, 10, 16), { principal: 1000, penalty: 0 });
        const s = total(1000, ist(2026, 10, 16, 12), [atBoundary]);
        expect(s.penaltyOutstandingPaise).toBe(20000);
        const before = payment(obligation("m", 2026, 10, 1000), 1000, ist(2026, 10, 15, 23, 59), { principal: 1000, penalty: 0 });
        expect(total(1000, ist(2026, 11, 30), [before]).totalOutstandingPaise).toBe(0);
    });

    test("India timezone decides the boundary, not UTC", () => {
        const lastSecond = Date.UTC(2026, 9, 15, 18, 29, 59); // Oct 15 23:59:59 IST
        const firstSecond = Date.UTC(2026, 9, 15, 18, 30, 0); // Oct 16 00:00:00 IST
        expect(total(1000, lastSecond).penaltyChargedPaise).toBe(0);
        expect(total(1000, firstSecond).penaltyChargedPaise).toBe(20000);
    });

    test("penalty-only balance keeps adding ₹100 per step for both amounts", () => {
        for (const amount of [1000, 500]) {
            const o = obligation("m", 2026, 10, amount);
            const p = payment(o, amount, ist(2026, 10, 17), { principal: amount, penalty: 0 });
            const s = total(amount, ist(2026, 11, 7), [p]);
            const step = amount === 1000 ? 20000 : 10000;
            // Oct 16 step on full principal, then Oct 21, Oct 26, Nov 1, Nov 6 at ₹100.
            expect(s.penaltyChargedPaise).toBe(step + 4 * 10000);
            expect(s.principalOutstandingPaise).toBe(0);
        }
    });

    test("full settlement stops further penalties", () => {
        const o = obligation("m", 2026, 10, 1000);
        const p = payment(o, 1200, ist(2026, 10, 17), { principal: 1000, penalty: 200 });
        const s = total(1000, ist(2027, 3, 1), [p]);
        expect(s.totalOutstandingPaise).toBe(0);
        expect(s.status).toBe("settled");
        expect(s.nextBoundary).toBeNull();
    });
});

describe("waivers", () => {
    test("a full waiver stops future penalties and is not a collection", () => {
        const o = obligation("m", 2026, 10, 1000);
        const w = waiver(o, 1000, 200, ist(2026, 10, 18));
        const s = total(1000, ist(2026, 12, 1), [], [w]);
        expect(s.totalOutstandingPaise).toBe(0);
        expect(s.cashCollectedPaise).toBe(0);
        expect(s.penaltyCollectedPaise).toBe(0);
        expect(s.penaltyWaivedPaise).toBe(20000);
        expect(s.principalWaivedPaise).toBe(100000);
    });

    test("a partial principal waiver leaves the remainder under the normal rules", () => {
        const o = obligation("m", 2026, 10, 1000);
        const w = waiver(o, 500, 0, ist(2026, 10, 5));
        const s = total(1000, ist(2026, 10, 21), [], [w]);
        expect(s.penaltyChargedPaise).toBe(20000); // ₹100 + ₹100 on ₹500 remaining
        expect(s.totalOutstandingPaise).toBe(70000);
    });

    test("a reversed waiver is ignored", () => {
        const o = obligation("m", 2026, 10, 1000);
        const w = { ...waiver(o, 1000, 0, ist(2026, 10, 5)), status: "reversed" as const };
        expect(total(1000, ist(2026, 10, 10), [], [w]).totalOutstandingPaise).toBe(100000);
    });
});

describe("calendar", () => {
    test("February and leap years", () => {
        expect(daysInMonth(2027, 2)).toBe(28);
        expect(daysInMonth(2028, 2)).toBe(29);
        expect(daysInMonth(2100, 2)).toBe(28);
        const feb2028 = penaltyBoundaries({ year: 2028, month: 2 }, ist(2028, 3, 31));
        expect(feb2028).toContain(ist(2028, 2, 26));
        expect(feb2028).not.toContain(ist(2028, 2, 29));
        expect(feb2028).toContain(ist(2028, 3, 1));
        // Unpaid ₹1,000 January 2027 as of Feb 28: Jan 16/21/26 + Feb 1/6/11/16/21/26 = 9 steps of ₹200.
        const o = obligation("m", 2027, 1, 1000);
        const s = computeObligation({ obligation: o, payments: [], waivers: [], asOf: ist(2027, 2, 28, 23) });
        expect(s.penaltyChargedPaise).toBe(9 * 20000);
        const march = computeObligation({ obligation: o, payments: [], waivers: [], asOf: ist(2027, 3, 1) });
        expect(march.penaltyChargedPaise).toBe(10 * 20000);
    });

    test("30 and 31 day months have the same steps", () => {
        expect(penaltyBoundaries({ year: 2026, month: 11 }, ist(2026, 11, 30, 23)).length).toBe(3);
        expect(penaltyBoundaries({ year: 2026, month: 10 }, ist(2026, 10, 31, 23)).length).toBe(3);
        expect(penaltyBoundaries({ year: 2026, month: 10 }, ist(2026, 12, 31, 23)).length).toBe(3 + 6 + 6);
    });
});

describe("legacy payments", () => {
    test("principal-only legacy payment is inferred", () => {
        const o = obligation("m", 2026, 10, 1000);
        const p = payment(o, 400, ist(2026, 10, 8));
        const s = total(1000, ist(2026, 10, 12), [p]);
        expect(s.reliable).toBe(true);
        expect(s.timeline[0]).toMatchObject({ type: "payment", allocation: "inferred", inferredRule: "principal_only", principalPaise: 40000 });
    });

    test("full settlement legacy payment is inferred", () => {
        const o = obligation("m", 2026, 10, 1000);
        const p = payment(o, 1200, ist(2026, 10, 17));
        const s = total(1000, ist(2026, 11, 20), [p]);
        expect(s.status).toBe("settled");
    });

    test("ambiguous legacy payment is labelled, not guessed", () => {
        const o = obligation("m", 2026, 10, 1000);
        const p = payment(o, 1100, ist(2026, 10, 17));
        const s = total(1000, ist(2026, 10, 29), [p]);
        expect(s.reliable).toBe(false);
        expect(s.status).toBe("needs_review");
        expect(s.unclassifiedPaise).toBe(110000);
        expect(s.cashCollectedPaise).toBe(110000);
        expect(s.principalCollectedPaise).toBe(0);
    });
});
