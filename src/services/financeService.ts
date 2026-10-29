import type { YearMonth } from "../domain/calendar";
import {
    addWaiver,
    cancelInstallmentChange,
    closeMembership,
    correctPaymentDate,
    ensureObligation,
    generateObligations,
    recordPayment,
    resetMonthPayments,
    reversePayment,
    reverseWaiver,
    scheduleInstallmentChange,
    setPaymentAllocation,
    updateMemberDetails,
    type PaymentInput,
    type WaiverInput,
} from "../domain/operations";
import type { FinancialState } from "../domain/types";
import { loadFinancialState, mutateFinancialState } from "../storage/repository";

/**
 * Storage-backed wrappers around the pure operations. Each one re-reads the
 * latest data inside the storage lock, validates at commit time, and commits
 * all changed collections as one journaled unit.
 */

export const refreshObligations = (now: number = Date.now()): Promise<number> =>
    mutateFinancialState("generate-obligations", (state) => {
        const result = generateObligations(state, now);
        return { state: result.state, result: result.created.length };
    });

/** Generates any missing obligations, then returns the current state. */
export const loadCurrentState = async (now: number = Date.now()): Promise<FinancialState> => {
    await refreshObligations(now);
    return loadFinancialState();
};

export const prepareObligation = (memberId: string, ym: YearMonth) =>
    mutateFinancialState("ensure-obligation", (state) => {
        const result = ensureObligation(state, memberId, ym, Date.now());
        return { state: result.state, result: result.obligation };
    });

export const submitPayment = (input: PaymentInput) =>
    mutateFinancialState("record-payment", (state) => {
        const result = recordPayment(state, input, Date.now());
        return { state: result.state, result: { payment: result.payment, duplicate: result.duplicate } };
    });

export const submitPaymentReversal = (paymentId: string, reason: string) =>
    mutateFinancialState("reverse-payment", (state) => ({ state: reversePayment(state, paymentId, reason, Date.now()), result: true }));

export const submitMonthReset = (memberId: string, ym: YearMonth, reason: string) =>
    mutateFinancialState("month-reset", (state) => {
        const result = resetMonthPayments(state, memberId, ym, reason, Date.now());
        return { state: result.state, result: { reversedCount: result.reversedCount, reversedPaise: result.reversedPaise } };
    });

export const submitAllocation = (paymentId: string, principalPaise: number, penaltyPaise: number, reason: string) =>
    mutateFinancialState("payment-allocation", (state) => ({
        state: setPaymentAllocation(state, paymentId, principalPaise, penaltyPaise, reason, Date.now()),
        result: true,
    }));

export const submitPaymentDate = (paymentId: string, receivedAt: number, reason: string) =>
    mutateFinancialState("payment-date", (state) => ({
        state: correctPaymentDate(state, paymentId, receivedAt, reason, Date.now()),
        result: true,
    }));

export const submitWaiver = (input: WaiverInput) =>
    mutateFinancialState("waiver", (state) => {
        const result = addWaiver(state, input, Date.now());
        return { state: result.state, result: { waiver: result.waiver, duplicate: result.duplicate } };
    });

export const submitWaiverReversal = (waiverId: string, reason: string) =>
    mutateFinancialState("reverse-waiver", (state) => ({ state: reverseWaiver(state, waiverId, reason, Date.now()), result: true }));

export const submitMemberDetails = (memberId: string, details: { name: string; mobile: string }) =>
    mutateFinancialState("member-details", (state) => ({ state: updateMemberDetails(state, memberId, details, Date.now()), result: true }));

export const submitInstallmentChange = (memberId: string, amountRupees: number) =>
    mutateFinancialState("installment-change", (state) => ({
        state: scheduleInstallmentChange(state, memberId, amountRupees, Date.now()),
        result: true,
    }));

export const submitCancelInstallmentChange = (memberId: string) =>
    mutateFinancialState("cancel-installment-change", (state) => ({
        state: cancelInstallmentChange(state, memberId, Date.now()),
        result: true,
    }));

export const submitMembershipClosure = (memberId: string, reason: string) =>
    mutateFinancialState("close-membership", (state) => ({ state: closeMembership(state, memberId, reason, Date.now()), result: true }));
