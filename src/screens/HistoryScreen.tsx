import { useNavigation } from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { currentIstMonth, formatIstDateTime } from "../domain/calendar";
import { useStrings } from "../localization/strings";
import type { Nav } from "../navigation/types";
import { Badge, Card, Loading, MonthSelector, Note, Row, Screen, colors } from "../ui/components";
import { money, monthRows, monthTotals, statusLabel, statusTone } from "../ui/selectors";
import { TotalsCard } from "../ui/TotalsCard";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

export default function HistoryScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { state, asOf, error, reload } = useFinance();
    const [year, setYear] = useState(() => currentIstMonth().year);
    const [open, setOpen] = useState<number | null>(null);

    const months = useMemo(() => {
        if (!state) return [];
        const monthsWithData = [...new Set(state.obligations.filter((o) => o.year === year).map((o) => o.month))].sort((a, b) => b - a);
        return monthsWithData.map((month) => {
            const rows = monthRows(state, { year, month }, asOf).filter((r) => r.summary);
            return { month, rows, totals: monthTotals(rows) };
        });
    }, [state, year, asOf]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state) return <Loading />;
    const years = [...new Set(state.obligations.map((o) => o.year))].sort();

    return (
        <Screen title={s.history.title} onBack={() => navigation.goBack()}>
            <MonthSelector
                label={String(year)}
                onPrev={years.some((y) => y < year) ? () => setYear(year - 1) : undefined}
                onNext={years.some((y) => y > year) ? () => setYear(year + 1) : undefined}
            />
            <Note>{s.common.asOf(formatIstDateTime(asOf))}</Note>
            {months.map(({ month, rows, totals }) => (
                <View key={month} style={{ gap: 8 }}>
                    <TouchableOpacity onPress={() => setOpen(open === month ? null : month)}>
                        <Card>
                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>{s.monthLabel(year, month)}</Text>
                                <Text style={{ color: colors.muted }}>{open === month ? "▲" : "▼"}</Text>
                            </View>
                            <Row label={s.home.paidCount} value={`${totals.settled}/${rows.length}`} />
                            <Row label={s.money.cashCollected} value={money(totals.cashCollectedPaise)} tone="success" />
                            <Row label={s.money.totalRemaining} value={money(totals.totalOutstandingPaise)} tone={totals.totalOutstandingPaise > 0 ? "danger" : "success"} />
                        </Card>
                    </TouchableOpacity>
                    {open === month ? (
                        <>
                            <TotalsCard figures={totals} />
                            {rows.map(({ member, summary }) =>
                                summary ? (
                                    <TouchableOpacity key={member.id} onPress={() => navigation.navigate("MemberMonth", { memberId: member.id, year, month })}>
                                        <Card>
                                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                                <Text style={{ fontWeight: "700", color: colors.text }}>{member.name}</Text>
                                                <Badge label={statusLabel(s, summary.status)} tone={statusTone(summary.status)} />
                                            </View>
                                            <Row label={s.memberMonth.received} value={money(summary.cashCollectedPaise)} />
                                            <Row label={s.money.penaltyCharged} value={money(summary.penaltyChargedPaise)} />
                                            <Row label={s.payments.due} value={money(summary.totalOutstandingPaise)} tone={summary.totalOutstandingPaise > 0 ? "danger" : undefined} />
                                        </Card>
                                    </TouchableOpacity>
                                ) : null
                            )}
                        </>
                    ) : null}
                </View>
            ))}
        </Screen>
    );
}
