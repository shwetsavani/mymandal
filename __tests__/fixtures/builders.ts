import { istInstant } from "../../src/domain/calendar";
import type { FinancialState, Member, MonthlyObligation, Payment, Waiver } from "../../src/domain/types";

export const ist = (y: number, m: number, d: number, h = 0, min = 0) => istInstant(y, m, d, h, min);
export const iso = (ms: number) => new Date(ms).toISOString();

export const member = (id: string, amount: number, extra: Partial<Member> = {}): Member => ({
    id,
    name: id,
    mobile: "",
    monthlyInstallment: amount,
    isActive: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    obligationStartYear: 2026,
    obligationStartMonth: 9,
    installmentSchedule: [{ year: 2026, month: 9, amount }],
    membershipStatus: "active",
    ...extra,
});

export const obligation = (memberId: string, year: number, month: number, amount: number): MonthlyObligation => ({
    id: `${memberId}-${year}-${month}`,
    memberId,
    year,
    month,
    originalInstallment: amount,
    currentAmountDue: amount,
    penalty: 0,
    paidAmount: 0,
    remainingAmount: amount,
    status: "pending",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
});

let seq = 0;
export const payment = (
    o: MonthlyObligation,
    rupees: number,
    at: number,
    split?: { principal: number; penalty: number },
    extra: Partial<Payment> = {}
): Payment => {
    seq += 1;
    return {
        id: `pay-${seq}`,
        obligationId: o.id,
        memberId: o.memberId,
        year: o.year,
        month: o.month,
        calculatedAmount: rupees,
        calculatedPenalty: 0,
        actualCollectedAmount: rupees,
        isManualOverride: false,
        paidAt: iso(at),
        createdAt: iso(at),
        updatedAt: iso(at),
        ...(split
            ? { amountPaise: rupees * 100, principalPaise: split.principal * 100, penaltyPaise: split.penalty * 100, allocationSource: "entered" as const, status: "valid" as const }
            : {}),
        ...extra,
    };
};

export const waiver = (o: MonthlyObligation, principalRupees: number, penaltyRupees: number, at: number): Waiver => {
    seq += 1;
    return {
        id: `w-${seq}`,
        obligationId: o.id,
        memberId: o.memberId,
        year: o.year,
        month: o.month,
        principalPaise: principalRupees * 100,
        penaltyPaise: penaltyRupees * 100,
        effectiveAt: iso(at),
        reason: "test waiver",
        createdAt: iso(at),
        status: "valid",
    };
};

export const state = (partial: Partial<FinancialState>): FinancialState => ({
    members: [],
    obligations: [],
    payments: [],
    waivers: [],
    auditLog: [],
    settings: { mandalStartYear: 2026, mandalStartMonth: 9 },
    ...partial,
});
