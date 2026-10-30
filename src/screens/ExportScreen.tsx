import { useNavigation } from "@react-navigation/native";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Alert, View } from "react-native";

import { addMonths, currentIstMonth, type YearMonth } from "../domain/calendar";
import { buildObligationCsv, buildReportHtml, buildTransactionCsv, type ExportScope } from "../export/exportBuilders";
import { useStrings } from "../localization/strings";
import type { Nav } from "../navigation/types";
import { readSetup } from "../storage/repository";
import { Button, Card, Loading, MonthSelector, Note, Screen } from "../ui/components";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

export default function ExportScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { state, error, reload } = useFinance();
    const [kind, setKind] = useState<ExportScope["kind"]>("month");
    const [ym, setYm] = useState<YearMonth>(() => currentIstMonth());
    const [busy, setBusy] = useState<string | null>(null);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state) return <Loading />;

    const scope: ExportScope = kind === "month" ? { kind, ...ym } : kind === "year" ? { kind, year: ym.year } : { kind };
    const scopeLabel = kind === "month" ? s.monthLabel(ym.year, ym.month) : kind === "year" ? String(ym.year) : s.export.all;
    const fileStamp = kind === "month" ? `${ym.year}-${String(ym.month).padStart(2, "0")}` : kind === "year" ? String(ym.year) : "all";

    const share = async (label: string, task: () => Promise<{ uri: string; mimeType: string }>) => {
        setBusy(label);
        try {
            if (!(await Sharing.isAvailableAsync())) {
                Alert.alert(s.common.error, s.export.sharingUnavailable);
                return;
            }
            const file = await task();
            await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, dialogTitle: label });
        } catch (e) {
            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    const writeCsv = async (name: string, content: string) => {
        const uri = `${FileSystem.cacheDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
        return { uri, mimeType: "text/csv" };
    };

    return (
        <Screen title={s.export.title} onBack={() => navigation.goBack()}>
            <Card title={s.export.scope}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                    {(["month", "year", "all"] as const).map((k) => (
                        <View key={k} style={{ flex: 1 }}>
                            <Button size="small" variant={kind === k ? "primary" : "secondary"} label={s.export[k]} onPress={() => setKind(k)} />
                        </View>
                    ))}
                </View>
                {kind !== "all" ? (
                    <MonthSelector
                        label={scopeLabel}
                        onPrev={() => setYm((m) => (kind === "month" ? addMonths(m, -1) : { ...m, year: m.year - 1 }))}
                        onNext={() => setYm((m) => (kind === "month" ? addMonths(m, 1) : { ...m, year: m.year + 1 }))}
                    />
                ) : null}
                <Note>{s.export.note}</Note>
            </Card>

            <Button
                label={s.export.obligationsCsv}
                busy={busy === "o"}
                onPress={() => share("o", () => writeCsv(`my-mandal-obligations-${fileStamp}.csv`, buildObligationCsv(state, scope, Date.now(), s)))}
            />
            <Button
                label={s.export.transactionsCsv}
                busy={busy === "t"}
                onPress={() => share("t", () => writeCsv(`my-mandal-transactions-${fileStamp}.csv`, buildTransactionCsv(state, scope, Date.now(), s)))}
            />
            <Button
                variant="secondary"
                label={s.export.pdf}
                busy={busy === "p"}
                onPress={() =>
                    share("p", async () => {
                        const setup = await readSetup();
                        const html = buildReportHtml({ state, scope, asOf: Date.now(), s, mandalName: setup?.mandalName ?? "My Mandal", scopeLabel });
                        const { uri } = await Print.printToFileAsync({ html });
                        return { uri, mimeType: "application/pdf" };
                    })
                }
            />
        </Screen>
    );
}
