import { formatIstDateTime } from "../domain/calendar";
import { paymentAmountPaise, sumSummaries, type ObligationSummary } from "../domain/financeEngine";
import { formatPaise, paiseToPlain } from "../domain/money";
import { summarize } from "../domain/operations";
import type { FinancialState, MonthlyObligation } from "../domain/types";
import type { AppStrings } from "../localization/strings";

export type ExportScope = { kind: "month"; year: number; month: number } | { kind: "year"; year: number } | { kind: "all" };

const inScope = (scope: ExportScope, item: { year: number; month: number }) =>
    scope.kind === "all" || (scope.kind === "year" ? item.year === scope.year : item.year === scope.year && item.month === scope.month);

/** Text cell: neutralises spreadsheet formulas and quotes the value. */
export const csvText = (value: string): string => {
    let text = value ?? "";
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};
const csvMoney = (paise: number) => paiseToPlain(paise);
const csvLine = (cells: string[]) => cells.join(",");
export const CSV_BOM = "\uFEFF";

export const escapeHtml = (value: string): string =>
    (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type ScopedData = {
    obligations: MonthlyObligation[];
    summaries: ObligationSummary[];
    memberName: (id: string) => string;
};

export const scopeData = (state: FinancialState, scope: ExportScope, asOf: number): ScopedData => {
    const obligations = state.obligations
        .filter((o) => inScope(scope, o))
        .sort((a, b) => a.year - b.year || a.month - b.month || a.memberId.localeCompare(b.memberId));
    const names = new Map(state.members.map((m) => [m.id, m.name]));
    return {
        obligations,
        summaries: obligations.map((o) => summarize(state, o, asOf)),
        memberName: (id) => names.get(id) ?? id,
    };
};

/** One row per member-month plus a single total row. */
export const buildObligationCsv = (state: FinancialState, scope: ExportScope, asOf: number, s: AppStrings): string => {
    const data = scopeData(state, scope, asOf);
    const header = [
        "Member",
        "Obligation month",
        "Status",
        s.money.originalInstallment,
        s.money.installmentCollected,
        s.money.installmentWaived,
        s.money.installmentOutstanding,
        s.money.penaltyCharged,
        s.money.penaltyCollected,
        s.money.penaltyWaived,
        s.money.penaltyOutstanding,
        s.money.cashCollected,
        s.money.unclassified,
        s.money.reversed,
        s.money.totalRemaining,
        "As of (India time)",
    ].map(csvText);
    const lines = [csvLine(header)];
    const asOfText = formatIstDateTime(asOf);
    for (const x of data.summaries) {
        lines.push(
            csvLine([
                csvText(data.memberName(x.memberId)),
                csvText(`${x.year}-${String(x.month).padStart(2, "0")}`),
                csvText(s.status[x.status]),
                csvMoney(x.installmentPaise),
                csvMoney(x.principalCollectedPaise),
                csvMoney(x.principalWaivedPaise),
                csvMoney(x.principalOutstandingPaise),
                csvMoney(x.penaltyChargedPaise),
                csvMoney(x.penaltyCollectedPaise),
                csvMoney(x.penaltyWaivedPaise),
                csvMoney(x.penaltyOutstandingPaise),
                csvMoney(x.cashCollectedPaise),
                csvMoney(x.unclassifiedPaise),
                csvMoney(x.reversedPaise),
                csvMoney(x.totalOutstandingPaise),
                csvText(asOfText),
            ])
        );
    }
    const t = sumSummaries(data.summaries);
    lines.push(
        csvLine([
            csvText(s.money.total),
            csvText(""),
            csvText(""),
            csvMoney(t.installmentPaise),
            csvMoney(t.principalCollectedPaise),
            csvMoney(t.principalWaivedPaise),
            csvMoney(t.principalOutstandingPaise),
            csvMoney(t.penaltyChargedPaise),
            csvMoney(t.penaltyCollectedPaise),
            csvMoney(t.penaltyWaivedPaise),
            csvMoney(t.penaltyOutstandingPaise),
            csvMoney(t.cashCollectedPaise),
            csvMoney(t.unclassifiedPaise),
            csvMoney(t.reversedPaise),
            csvMoney(t.totalOutstandingPaise),
            csvText(asOfText),
        ])
    );
    return CSV_BOM + lines.join("\r\n");
};

export type TransactionRow = {
    type: "payment" | "waiver";
    id: string;
    member: string;
    obligationMonth: string;
    at: string;
    amountPaise: number;
    principalPaise: number | null;
    penaltyPaise: number | null;
    waivedPrincipalPaise: number;
    waivedPenaltyPaise: number;
    allocation: string;
    status: string;
    reason: string;
};

/** One row per payment transaction (a full payment is one row) and per waiver. */
export const transactionRows = (state: FinancialState, scope: ExportScope, asOf: number): TransactionRow[] => {
    const data = scopeData(state, scope, asOf);
    const allocations = new Map<string, { principal: number; penalty: number; kind: string }>();
    for (const x of data.summaries) {
        for (const t of x.timeline) {
            if (t.type === "payment") allocations.set(t.paymentId, { principal: t.principalPaise, penalty: t.penaltyPaise, kind: t.allocation });
        }
    }
    const ids = new Set(data.obligations.map((o) => o.id));
    const rows: TransactionRow[] = [];
    for (const p of state.payments) {
        if (!ids.has(p.obligationId)) continue;
        const alloc = allocations.get(p.id);
        const reversed = p.status === "reversed";
        const principal = alloc && alloc.kind !== "unclassified" ? alloc.principal : reversed && p.principalPaise !== undefined ? p.principalPaise : null;
        const penalty = alloc && alloc.kind !== "unclassified" ? alloc.penalty : reversed && p.penaltyPaise !== undefined ? p.penaltyPaise : null;
        rows.push({
            type: "payment",
            id: p.id,
            member: data.memberName(p.memberId),
            obligationMonth: `${p.year}-${String(p.month).padStart(2, "0")}`,
            at: formatIstDateTime(p.paidAt),
            amountPaise: paymentAmountPaise(p),
            principalPaise: principal,
            penaltyPaise: penalty,
            waivedPrincipalPaise: 0,
            waivedPenaltyPaise: 0,
            allocation: reversed ? "reversed" : alloc?.kind ?? (p.principalPaise !== undefined ? "explicit" : "unclassified"),
            status: reversed ? "reversed" : "valid",
            reason: reversed ? p.reversalReason ?? "" : p.note ?? "",
        });
    }
    for (const w of state.waivers) {
        if (!ids.has(w.obligationId)) continue;
        rows.push({
            type: "waiver",
            id: w.id,
            member: data.memberName(w.memberId),
            obligationMonth: `${w.year}-${String(w.month).padStart(2, "0")}`,
            at: formatIstDateTime(w.effectiveAt),
            amountPaise: 0,
            principalPaise: null,
            penaltyPaise: null,
            waivedPrincipalPaise: w.principalPaise,
            waivedPenaltyPaise: w.penaltyPaise,
            allocation: "",
            status: w.status === "reversed" ? "reversed" : "valid",
            reason: w.status === "reversed" ? `${w.reason} / reversed: ${w.reversalReason ?? ""}` : w.reason,
        });
    }
    return rows.sort((a, b) => a.obligationMonth.localeCompare(b.obligationMonth) || a.member.localeCompare(b.member) || a.at.localeCompare(b.at));
};

export const buildTransactionCsv = (state: FinancialState, scope: ExportScope, asOf: number, s: AppStrings): string => {
    const header = [
        "Type",
        "ID",
        "Member",
        "Obligation month",
        "Received / effective (India time)",
        "Amount received",
        s.money.installment,
        s.money.penalty,
        s.money.installmentWaived,
        s.money.penaltyWaived,
        "Allocation",
        "Status",
        "Reason / note",
    ].map(csvText);
    const lines = [csvLine(header)];
    for (const r of transactionRows(state, scope, asOf)) {
        lines.push(
            csvLine([
                csvText(r.type),
                csvText(r.id),
                csvText(r.member),
                csvText(r.obligationMonth),
                csvText(r.at),
                csvMoney(r.amountPaise),
                r.principalPaise === null ? "" : csvMoney(r.principalPaise),
                r.penaltyPaise === null ? "" : csvMoney(r.penaltyPaise),
                csvMoney(r.waivedPrincipalPaise),
                csvMoney(r.waivedPenaltyPaise),
                csvText(r.allocation),
                csvText(r.status),
                csvText(r.reason),
            ])
        );
    }
    return CSV_BOM + lines.join("\r\n");
};

export const buildReportHtml = (params: {
    state: FinancialState;
    scope: ExportScope;
    asOf: number;
    s: AppStrings;
    mandalName: string;
    scopeLabel: string;
}): string => {
    const { state, scope, asOf, s } = params;
    const data = scopeData(state, scope, asOf);
    const t = sumSummaries(data.summaries);
    const m = (p: number) => escapeHtml(formatPaise(p));
    const e = escapeHtml;
    const obligationRows = data.summaries
        .map(
            (x) => `<tr><td>${e(data.memberName(x.memberId))}</td><td>${e(s.monthLabel(x.year, x.month))}</td><td>${e(s.status[x.status])}</td>
<td>${m(x.installmentPaise)}</td><td>${m(x.principalCollectedPaise)}</td><td>${m(x.principalOutstandingPaise)}</td>
<td>${m(x.penaltyChargedPaise)}</td><td>${m(x.penaltyCollectedPaise)}</td><td>${m(x.penaltyWaivedPaise)}</td><td>${m(x.penaltyOutstandingPaise)}</td>
<td>${m(x.cashCollectedPaise)}</td><td><b>${m(x.totalOutstandingPaise)}</b></td></tr>`
        )
        .join("");
    const txRows = transactionRows(state, scope, asOf)
        .map(
            (r) => `<tr class="${r.status === "reversed" ? "rev" : ""}"><td>${e(r.type)}</td><td>${e(r.member)}</td><td>${e(r.obligationMonth)}</td><td>${e(r.at)}</td>
<td>${r.type === "payment" ? m(r.amountPaise) : ""}</td><td>${r.principalPaise === null ? "-" : m(r.principalPaise)}</td><td>${r.penaltyPaise === null ? "-" : m(r.penaltyPaise)}</td>
<td>${r.type === "waiver" ? `${m(r.waivedPrincipalPaise)} / ${m(r.waivedPenaltyPaise)}` : ""}</td><td>${e(r.status)}</td><td>${e(r.reason)}</td></tr>`
        )
        .join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
body{font-family:'Noto Sans Gujarati','Noto Sans',sans-serif;font-size:10px;color:#1A2639}
h1{font-size:18px;margin:0}h2{font-size:14px;margin-top:18px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #D0D5DD;padding:3px;text-align:left}th{background:#F2F4F7}
.rev{color:#98A2B3;text-decoration:line-through}.sum td{font-weight:bold}
</style></head><body>
<h1>${e(params.mandalName)}</h1>
<div>${e(params.scopeLabel)} · ${e(s.common.asOf(formatIstDateTime(asOf)))}</div>
<h2>${e(s.money.total)}</h2>
<table>
<tr><td>${e(s.money.originalInstallment)}</td><td>${m(t.installmentPaise)}</td><td>${e(s.money.installmentCollected)}</td><td>${m(t.principalCollectedPaise)}</td></tr>
<tr><td>${e(s.money.installmentWaived)}</td><td>${m(t.principalWaivedPaise)}</td><td>${e(s.money.installmentOutstanding)}</td><td>${m(t.principalOutstandingPaise)}</td></tr>
<tr><td>${e(s.money.penaltyCharged)}</td><td>${m(t.penaltyChargedPaise)}</td><td>${e(s.money.penaltyCollected)}</td><td>${m(t.penaltyCollectedPaise)}</td></tr>
<tr><td>${e(s.money.penaltyWaived)}</td><td>${m(t.penaltyWaivedPaise)}</td><td>${e(s.money.penaltyOutstanding)}</td><td>${m(t.penaltyOutstandingPaise)}</td></tr>
<tr><td>${e(s.money.cashCollected)}</td><td>${m(t.cashCollectedPaise)}</td><td>${e(s.money.totalRemaining)}</td><td><b>${m(t.totalOutstandingPaise)}</b></td></tr>
${t.unclassifiedPaise > 0 ? `<tr><td>${e(s.money.unclassified)}</td><td>${m(t.unclassifiedPaise)}</td><td></td><td></td></tr>` : ""}
${t.reversedPaise > 0 ? `<tr><td>${e(s.money.reversed)}</td><td>${m(t.reversedPaise)}</td><td></td><td></td></tr>` : ""}
</table>
<h2>Obligation summary</h2>
<table><tr><th>Member</th><th>Month</th><th>Status</th><th>${e(s.money.originalInstallment)}</th><th>${e(s.money.installmentCollected)}</th><th>${e(s.money.installmentOutstanding)}</th>
<th>${e(s.money.penaltyCharged)}</th><th>${e(s.money.penaltyCollected)}</th><th>${e(s.money.penaltyWaived)}</th><th>${e(s.money.penaltyOutstanding)}</th><th>${e(s.money.cashCollected)}</th><th>${e(s.money.totalRemaining)}</th></tr>
${obligationRows}</table>
<h2>Transactions</h2>
<table><tr><th>Type</th><th>Member</th><th>Obligation month</th><th>Date</th><th>Amount</th><th>${e(s.money.installment)}</th><th>${e(s.money.penalty)}</th><th>Waived</th><th>Status</th><th>Reason / note</th></tr>
${txRows}</table>
</body></html>`;
};
