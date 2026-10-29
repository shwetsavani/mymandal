import { compareYearMonth, currentIstMonth, monthIndex, type YearMonth } from "../domain/calendar";
import { sumSummaries, type ObligationSummary, type Totals } from "../domain/financeEngine";
import { installmentForMonth } from "../domain/installments";
import { formatPaise, rupeesToPaise } from "../domain/money";
import { findObligation, memberStart, summarize } from "../domain/operations";
import { isMemberClosed, type FinancialState, type Member } from "../domain/types";
import type { AppStrings } from "../localization/strings";

export const money = (paise: number) => formatPaise(paise, { decimals: paise % 100 !== 0 });

export type MemberMonthRow = {
    member: Member;
    summary: ObligationSummary | null;
    /** Installment that would apply if the month is opened (future months). */
    plannedInstallmentPaise: number;
    eligible: boolean;
};

const isEligible = (state: FinancialState, member: Member, ym: YearMonth): boolean => {
    const start = memberStart(member, state);
    if (!start || compareYearMonth(ym, start) < 0) return false;
    if (isMemberClosed(member)) {
        if (!member.closedThroughYear || !member.closedThroughMonth) return false;
        return compareYearMonth(ym, { year: member.closedThroughYear, month: member.closedThroughMonth }) <= 0;
    }
    return true;
};

export const monthRows = (state: FinancialState, ym: YearMonth, asOf: number): MemberMonthRow[] =>
    state.members
        .map((member) => {
            const obligation = findObligation(state, member.id, ym);
            return {
                member,
                summary: obligation ? summarize(state, obligation, asOf) : null,
                plannedInstallmentPaise: rupeesToPaise(installmentForMonth(member, ym)),
                eligible: Boolean(obligation) || isEligible(state, member, ym),
            };
        })
        .filter((row) => row.eligible)
        .sort((a, b) => a.member.name.localeCompare(b.member.name));

export const monthTotals = (rows: MemberMonthRow[]): Totals =>
    sumSummaries(rows.map((r) => r.summary).filter((s): s is ObligationSummary => s !== null));

export const statusTone = (status: ObligationSummary["status"]) =>
    status === "settled" ? "success" : status === "partial" ? "warning" : status === "unpaid" ? "danger" : status === "upcoming" ? "muted" : "warning";

export const statusLabel = (s: AppStrings, status: ObligationSummary["status"]) => s.status[status];

export const mandalStart = (state: FinancialState): YearMonth | null =>
    state.settings.mandalStartYear && state.settings.mandalStartMonth
        ? { year: state.settings.mandalStartYear, month: state.settings.mandalStartMonth }
        : null;

/** Older months (before the current India month) that still have something payable. */
export const olderDues = (state: FinancialState, asOf: number) => {
    const current = currentIstMonth(asOf);
    const summaries = state.obligations
        .filter((o) => monthIndex(o) < monthIndex(current))
        .map((o) => summarize(state, o, asOf))
        .filter((s) => s.totalOutstandingPaise > 0 || s.status === "needs_review");
    return { count: summaries.length, totals: sumSummaries(summaries) };
};

export const needsReviewCount = (state: FinancialState, asOf: number) =>
    state.obligations.map((o) => summarize(state, o, asOf)).filter((s) => s.status === "needs_review").length;
