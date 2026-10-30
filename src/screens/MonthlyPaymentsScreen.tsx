import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { addMonths, compareYearMonth, currentIstMonth, formatIstDate, formatIstDateTime, type YearMonth } from "../domain/calendar";
import { MAX_ADVANCE_MONTHS } from "../domain/operations";
import { isMemberClosed } from "../domain/types";
import { useStrings } from "../localization/strings";
import type { Nav, RootStackParamList } from "../navigation/types";
import { Badge, Card, Loading, MonthSelector, Note, Row, Screen, colors } from "../ui/components";
import { mandalStart, money, monthRows, monthTotals, statusLabel, statusTone } from "../ui/selectors";
import { TotalsCard } from "../ui/TotalsCard";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

export default function MonthlyPaymentsScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const route = useRoute<RouteProp<RootStackParamList, "MonthlyPayments">>();
    const { state, asOf, error, reload } = useFinance();
    const [selected, setSelected] = useState<YearMonth>(() =>
        route.params ? { year: route.params.year, month: route.params.month } : currentIstMonth()
    );

    const data = useMemo(() => {
        if (!state) return null;
        const rows = monthRows(state, selected, asOf);
        return { rows, totals: monthTotals(rows) };
    }, [state, selected, asOf]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state || !data) return <Loading />;

    const start = mandalStart(state);
    const current = currentIstMonth(asOf);
    const canPrev = !start || compareYearMonth(selected, start) > 0;
    const canNext = compareYearMonth(selected, addMonths(current, MAX_ADVANCE_MONTHS)) < 0;
    const isFuture = compareYearMonth(selected, current) > 0;

    return (
        <Screen title={s.payments.title} onBack={() => navigation.goBack()}>
            <MonthSelector
                label={s.monthLabel(selected.year, selected.month)}
                onPrev={canPrev ? () => setSelected((m) => addMonths(m, -1)) : undefined}
                onNext={canNext ? () => setSelected((m) => addMonths(m, 1)) : undefined}
            />
            <Note>{s.common.asOf(formatIstDateTime(asOf))}</Note>
            {isFuture ? <Note tone="warning">{s.payments.futureMonth}</Note> : null}

            {data.rows.length === 0 ? <Card><Note>{s.payments.noMembers}</Note></Card> : null}
            {data.rows.map(({ member, summary, plannedInstallmentPaise }) => (
                <TouchableOpacity
                    key={member.id}
                    onPress={() => navigation.navigate("MemberMonth", { memberId: member.id, year: selected.year, month: selected.month })}
                >
                    <Card>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text, flex: 1 }}>{member.name}</Text>
                            {summary ? (
                                <Badge label={statusLabel(s, summary.status)} tone={statusTone(summary.status)} />
                            ) : (
                                <Badge label={s.status.upcoming} tone="muted" />
                            )}
                        </View>
                        {isMemberClosed(member) ? <Badge label={s.status.closed} tone="muted" /> : null}
                        {summary ? (
                            <>
                                <Row label={s.money.installment} value={money(summary.installmentPaise)} />
                                {summary.cashCollectedPaise > 0 ? <Row label={s.memberMonth.received} value={money(summary.cashCollectedPaise)} tone="success" /> : null}
                                {summary.penaltyOutstandingPaise > 0 ? <Row label={s.money.penaltyOutstanding} value={money(summary.penaltyOutstandingPaise)} tone="danger" /> : null}
                                {summary.status !== "needs_review" ? (
                                    <Row label={s.payments.due} value={money(summary.totalOutstandingPaise)} strong tone={summary.totalOutstandingPaise > 0 ? "danger" : "success"} />
                                ) : (
                                    <Note tone="warning">{s.memberMonth.allocationUnclassified}</Note>
                                )}
                                {summary.nextBoundary && summary.status !== "upcoming" ? (
                                    <Note>{s.payments.nextStep(formatIstDate(summary.nextBoundary.at), money(summary.nextBoundary.chargePaise))}</Note>
                                ) : null}
                            </>
                        ) : (
                            <Row label={s.money.installment} value={money(plannedInstallmentPaise)} tone="muted" />
                        )}
                    </Card>
                </TouchableOpacity>
            ))}

            {data.totals.obligations > 0 ? <TotalsCard title={s.money.total} figures={data.totals} /> : null}
        </Screen>
    );
}
