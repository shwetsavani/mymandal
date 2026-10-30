import { useNavigation } from "@react-navigation/native";
import React, { useMemo, useState } from "react";

import { currentIstMonth, formatIstDateTime, istParts } from "../domain/calendar";
import { paymentAmountPaise, sumSummaries } from "../domain/financeEngine";
import { summarize } from "../domain/operations";
import { isPaymentValid } from "../domain/types";
import { useStrings } from "../localization/strings";
import type { Nav } from "../navigation/types";
import { Card, Loading, MonthSelector, Note, Row, Screen } from "../ui/components";
import { money } from "../ui/selectors";
import { TotalsCard } from "../ui/TotalsCard";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

export default function ReportsScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { state, asOf, error, reload } = useFinance();
    const [year, setYear] = useState(() => currentIstMonth().year);

    const report = useMemo(() => {
        if (!state) return null;
        const summaries = state.obligations.filter((o) => o.year === year).map((o) => summarize(state, o, asOf));
        const byMonth = [...new Set(summaries.map((x) => x.month))]
            .sort((a, b) => a - b)
            .map((month) => ({ month, totals: sumSummaries(summaries.filter((x) => x.month === month)) }));
        const cashByCollectionMonth = new Map<number, number>();
        for (const p of state.payments) {
            if (!isPaymentValid(p)) continue;
            const parts = istParts(p.paidAt);
            if (parts.year !== year) continue;
            cashByCollectionMonth.set(parts.month, (cashByCollectionMonth.get(parts.month) ?? 0) + paymentAmountPaise(p));
        }
        return { yearTotals: sumSummaries(summaries), byMonth, cashByCollectionMonth: [...cashByCollectionMonth.entries()].sort((a, b) => a[0] - b[0]) };
    }, [state, year, asOf]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state || !report) return <Loading />;
    const years = [...new Set(state.obligations.map((o) => o.year))].sort();

    return (
        <Screen title={s.reports.title} onBack={() => navigation.goBack()}>
            <MonthSelector
                label={String(year)}
                onPrev={years.some((y) => y < year) ? () => setYear(year - 1) : undefined}
                onNext={years.some((y) => y > year) ? () => setYear(year + 1) : undefined}
            />
            <Note>{s.common.asOf(formatIstDateTime(asOf))}</Note>
            <TotalsCard title={s.reports.yearTotal} figures={report.yearTotals}>
                <Row label={s.reports.penaltyFund} value={money(report.yearTotals.penaltyCollectedPaise)} strong />
            </TotalsCard>

            <Card title={s.reports.byObligationMonth}>
                {report.byMonth.map(({ month, totals }) => (
                    <Card key={month} title={s.monthLabel(year, month)}>
                        <Row label={s.money.originalInstallment} value={money(totals.installmentPaise)} />
                        <Row label={s.money.installmentCollected} value={money(totals.principalCollectedPaise)} />
                        <Row label={s.money.penaltyCollected} value={money(totals.penaltyCollectedPaise)} />
                        {totals.penaltyWaivedPaise + totals.principalWaivedPaise > 0 ? (
                            <Row label={`${s.money.installmentWaived} / ${s.money.penaltyWaived}`} value={`${money(totals.principalWaivedPaise)} / ${money(totals.penaltyWaivedPaise)}`} />
                        ) : null}
                        <Row label={s.money.cashCollected} value={money(totals.cashCollectedPaise)} strong />
                        <Row label={s.money.totalRemaining} value={money(totals.totalOutstandingPaise)} tone={totals.totalOutstandingPaise > 0 ? "danger" : "success"} />
                    </Card>
                ))}
            </Card>

            <Card title={s.reports.byCollectionDate}>
                {report.cashByCollectionMonth.map(([month, paise]) => (
                    <Row key={month} label={s.monthLabel(year, month)} value={money(paise)} />
                ))}
            </Card>
        </Screen>
    );
}
