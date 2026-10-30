import { addMonths, compareYearMonth, currentIstMonth, istInstant, monthIndex, toMillis, type YearMonth } from "./calendar";
import { computeObligation, hasExplicitAllocation, paymentAmountPaise, type ObligationSummary } from "./financeEngine";
import { installmentForMonth, memberObligationStart, pendingInstallmentChange, promotePendingInstallment } from "./installments";
import { isValidPaise, paiseToRupees, type Paise } from "./money";
import {
    isMemberClosed,
    newId,
    type AuditEntry,
    type FinancialState,
    type Member,
    type MonthlyObligation,
    type Payment,
    type Waiver,
} from "./types";

/**
 * Pure state transitions. Each function validates against the state passed in
 * (read fresh inside the storage lock by the service layer) and returns a new
 * state. Nothing here touches storage, so every rule is unit-testable.
 */

export class FinanceError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "FinanceError";
        this.code = code;
    }
}

export const MAX_ADVANCE_MONTHS = 12;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const audit = (entry: Omit<AuditEntry, "id" | "at">, now: number): AuditEntry => ({
    id: newId(),
    at: new Date(now).toISOString(),
    ...entry,
});

const requireReason = (reason: string): string => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
        throw new FinanceError("reason_required", "Please enter a reason (at least 3 characters).");
    }
    return trimmed;
};

export const findMember = (state: FinancialState, memberId: string): Member => {
    const member = state.members.find((m) => m.id === memberId);
    if (!member) throw new FinanceError("member_not_found", "Member not found.");
    return member;
};

export const findObligation = (state: FinancialState, memberId: string, ym: YearMonth): MonthlyObligation | null =>
    state.obligations.find((o) => o.memberId === memberId && o.year === ym.year && o.month === ym.month) ?? null;

export const summarize = (state: FinancialState, obligation: MonthlyObligation, asOf: number): ObligationSummary =>
    computeObligation({ obligation, payments: state.payments, waivers: state.waivers, asOf });

const lastObligationMonth = (member: Member): YearMonth | null =>
    isMemberClosed(member) && member.closedThroughYear && member.closedThroughMonth
        ? { year: member.closedThroughYear, month: member.closedThroughMonth }
        : null;

export const memberStart = (member: Member, state: FinancialState): YearMonth | null =>
    memberObligationStart(member) ??
    (state.settings.mandalStartYear && state.settings.mandalStartMonth
        ? { year: state.settings.mandalStartYear, month: state.settings.mandalStartMonth }
        : null);

const buildObligation = (member: Member, ym: YearMonth, nowIso: string, generatedBy: MonthlyObligation["generatedBy"]): MonthlyObligation => {
    const amount = installmentForMonth(member, ym);
    return {
        id: `${member.id}-${ym.year}-${ym.month}`,
        memberId: member.id,
        year: ym.year,
        month: ym.month,
        originalInstallment: amount,
        currentAmountDue: amount,
        penalty: 0,
        paidAmount: 0,
        remainingAmount: amount,
        status: "pending",
        createdAt: nowIso,
        updatedAt: nowIso,
        generatedBy,
    };
};

/**
 * Idempotently creates every missing obligation from each member's start month
 * through the current India month (stopping at a closed membership's last
 * month) and promotes scheduled installment changes that have taken effect.
 */
export const generateObligations = (state: FinancialState, now: number): { state: FinancialState; created: MonthlyObligation[] } => {
    const current = currentIstMonth(now);
    const nowIso = new Date(now).toISOString();
    const created: MonthlyObligation[] = [];
    const slots = new Set(state.obligations.map((o) => `${o.memberId}|${o.year}|${o.month}`));
    const ids = new Set(state.obligations.map((o) => o.id));

    for (const member of state.members) {
        const start = memberStart(member, state);
        if (!start) continue;
        const closedThrough = lastObligationMonth(member);
        if (isMemberClosed(member) && !closedThrough) continue;
        const end = closedThrough && compareYearMonth(closedThrough, current) < 0 ? closedThrough : current;
        for (let index = monthIndex(start); index <= monthIndex(end); index++) {
            const ym = { year: Math.floor(index / 12), month: (index % 12) + 1 };
            const slot = `${member.id}|${ym.year}|${ym.month}`;
            if (slots.has(slot)) continue;
            const obligation = buildObligation(member, ym, nowIso, "generator");
            if (ids.has(obligation.id)) {
                obligation.id = `${obligation.id}-${newId()}`;
            }
            slots.add(slot);
            ids.add(obligation.id);
            created.push(obligation);
        }
    }

    let membersChanged = false;
    const members = state.members.map((member) => {
        const promoted = promotePendingInstallment(member, current, nowIso);
        if (promoted !== member) membersChanged = true;
        return promoted;
    });

    if (created.length === 0 && !membersChanged) {
        return { state, created };
    }
    return {
        state: {
            ...state,
            members: membersChanged ? members : state.members,
            obligations: created.length > 0 ? [...state.obligations, ...created] : state.obligations,
        },
        created,
    };
};

/**
 * Returns the obligation for a member/month, creating it on demand for an
 * advance payment (future month) when allowed.
 */
export const ensureObligation = (
    state: FinancialState,
    memberId: string,
    ym: YearMonth,
    now: number
): { state: FinancialState; obligation: MonthlyObligation } => {
    const existing = findObligation(state, memberId, ym);
    if (existing) return { state, obligation: existing };

    const member = findMember(state, memberId);
    const start = memberStart(member, state);
    if (!start || compareYearMonth(ym, start) < 0) {
        throw new FinanceError("before_start", "This month is before the member's start month.");
    }
    const closedThrough = lastObligationMonth(member);
    if (isMemberClosed(member) && (!closedThrough || compareYearMonth(ym, closedThrough) > 0)) {
        throw new FinanceError("member_closed", "This membership is closed; no obligations after closure.");
    }
    const current = currentIstMonth(now);
    if (compareYearMonth(ym, addMonths(current, MAX_ADVANCE_MONTHS)) > 0) {
        throw new FinanceError("too_far_ahead", `Advance payments are limited to ${MAX_ADVANCE_MONTHS} months ahead.`);
    }
    if (compareYearMonth(ym, current) <= 0) {
        // A past/current month should already exist; generate everything missing.
        const generated = generateObligations(state, now);
        const obligation = findObligation(generated.state, memberId, ym);
        if (!obligation) throw new FinanceError("not_generated", "Obligation could not be created.");
        return { state: generated.state, obligation };
    }
    const obligation = buildObligation(member, ym, new Date(now).toISOString(), "advance");
    return { state: { ...state, obligations: [...state.obligations, obligation] }, obligation };
};

const assertNoNewIssues = (before: ObligationSummary | null, after: ObligationSummary) => {
    const newIssues = after.issues.filter((issue) => !(before?.issues ?? []).includes(issue));
    if (newIssues.length > 0 || (before?.reliable !== false && !after.reliable)) {
        throw new FinanceError(
            "inconsistent",
            `This change would make the month's records inconsistent: ${newIssues.join(" ") || "allocation cannot be determined."}`
        );
    }
};

export type PaymentInput = {
    idempotencyKey: string;
    memberId: string;
    year: number;
    month: number;
    receivedAt: number;
    amountPaise: Paise;
    principalPaise: Paise;
    penaltyPaise: Paise;
    mode: "simple" | "full" | "manual";
    note?: string;
};

/**
 * Records ONE payment transaction with its principal/penalty allocation.
 * Validation is recomputed here at commit time from the stored events; an
 * earlier on-screen preview is never trusted.
 */
export const recordPayment = (
    state: FinancialState,
    input: PaymentInput,
    now: number
): { state: FinancialState; payment: Payment; duplicate: boolean } => {
    const prior = state.payments.find((p) => p.idempotencyKey && p.idempotencyKey === input.idempotencyKey);
    if (prior) return { state, payment: prior, duplicate: true };

    if (!input.idempotencyKey) throw new FinanceError("no_key", "Missing transaction identifier.");
    if (![input.amountPaise, input.principalPaise, input.penaltyPaise].every(isValidPaise)) {
        throw new FinanceError("invalid_amount", "Amounts must be valid, non-negative values.");
    }
    if (input.amountPaise <= 0) throw new FinanceError("invalid_amount", "Amount received must be more than zero.");
    if (input.principalPaise + input.penaltyPaise !== input.amountPaise) {
        throw new FinanceError("allocation_mismatch", "Installment and penalty parts must add up to the amount received.");
    }
    if (!Number.isFinite(input.receivedAt) || input.receivedAt > now + FUTURE_TOLERANCE_MS) {
        throw new FinanceError("future_date", "The received date cannot be in the future.");
    }

    const member = findMember(state, input.memberId);
    const ensured = ensureObligation(state, member.id, { year: input.year, month: input.month }, now);
    const obligation = ensured.obligation;
    let next = ensured.state;

    const atReceipt = summarize(next, obligation, input.receivedAt);
    if (!atReceipt.reliable) {
        throw new FinanceError("needs_classification", "Classify the earlier unclassified payment for this month first.");
    }
    if (input.principalPaise > atReceipt.principalOutstandingPaise) {
        throw new FinanceError("principal_exceeds", "Installment part is more than the installment outstanding on that date.");
    }
    if (input.penaltyPaise > atReceipt.penaltyOutstandingPaise) {
        throw new FinanceError("penalty_exceeds", "Penalty part is more than the penalty outstanding on that date.");
    }
    if (
        input.mode === "full" &&
        (input.principalPaise !== atReceipt.principalOutstandingPaise || input.penaltyPaise !== atReceipt.penaltyOutstandingPaise)
    ) {
        throw new FinanceError("stale_full_amount", "The full amount changed. Please review the new total and confirm again.");
    }

    const before = summarize(next, obligation, Math.max(now, input.receivedAt));
    const nowIso = new Date(now).toISOString();
    const payment: Payment = {
        id: newId(),
        obligationId: obligation.id,
        memberId: member.id,
        year: obligation.year,
        month: obligation.month,
        calculatedAmount: paiseToRupees(atReceipt.totalOutstandingPaise),
        calculatedPenalty: paiseToRupees(atReceipt.penaltyOutstandingPaise),
        actualCollectedAmount: paiseToRupees(input.amountPaise),
        isManualOverride: input.mode === "manual",
        paidAt: new Date(input.receivedAt).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
        amountPaise: input.amountPaise,
        principalPaise: input.principalPaise,
        penaltyPaise: input.penaltyPaise,
        allocationSource: input.mode === "full" ? "full" : "entered",
        status: "valid",
        idempotencyKey: input.idempotencyKey,
        note: input.note?.trim() || undefined,
    };
    next = { ...next, payments: [...next.payments, payment] };
    assertNoNewIssues(before, summarize(next, obligation, Math.max(now, input.receivedAt)));

    next = {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit(
                {
                    action: "payment_recorded",
                    memberId: member.id,
                    obligationId: obligation.id,
                    paymentId: payment.id,
                    details: `${input.mode} payment ${input.amountPaise}p (installment ${input.principalPaise}p, penalty ${input.penaltyPaise}p) received ${payment.paidAt}`,
                },
                now
            ),
        ],
    };
    return { state: next, payment, duplicate: false };
};

const replacePayment = (state: FinancialState, updated: Payment): FinancialState => ({
    ...state,
    payments: state.payments.map((p) => (p.id === updated.id ? updated : p)),
});

const findPayment = (state: FinancialState, paymentId: string): Payment => {
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) throw new FinanceError("payment_not_found", "Payment not found.");
    return payment;
};

/** Marks one payment as reversed. The record is kept for the audit trail. */
export const reversePayment = (
    state: FinancialState,
    paymentId: string,
    reason: string,
    now: number,
    batchId?: string
): FinancialState => {
    const why = requireReason(reason);
    const payment = findPayment(state, paymentId);
    if (payment.status === "reversed") throw new FinanceError("already_reversed", "This payment is already reversed.");
    const nowIso = new Date(now).toISOString();
    const next = replacePayment(state, {
        ...payment,
        status: "reversed",
        reversedAt: nowIso,
        reversalReason: why,
        reversalBatchId: batchId,
        updatedAt: nowIso,
    });
    return {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit(
                {
                    action: batchId ? "payment_reversed_month_reset" : "payment_reversed",
                    memberId: payment.memberId,
                    obligationId: payment.obligationId,
                    paymentId: payment.id,
                    reason: why,
                    details: `Reversed ${paymentAmountPaise(payment)}p received ${payment.paidAt}`,
                },
                now
            ),
        ],
    };
};

export type MonthResetPreview = {
    memberId: string;
    obligationId: string;
    year: number;
    month: number;
    payments: Payment[];
    totalPaise: Paise;
};

export const previewMonthReset = (state: FinancialState, memberId: string, ym: YearMonth): MonthResetPreview => {
    const obligation = findObligation(state, memberId, ym);
    if (!obligation) throw new FinanceError("no_obligation", "There is no obligation for this month.");
    const payments = state.payments.filter((p) => p.obligationId === obligation.id && p.status !== "reversed");
    return {
        memberId,
        obligationId: obligation.id,
        year: ym.year,
        month: ym.month,
        payments,
        totalPaise: payments.reduce((sum, p) => sum + paymentAmountPaise(p), 0),
    };
};

/**
 * Reverses every valid payment of ONE member's ONE month. The obligation,
 * waivers and every other member/month are untouched.
 */
export const resetMonthPayments = (
    state: FinancialState,
    memberId: string,
    ym: YearMonth,
    reason: string,
    now: number
): { state: FinancialState; reversedCount: number; reversedPaise: Paise } => {
    const why = requireReason(reason);
    const preview = previewMonthReset(state, memberId, ym);
    if (preview.payments.length === 0) throw new FinanceError("nothing_to_reset", "There are no payments to reverse for this month.");
    const batchId = `reset-${newId()}`;
    let next = state;
    for (const payment of preview.payments) {
        next = reversePayment(next, payment.id, why, now, batchId);
    }
    next = {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit(
                {
                    action: "month_reset",
                    memberId,
                    obligationId: preview.obligationId,
                    reason: why,
                    details: `Reset ${ym.month}/${ym.year}: reversed ${preview.payments.length} payment(s), ${preview.totalPaise}p (batch ${batchId})`,
                },
                now
            ),
        ],
    };
    return { state: next, reversedCount: preview.payments.length, reversedPaise: preview.totalPaise };
};

const obligationOf = (state: FinancialState, payment: Payment): MonthlyObligation => {
    const obligation = state.obligations.find((o) => o.id === payment.obligationId);
    if (!obligation) throw new FinanceError("no_obligation", "Obligation not found for this payment.");
    return obligation;
};

/**
 * Changes the installment/penalty split of one payment (also used to classify
 * a legacy payment). The amount received and its date never change.
 */
export const setPaymentAllocation = (
    state: FinancialState,
    paymentId: string,
    principalPaise: Paise,
    penaltyPaise: Paise,
    reason: string,
    now: number
): FinancialState => {
    const why = requireReason(reason);
    const payment = findPayment(state, paymentId);
    if (payment.status === "reversed") throw new FinanceError("reversed", "A reversed payment cannot be corrected.");
    if (!isValidPaise(principalPaise) || !isValidPaise(penaltyPaise)) {
        throw new FinanceError("invalid_amount", "Amounts must be valid, non-negative values.");
    }
    const amount = paymentAmountPaise(payment);
    if (principalPaise + penaltyPaise !== amount) {
        throw new FinanceError("allocation_mismatch", "Installment and penalty parts must add up to the amount received.");
    }
    const obligation = obligationOf(state, payment);
    const asOf = Math.max(now, toMillis(payment.paidAt));
    const before = summarize(state, obligation, asOf);
    const isClassification = !hasExplicitAllocation(payment);
    const nowIso = new Date(now).toISOString();
    const updated: Payment = {
        ...payment,
        amountPaise: payment.amountPaise ?? amount,
        principalPaise,
        penaltyPaise,
        allocationSource: isClassification ? "classified" : payment.allocationSource ?? "entered",
        updatedAt: nowIso,
        corrections: [
            ...(payment.corrections ?? []),
            {
                at: nowIso,
                reason: why,
                previousPrincipalPaise: payment.principalPaise,
                previousPenaltyPaise: payment.penaltyPaise,
                previousAllocationSource: payment.allocationSource,
            },
        ],
    };
    const next = replacePayment(state, updated);
    const after = summarize(next, obligation, asOf);
    const newIssues = after.issues.filter((issue) => !before.issues.includes(issue));
    if (newIssues.length > 0) {
        throw new FinanceError("inconsistent", `This split is not possible on the payment date: ${newIssues.join(" ")}`);
    }
    return {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit(
                {
                    action: isClassification ? "legacy_payment_classified" : "payment_allocation_corrected",
                    memberId: payment.memberId,
                    obligationId: payment.obligationId,
                    paymentId,
                    reason: why,
                    details: `Split set to installment ${principalPaise}p, penalty ${penaltyPaise}p (amount ${amount}p unchanged)`,
                },
                now
            ),
        ],
    };
};

/** Corrects the recorded received date of a payment. The amount never changes. */
export const correctPaymentDate = (
    state: FinancialState,
    paymentId: string,
    receivedAt: number,
    reason: string,
    now: number
): FinancialState => {
    const why = requireReason(reason);
    const payment = findPayment(state, paymentId);
    if (payment.status === "reversed") throw new FinanceError("reversed", "A reversed payment cannot be corrected.");
    if (!Number.isFinite(receivedAt) || receivedAt > now + FUTURE_TOLERANCE_MS) {
        throw new FinanceError("future_date", "The received date cannot be in the future.");
    }
    const obligation = obligationOf(state, payment);
    const asOf = Math.max(now, receivedAt, toMillis(payment.paidAt));
    const before = summarize(state, obligation, asOf);
    const nowIso = new Date(now).toISOString();
    const next = replacePayment(state, {
        ...payment,
        paidAt: new Date(receivedAt).toISOString(),
        updatedAt: nowIso,
        corrections: [...(payment.corrections ?? []), { at: nowIso, reason: why, previousPaidAt: payment.paidAt }],
    });
    assertNoNewIssues(before, summarize(next, obligation, asOf));
    return {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit(
                {
                    action: "payment_date_corrected",
                    memberId: payment.memberId,
                    obligationId: payment.obligationId,
                    paymentId,
                    reason: why,
                    details: `Received date ${payment.paidAt} -> ${new Date(receivedAt).toISOString()}`,
                },
                now
            ),
        ],
    };
};

export type WaiverInput = {
    idempotencyKey: string;
    memberId: string;
    year: number;
    month: number;
    principalPaise: Paise;
    penaltyPaise: Paise;
    reason: string;
};

/** Waives part or all of an obligation's principal and/or penalty. Not a collection. */
export const addWaiver = (state: FinancialState, input: WaiverInput, now: number): { state: FinancialState; waiver: Waiver; duplicate: boolean } => {
    const prior = state.waivers.find((w) => w.idempotencyKey && w.idempotencyKey === input.idempotencyKey);
    if (prior) return { state, waiver: prior, duplicate: true };
    const why = requireReason(input.reason);
    if (!isValidPaise(input.principalPaise) || !isValidPaise(input.penaltyPaise)) {
        throw new FinanceError("invalid_amount", "Amounts must be valid, non-negative values.");
    }
    if (input.principalPaise + input.penaltyPaise <= 0) throw new FinanceError("invalid_amount", "Enter an amount to waive.");
    const obligation = findObligation(state, input.memberId, input);
    if (!obligation) throw new FinanceError("no_obligation", "There is no obligation for this month.");
    const current = summarize(state, obligation, now);
    if (!current.reliable) throw new FinanceError("needs_classification", "Classify the unclassified payment for this month first.");
    if (input.principalPaise > current.principalOutstandingPaise) {
        throw new FinanceError("principal_exceeds", "Installment waiver is more than the installment outstanding.");
    }
    if (input.penaltyPaise > current.penaltyOutstandingPaise) {
        throw new FinanceError("penalty_exceeds", "Penalty waiver is more than the penalty outstanding.");
    }
    const nowIso = new Date(now).toISOString();
    const waiver: Waiver = {
        id: newId(),
        obligationId: obligation.id,
        memberId: obligation.memberId,
        year: obligation.year,
        month: obligation.month,
        principalPaise: input.principalPaise,
        penaltyPaise: input.penaltyPaise,
        effectiveAt: nowIso,
        reason: why,
        createdAt: nowIso,
        status: "valid",
        idempotencyKey: input.idempotencyKey,
    };
    return {
        state: {
            ...state,
            waivers: [...state.waivers, waiver],
            auditLog: [
                ...state.auditLog,
                audit(
                    {
                        action: "waiver_added",
                        memberId: obligation.memberId,
                        obligationId: obligation.id,
                        waiverId: waiver.id,
                        reason: why,
                        details: `Waived installment ${input.principalPaise}p, penalty ${input.penaltyPaise}p`,
                    },
                    now
                ),
            ],
        },
        waiver,
        duplicate: false,
    };
};

export const reverseWaiver = (state: FinancialState, waiverId: string, reason: string, now: number): FinancialState => {
    const why = requireReason(reason);
    const waiver = state.waivers.find((w) => w.id === waiverId);
    if (!waiver) throw new FinanceError("waiver_not_found", "Waiver not found.");
    if (waiver.status === "reversed") throw new FinanceError("already_reversed", "This waiver is already reversed.");
    const nowIso = new Date(now).toISOString();
    return {
        ...state,
        waivers: state.waivers.map((w) => (w.id === waiverId ? { ...w, status: "reversed", reversedAt: nowIso, reversalReason: why } : w)),
        auditLog: [
            ...state.auditLog,
            audit({ action: "waiver_reversed", memberId: waiver.memberId, obligationId: waiver.obligationId, waiverId, reason: why }, now),
        ],
    };
};

const replaceMember = (state: FinancialState, member: Member): FinancialState => ({
    ...state,
    members: state.members.map((m) => (m.id === member.id ? member : m)),
});

export const updateMemberDetails = (
    state: FinancialState,
    memberId: string,
    details: { name: string; mobile: string },
    now: number
): FinancialState => {
    const member = findMember(state, memberId);
    const name = details.name.trim();
    const mobile = details.mobile.trim();
    if (name.length < 2) throw new FinanceError("invalid_name", "Please enter the member's name.");
    if (mobile && !/^\d{10}$/.test(mobile)) throw new FinanceError("invalid_mobile", "Mobile number must be 10 digits.");
    if (name === member.name && mobile === member.mobile) return state;
    const next = replaceMember(state, { ...member, name, mobile, updatedAt: new Date(now).toISOString() });
    return {
        ...next,
        auditLog: [...next.auditLog, audit({ action: "member_updated", memberId, details: `name/mobile updated` }, now)],
    };
};

/**
 * Schedules a new installment from the next India month. Existing obligations
 * (including the current month) keep their amounts.
 */
export const scheduleInstallmentChange = (state: FinancialState, memberId: string, amountRupees: number, now: number): FinancialState => {
    const member = findMember(state, memberId);
    if (isMemberClosed(member)) throw new FinanceError("member_closed", "This membership is closed.");
    if (!Number.isInteger(amountRupees) || amountRupees <= 0 || amountRupees > 1_000_000) {
        throw new FinanceError("invalid_amount", "Installment must be a whole rupee amount.");
    }
    const effective = addMonths(currentIstMonth(now), 1);
    const pending = pendingInstallmentChange(member);
    if (amountRupees === member.monthlyInstallment) {
        return pending ? cancelInstallmentChange(state, memberId, now) : state;
    }
    if (pending && pending.amount === amountRupees && compareYearMonth(pending, effective) === 0) {
        return state;
    }
    const schedule = (member.installmentSchedule ?? []).filter((e) => compareYearMonth(e, effective) < 0);
    schedule.push({ ...effective, amount: amountRupees });
    const updated: Member = {
        ...member,
        pendingMonthlyInstallment: amountRupees,
        pendingInstallmentEffectiveYear: effective.year,
        pendingInstallmentEffectiveMonth: effective.month,
        installmentSchedule: member.installmentSchedule ? schedule : undefined,
        updatedAt: new Date(now).toISOString(),
    };
    const next = replaceMember(state, updated);
    return {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit(
                {
                    action: "installment_change_scheduled",
                    memberId,
                    details: `₹${member.monthlyInstallment} -> ₹${amountRupees} from ${effective.month}/${effective.year}`,
                },
                now
            ),
        ],
    };
};

export const cancelInstallmentChange = (state: FinancialState, memberId: string, now: number): FinancialState => {
    const member = findMember(state, memberId);
    const pending = pendingInstallmentChange(member);
    if (!pending) throw new FinanceError("no_pending", "There is no scheduled installment change.");
    if (compareYearMonth(pending, currentIstMonth(now)) <= 0) {
        throw new FinanceError("already_effective", "This change has already taken effect.");
    }
    const updated: Member = {
        ...member,
        pendingMonthlyInstallment: undefined,
        pendingInstallmentEffectiveYear: undefined,
        pendingInstallmentEffectiveMonth: undefined,
        installmentSchedule: member.installmentSchedule?.filter((e) => compareYearMonth(e, pending) < 0),
        updatedAt: new Date(now).toISOString(),
    };
    const next = replaceMember(state, updated);
    return {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit({ action: "installment_change_cancelled", memberId, details: `Cancelled ₹${pending.amount} from ${pending.month}/${pending.year}` }, now),
        ],
    };
};

export type ClosureCheck = { canClose: boolean; blocking: ObligationSummary[]; lastMonth: YearMonth };

export const checkMembershipClosure = (state: FinancialState, memberId: string, now: number): ClosureCheck => {
    findMember(state, memberId);
    const generated = generateObligations(state, now).state;
    const own = generated.obligations.filter((o) => o.memberId === memberId);
    const summaries = own.map((o) => summarize(generated, o, now));
    const blocking = summaries.filter((s) => s.totalOutstandingPaise > 0 || !s.reliable || s.issues.length > 0);
    const current = currentIstMonth(now);
    const lastMonth = own.reduce<YearMonth>((max, o) => (compareYearMonth(o, max) > 0 ? { year: o.year, month: o.month } : max), current);
    return { canClose: blocking.length === 0, blocking, lastMonth };
};

/**
 * Closes a membership. Every existing obligation (through the current month
 * and any advance month) must be settled or explicitly waived first.
 */
export const closeMembership = (state: FinancialState, memberId: string, reason: string, now: number): FinancialState => {
    const why = requireReason(reason);
    const member = findMember(state, memberId);
    if (isMemberClosed(member)) throw new FinanceError("already_closed", "This membership is already closed.");
    const generated = generateObligations(state, now).state;
    const check = checkMembershipClosure(generated, memberId, now);
    if (!check.canClose) {
        throw new FinanceError("dues_outstanding", "All months must be settled or waived before closing this membership.");
    }
    const nowIso = new Date(now).toISOString();
    const next = replaceMember(generated, {
        ...findMember(generated, memberId),
        membershipStatus: "closed",
        isActive: false,
        closedAt: nowIso,
        closedThroughYear: check.lastMonth.year,
        closedThroughMonth: check.lastMonth.month,
        closureReason: why,
        pendingMonthlyInstallment: undefined,
        pendingInstallmentEffectiveYear: undefined,
        pendingInstallmentEffectiveMonth: undefined,
        updatedAt: nowIso,
    });
    return {
        ...next,
        auditLog: [
            ...next.auditLog,
            audit({ action: "membership_closed", memberId, reason: why, details: `Last obligation month ${check.lastMonth.month}/${check.lastMonth.year}` }, now),
        ],
    };
};

/** Summaries for every obligation, as of `asOf`. */
export const summarizeAll = (state: FinancialState, asOf: number): ObligationSummary[] =>
    state.obligations.map((o) => summarize(state, o, asOf));

export const monthStartInstant = (ym: YearMonth): number => istInstant(ym.year, ym.month, 1);
