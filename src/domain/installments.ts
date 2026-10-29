import { compareYearMonth, addMonths, type YearMonth } from "./calendar";
import type { InstallmentScheduleEntry, Member, MonthlyObligation } from "./types";

const sortSchedule = (entries: InstallmentScheduleEntry[]): InstallmentScheduleEntry[] =>
    [...entries].sort((a, b) => compareYearMonth(a, b));

export const memberObligationStart = (member: Member): YearMonth | null =>
    member.obligationStartYear && member.obligationStartMonth
        ? { year: member.obligationStartYear, month: member.obligationStartMonth }
        : null;

/**
 * Builds an installment schedule for a legacy member from the obligations the
 * original app already created, so that any month generated later uses the
 * amount that applied in that month rather than today's amount.
 */
export const deriveLegacySchedule = (
    member: Member,
    memberObligations: MonthlyObligation[],
    start: YearMonth | null
): InstallmentScheduleEntry[] => {
    const sorted = [...memberObligations].sort((a, b) => compareYearMonth(a, b));
    const entries: InstallmentScheduleEntry[] = [];
    for (const obligation of sorted) {
        const last = entries[entries.length - 1];
        if (!last || last.amount !== obligation.originalInstallment) {
            entries.push({ year: obligation.year, month: obligation.month, amount: obligation.originalInstallment });
        }
    }
    if (entries.length === 0) {
        if (start) {
            entries.push({ ...start, amount: member.monthlyInstallment });
        }
    } else {
        const lastObligation = sorted[sorted.length - 1];
        const lastEntry = entries[entries.length - 1];
        if (lastEntry.amount !== member.monthlyInstallment) {
            entries.push({ ...addMonths(lastObligation, 1), amount: member.monthlyInstallment });
        }
    }
    if (
        member.pendingMonthlyInstallment !== undefined &&
        member.pendingInstallmentEffectiveYear !== undefined &&
        member.pendingInstallmentEffectiveMonth !== undefined
    ) {
        const effective = {
            year: member.pendingInstallmentEffectiveYear,
            month: member.pendingInstallmentEffectiveMonth,
        };
        const filtered = entries.filter((entry) => compareYearMonth(entry, effective) < 0);
        filtered.push({ ...effective, amount: member.pendingMonthlyInstallment });
        return sortSchedule(filtered);
    }
    return entries;
};

/** Installment (rupees) that applies to a member for a given month. */
export const installmentForMonth = (member: Member, ym: YearMonth): number => {
    const schedule = member.installmentSchedule;
    if (schedule && schedule.length > 0) {
        const sorted = sortSchedule(schedule);
        let amount = sorted[0].amount;
        for (const entry of sorted) {
            if (compareYearMonth(entry, ym) <= 0) {
                amount = entry.amount;
            }
        }
        return amount;
    }
    if (
        member.pendingMonthlyInstallment !== undefined &&
        member.pendingInstallmentEffectiveYear !== undefined &&
        member.pendingInstallmentEffectiveMonth !== undefined &&
        compareYearMonth(ym, {
            year: member.pendingInstallmentEffectiveYear,
            month: member.pendingInstallmentEffectiveMonth,
        }) >= 0
    ) {
        return member.pendingMonthlyInstallment;
    }
    return member.monthlyInstallment;
};

export const pendingInstallmentChange = (member: Member): InstallmentScheduleEntry | null =>
    member.pendingMonthlyInstallment !== undefined &&
    member.pendingInstallmentEffectiveYear !== undefined &&
    member.pendingInstallmentEffectiveMonth !== undefined
        ? {
              year: member.pendingInstallmentEffectiveYear,
              month: member.pendingInstallmentEffectiveMonth,
              amount: member.pendingMonthlyInstallment,
          }
        : null;

/**
 * Promotes a scheduled change once its effective month has arrived.
 * Returns the same object when nothing changes.
 */
export const promotePendingInstallment = (member: Member, current: YearMonth, nowIso: string): Member => {
    const pending = pendingInstallmentChange(member);
    if (!pending || compareYearMonth(current, pending) < 0) {
        return member;
    }
    return {
        ...member,
        monthlyInstallment: pending.amount,
        pendingMonthlyInstallment: undefined,
        pendingInstallmentEffectiveYear: undefined,
        pendingInstallmentEffectiveMonth: undefined,
        updatedAt: nowIso,
    };
};
