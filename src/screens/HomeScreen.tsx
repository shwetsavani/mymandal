import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { isBackupStale, readBackupStatus, type BackupStatus } from "../backup/backupStatus";
import { currentIstMonth, formatIstDateTime } from "../domain/calendar";
import type { MandalSetup } from "../domain/types";
import { useStrings } from "../localization/strings";
import type { Nav } from "../navigation/types";
import { readSetup } from "../storage/repository";
import { Button, Card, Loading, Note, Row, Screen, colors } from "../ui/components";
import { mandalStart, money, monthRows, monthTotals, needsReviewCount, olderDues } from "../ui/selectors";
import { TotalsCard } from "../ui/TotalsCard";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

export default function HomeScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { state, asOf, error, reload } = useFinance();
    const [setup, setSetup] = useState<MandalSetup | null>(null);
    const [backup, setBackup] = useState<BackupStatus>({});

    useFocusEffect(
        useCallback(() => {
            readSetup().then(setSetup).catch(() => setSetup(null));
            readBackupStatus().then(setBackup);
        }, [])
    );

    const data = useMemo(() => {
        if (!state) return null;
        const current = currentIstMonth(asOf);
        const rows = monthRows(state, current, asOf);
        return {
            current,
            rows,
            totals: monthTotals(rows),
            older: olderDues(state, asOf),
            review: needsReviewCount(state, asOf),
        };
    }, [state, asOf]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state || !data) return <Loading />;

    const paid = data.totals.settled;
    const notPaid = data.rows.length - paid;

    return (
        <Screen title={setup?.mandalName || "My Mandal"}>
            {!mandalStart(state) ? <Card tone="warning"><Note tone="warning">{s.home.noStartMonth}</Note></Card> : null}
            {isBackupStale(backup, asOf) ? (
                <Card tone="warning">
                    <Note tone="warning">{s.home.backupNudge}</Note>
                </Card>
            ) : null}

            <Card>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                    {s.home.thisMonth}: {s.monthLabel(data.current.year, data.current.month)}
                </Text>
                <Note>{s.common.asOf(formatIstDateTime(asOf))}</Note>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                        <Row label={s.home.paidCount} value={`${paid}/${data.rows.length}`} tone="success" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Row label={s.home.unpaidCount} value={String(notPaid)} tone={notPaid > 0 ? "danger" : undefined} />
                    </View>
                </View>
            </Card>

            <TotalsCard figures={data.totals} />

            {data.older.count > 0 ? (
                <Card title={s.home.olderDues} tone="danger">
                    <Note tone="danger">{s.home.olderDuesLine(data.older.count, money(data.older.totals.totalOutstandingPaise))}</Note>
                    <Row label={s.money.installmentOutstanding} value={money(data.older.totals.principalOutstandingPaise)} />
                    <Row label={s.money.penaltyOutstanding} value={money(data.older.totals.penaltyOutstandingPaise)} />
                </Card>
            ) : null}
            {data.review > 0 ? (
                <Card tone="warning">
                    <Note tone="warning">{s.home.needsReview(data.review)}</Note>
                </Card>
            ) : null}

            <Button label={s.home.payments} onPress={() => navigation.navigate("MonthlyPayments")} />
            <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Button variant="secondary" label={s.home.members} onPress={() => navigation.navigate("Members")} /></View>
                <View style={{ flex: 1 }}><Button variant="secondary" label={s.home.history} onPress={() => navigation.navigate("History")} /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Button variant="secondary" label={s.home.reports} onPress={() => navigation.navigate("Reports")} /></View>
                <View style={{ flex: 1 }}><Button variant="secondary" label={s.home.export} onPress={() => navigation.navigate("Export")} /></View>
            </View>
            <Button variant="secondary" label={s.home.settings} onPress={() => navigation.navigate("Settings")} />
        </Screen>
    );
}
