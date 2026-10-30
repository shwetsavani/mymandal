import type { YearMonth } from "../domain/calendar";
import {
    addMember,
    addWaiver,
    cancelInstallmentChange,
    closeMembership,
    correctPaymentDate,
    deleteMemberPermanently,
    ensureObligation,
    FinanceError,
    generateObligations,
    recordPayment,
    resetMonthPayments,
    reversePayment,
    restoreDeletedMember,
    reverseWaiver,
    scheduleInstallmentChange,
    setPaymentAllocation,
    updateMemberDetails,
    type NewMemberInput,
    type PaymentInput,
    type WaiverInput,
} from "../domain/operations";
import type { DeletedMemberRecord, FinancialState, MandalSetup } from "../domain/types";
import { KEYS } from "../storage/keys";
import { loadFinancialState, mutateFinancialState, readSetup } from "../storage/repository";
import { commitJournaled, readJson, withStorageLock } from "../storage/safeStorage";

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

export const submitMandalStart = (ym: YearMonth) =>
    mutateFinancialState("mandal-start", (state) => {
        if (state.settings.mandalStartYear && state.settings.mandalStartMonth) {
            throw new FinanceError("start_set", "The Mandal start month is already set.");
        }
        return { state: { ...state, settings: { ...state.settings, mandalStartYear: ym.year, mandalStartMonth: ym.month } }, result: true };
    });

/** Updates Mandal details (never the PIN) as one journaled write. */
export const submitSetupInfo = (info: Pick<MandalSetup, "mandalName" | "adminName" | "mobile">) =>
    withStorageLock(async () => {
        const setup = await readSetup();
        if (!setup) throw new Error("Setup not found.");
        if (!info.mandalName.trim() || !info.adminName.trim()) throw new Error("Name fields cannot be empty.");
        const next: MandalSetup = { ...setup, mandalName: info.mandalName.trim(), adminName: info.adminName.trim(), mobile: info.mobile.trim() };
        await commitJournaled("setup-info", { [KEYS.setup]: JSON.stringify(next) });
    });

export const submitMembershipClosure = (memberId: string, reason: string) =>
    mutateFinancialState("close-membership", (state) => ({ state: closeMembership(state, memberId, reason, Date.now()), result: true }));

export const submitNewMember = (input: NewMemberInput) =>
    mutateFinancialState("add-member", (state) => {
        const result = addMember(state, input, Date.now());
        return { state: result.state, result: result.member };
    });

const MAX_DELETED_MEMBERS = 20;

export const listDeletedMembers = async (): Promise<DeletedMemberRecord[]> => {
    const records = await readJson<DeletedMemberRecord[]>(KEYS.deletedMembers, []);
    return Array.isArray(records) ? records : [];
};

/** Deletes a member permanently; the removed records go to "Recently deleted" in the same journaled write. */
export const submitMemberDeletion = (memberId: string) =>
    mutateFinancialState("delete-member", async (state) => {
        const { state: next, removed } = deleteMemberPermanently(state, memberId, Date.now());
        const kept = [removed, ...(await listDeletedMembers())].slice(0, MAX_DELETED_MEMBERS);
        return { state: next, result: removed, extraWrites: { [KEYS.deletedMembers]: JSON.stringify(kept) } };
    });

export const submitDeletedMemberRestore = (recordId: string) =>
    mutateFinancialState("restore-deleted-member", async (state) => {
        const records = await listDeletedMembers();
        const record = records.find((r) => r.id === recordId);
        if (!record) throw new FinanceError("not_found", "This deleted member is no longer available.");
        return {
            state: restoreDeletedMember(state, record, Date.now()),
            result: record.member,
            extraWrites: { [KEYS.deletedMembers]: JSON.stringify(records.filter((r) => r.id !== recordId)) },
        };
    });
