import { istInstant, nextPenaltyBoundary, penaltyBoundaries, toMillis, type YearMonth } from "./calendar";
import { rupeesToPaise, type Paise } from "./money";
import { isPaymentValid, isWaiverValid, type MonthlyObligation, type Payment, type Waiver } from "./types";

/**
 * The single shared financial engine.
 *
 * It recomputes an obligation from its immutable events every time
 * (installment, non-reversed payments, non-reversed waivers, penalty
 * boundaries) as of a given instant. Nothing accrued is stored, so opening a
 * screen repeatedly can never duplicate a charge.
 */

export const STEP_HIGH_PAISE = 20_000; // ₹200
export const STEP_LOW_PAISE = 10_000; // ₹100
export const HIGH_STEP_THRESHOLD_PAISE = 50_000; // principal above ₹500

/** Fixed-rupee charge applied at one boundary. */
export const boundaryCharge = (principalOutstanding: Paise, penaltyOutstanding: Paise): Paise => {
    if (principalOutstanding > HIGH_STEP_THRESHOLD_PAISE) return STEP_HIGH_PAISE;
    if (principalOutstanding > 0) return STEP_LOW_PAISE;
    if (penaltyOutstanding > 0) return STEP_LOW_PAISE;
    return 0;
};

export type AllocationKind = "explicit" | "inferred" | "unclassified";

export type TimelineItem =
    | { type: "charge"; at: number; amountPaise: Paise; principalAtBoundary: Paise; penaltyBefore: Paise }
    | {
          type: "payment";
          at: number;
          paymentId: string;
          amountPaise: Paise;
          principalPaise: Paise;
          penaltyPaise: Paise;
          allocation: AllocationKind;
          inferredRule?: "principal_only" | "penalty_only" | "full_settlement";
      }
    | { type: "waiver"; at: number; waiverId: string; principalPaise: Paise; penaltyPaise: Paise };

export type ObligationStatus = "upcoming" | "unpaid" | "partial" | "settled" | "needs_review";

export type ObligationSummary = {
    obligationId: string;
    memberId: string;
    year: number;
    month: number;
    asOf: number;
    installmentPaise: Paise;
    principalCollectedPaise: Paise;
    principalWaivedPaise: Paise;
    principalOutstandingPaise: Paise;
    penaltyChargedPaise: Paise;
    penaltyCollectedPaise: Paise;
    penaltyWaivedPaise: Paise;
    penaltyOutstandingPaise: Paise;
    /** Every non-reversed payment's actual received amount (including unclassified). */
    cashCollectedPaise: Paise;
    /** Received cash whose principal/penalty split is not established. */
    unclassifiedPaise: Paise;
    /** Received cash beyond what was outstanding (overpayment). */
    excessPaise: Paise;
    totalOutstandingPaise: Paise;
    reversedPaise: Paise;
    reversedCount: number;
    validPaymentCount: number;
    status: ObligationStatus;
    /** False when an unclassified legacy payment prevents calculating balances after it. */
    reliable: boolean;
    issues: string[];
    nextBoundary: { at: number; chargePaise: Paise } | null;
    timeline: TimelineItem[];
    /** Penalty steps scheduled after the as-of date are not included. */
    monthStartsAt: number;
};

export const paymentAmountPaise = (payment: Payment): Paise =>
    typeof payment.amountPaise === "number" ? payment.amountPaise : rupeesToPaise(payment.actualCollectedAmount);

export const hasExplicitAllocation = (payment: Payment): boolean =>
    typeof payment.principalPaise === "number" && typeof payment.penaltyPaise === "number";

export const obligationInstallmentPaise = (obligation: Pick<MonthlyObligation, "originalInstallment">): Paise =>
    rupeesToPaise(obligation.originalInstallment);

type Event =
    | { type: "payment"; at: number; order: number; payment: Payment }
    | { type: "waiver"; at: number; order: number; waiver: Waiver };

const orderOf = (iso: string | undefined): number => {
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(ms) ? ms : 0;
};

export const computeObligation = (params: {
    obligation: MonthlyObligation;
    payments: Payment[];
    waivers: Waiver[];
    asOf: number;
}): ObligationSummary => {
    const { obligation, asOf } = params;
    const ym: YearMonth = { year: obligation.year, month: obligation.month };
    const installmentPaise = obligationInstallmentPaise(obligation);
    const monthStartsAt = istInstant(ym.year, ym.month, 1);

    const own = params.payments.filter((p) => p.obligationId === obligation.id);
    const reversed = own.filter((p) => !isPaymentValid(p));
    const events: Event[] = [
        ...own
            .filter(isPaymentValid)
            .map((payment) => ({ type: "payment" as const, at: toMillis(payment.paidAt), order: orderOf(payment.createdAt), payment })),
        ...params.waivers
            .filter((w) => w.obligationId === obligation.id && isWaiverValid(w))
            .map((waiver) => ({ type: "waiver" as const, at: toMillis(waiver.effectiveAt), order: orderOf(waiver.createdAt), waiver })),
    ]
        .filter((event) => event.at <= asOf)
        .sort((a, b) => a.at - b.at || a.order - b.order);

    const boundaries = penaltyBoundaries(ym, asOf);
    let boundaryIndex = 0;

    let principal = installmentPaise;
    let penalty = 0;
    let principalCollected = 0;
    let principalWaived = 0;
    let penaltyCharged = 0;
    let penaltyCollected = 0;
    let penaltyWaived = 0;
    let cash = 0;
    let unclassified = 0;
    let excess = 0;
    let reliable = true;
    const issues: string[] = [];
    const timeline: TimelineItem[] = [];

    const applyBoundariesUpTo = (instant: number) => {
        while (boundaryIndex < boundaries.length && boundaries[boundaryIndex] <= instant) {
            const at = boundaries[boundaryIndex];
            boundaryIndex += 1;
            if (!reliable) continue;
            const charge = boundaryCharge(principal, penalty);
            if (charge > 0) {
                timeline.push({ type: "charge", at, amountPaise: charge, principalAtBoundary: principal, penaltyBefore: penalty });
                penalty += charge;
                penaltyCharged += charge;
            }
        }
    };

    for (const event of events) {
        // Boundary at the same instant is applied first.
        applyBoundariesUpTo(event.at);

        if (event.type === "waiver") {
            const w = event.waiver;
            if (!reliable) {
                timeline.push({ type: "waiver", at: event.at, waiverId: w.id, principalPaise: w.principalPaise, penaltyPaise: w.penaltyPaise });
                continue;
            }
            const p = Math.min(w.principalPaise, principal);
            const n = Math.min(w.penaltyPaise, penalty);
            if (p < w.principalPaise || n < w.penaltyPaise) {
                issues.push(`Waiver ${w.id} is larger than the balance outstanding on its date.`);
            }
            principal -= p;
            penalty -= n;
            principalWaived += p;
            penaltyWaived += n;
            timeline.push({ type: "waiver", at: event.at, waiverId: w.id, principalPaise: p, penaltyPaise: n });
            continue;
        }

        const payment = event.payment;
        const amount = paymentAmountPaise(payment);
        cash += amount;

        if (!reliable) {
            unclassified += amount;
            timeline.push({ type: "payment", at: event.at, paymentId: payment.id, amountPaise: amount, principalPaise: 0, penaltyPaise: 0, allocation: "unclassified" });
            continue;
        }

        let toPrincipal: number;
        let toPenalty: number;
        let allocation: AllocationKind;
        let inferredRule: "principal_only" | "penalty_only" | "full_settlement" | undefined;

        if (hasExplicitAllocation(payment)) {
            allocation = "explicit";
            toPrincipal = payment.principalPaise!;
            toPenalty = payment.penaltyPaise!;
            if (toPrincipal + toPenalty !== amount) {
                issues.push(`Payment ${payment.id} allocation does not equal the amount received.`);
            }
        } else if (penalty === 0 && amount <= principal) {
            allocation = "inferred";
            inferredRule = "principal_only";
            toPrincipal = amount;
            toPenalty = 0;
        } else if (principal === 0 && amount <= penalty) {
            allocation = "inferred";
            inferredRule = "penalty_only";
            toPrincipal = 0;
            toPenalty = amount;
        } else if (amount === principal + penalty) {
            allocation = "inferred";
            inferredRule = "full_settlement";
            toPrincipal = principal;
            toPenalty = penalty;
        } else {
            // More than one split is possible (or an overpayment). Do not guess.
            reliable = false;
            unclassified += amount;
            issues.push(`Payment ${payment.id} has no recorded installment/penalty split and more than one split is possible.`);
            timeline.push({ type: "payment", at: event.at, paymentId: payment.id, amountPaise: amount, principalPaise: 0, penaltyPaise: 0, allocation: "unclassified" });
            continue;
        }

        const appliedPrincipal = Math.min(toPrincipal, principal);
        const appliedPenalty = Math.min(toPenalty, penalty);
        const over = toPrincipal - appliedPrincipal + (toPenalty - appliedPenalty);
        if (over > 0) {
            excess += over;
            issues.push(`Payment ${payment.id} allocates more than was outstanding on its date.`);
        }
        principal -= appliedPrincipal;
        penalty -= appliedPenalty;
        principalCollected += appliedPrincipal;
        penaltyCollected += appliedPenalty;
        timeline.push({
            type: "payment",
            at: event.at,
            paymentId: payment.id,
            amountPaise: amount,
            principalPaise: appliedPrincipal,
            penaltyPaise: appliedPenalty,
            allocation,
            inferredRule,
        });
    }

    applyBoundariesUpTo(asOf);

    const totalOutstanding = principal + penalty;
    let status: ObligationStatus;
    if (!reliable || issues.length > 0) status = "needs_review";
    else if (totalOutstanding === 0) status = "settled";
    else if (asOf < monthStartsAt && principalCollected + penaltyCollected + principalWaived === 0) status = "upcoming";
    else if (principalCollected + penaltyCollected + principalWaived + penaltyWaived > 0) status = "partial";
    else status = "unpaid";

    let nextBoundary: ObligationSummary["nextBoundary"] = null;
    if (reliable && totalOutstanding > 0) {
        const at = nextPenaltyBoundary(ym, asOf);
        if (at !== null) nextBoundary = { at, chargePaise: boundaryCharge(principal, penalty) };
    }

    return {
        obligationId: obligation.id,
        memberId: obligation.memberId,
        year: obligation.year,
        month: obligation.month,
        asOf,
        installmentPaise,
        principalCollectedPaise: principalCollected,
        principalWaivedPaise: principalWaived,
        principalOutstandingPaise: principal,
        penaltyChargedPaise: penaltyCharged,
        penaltyCollectedPaise: penaltyCollected,
        penaltyWaivedPaise: penaltyWaived,
        penaltyOutstandingPaise: penalty,
        cashCollectedPaise: cash,
        unclassifiedPaise: unclassified,
        excessPaise: excess,
        totalOutstandingPaise: totalOutstanding,
        reversedPaise: reversed.reduce((sum, p) => sum + paymentAmountPaise(p), 0),
        reversedCount: reversed.length,
        validPaymentCount: own.filter(isPaymentValid).length,
        status,
        reliable,
        issues,
        nextBoundary,
        timeline,
        monthStartsAt,
    };
};

export type Totals = {
    obligations: number;
    installmentPaise: Paise;
    principalCollectedPaise: Paise;
    principalWaivedPaise: Paise;
    principalOutstandingPaise: Paise;
    penaltyChargedPaise: Paise;
    penaltyCollectedPaise: Paise;
    penaltyWaivedPaise: Paise;
    penaltyOutstandingPaise: Paise;
    cashCollectedPaise: Paise;
    unclassifiedPaise: Paise;
    excessPaise: Paise;
    totalOutstandingPaise: Paise;
    reversedPaise: Paise;
    reversedCount: number;
    settled: number;
    partial: number;
    unpaid: number;
    upcoming: number;
    needsReview: number;
};

export const emptyTotals = (): Totals => ({
    obligations: 0,
    installmentPaise: 0,
    principalCollectedPaise: 0,
    principalWaivedPaise: 0,
    principalOutstandingPaise: 0,
    penaltyChargedPaise: 0,
    penaltyCollectedPaise: 0,
    penaltyWaivedPaise: 0,
    penaltyOutstandingPaise: 0,
    cashCollectedPaise: 0,
    unclassifiedPaise: 0,
    excessPaise: 0,
    totalOutstandingPaise: 0,
    reversedPaise: 0,
    reversedCount: 0,
    settled: 0,
    partial: 0,
    unpaid: 0,
    upcoming: 0,
    needsReview: 0,
});

/**
 * Adds obligation summaries. Each obligation is counted exactly once, so
 * exports and screens that use this cannot double count.
 */
export const sumSummaries = (summaries: ObligationSummary[]): Totals => {
    const t = emptyTotals();
    for (const s of summaries) {
        t.obligations += 1;
        t.installmentPaise += s.installmentPaise;
        t.principalCollectedPaise += s.principalCollectedPaise;
        t.principalWaivedPaise += s.principalWaivedPaise;
        t.principalOutstandingPaise += s.principalOutstandingPaise;
        t.penaltyChargedPaise += s.penaltyChargedPaise;
        t.penaltyCollectedPaise += s.penaltyCollectedPaise;
        t.penaltyWaivedPaise += s.penaltyWaivedPaise;
        t.penaltyOutstandingPaise += s.penaltyOutstandingPaise;
        t.cashCollectedPaise += s.cashCollectedPaise;
        t.unclassifiedPaise += s.unclassifiedPaise;
        t.excessPaise += s.excessPaise;
        t.totalOutstandingPaise += s.totalOutstandingPaise;
        t.reversedPaise += s.reversedPaise;
        t.reversedCount += s.reversedCount;
        if (s.status === "settled") t.settled += 1;
        else if (s.status === "partial") t.partial += 1;
        else if (s.status === "unpaid") t.unpaid += 1;
        else if (s.status === "upcoming") t.upcoming += 1;
        else t.needsReview += 1;
    }
    return t;
};
