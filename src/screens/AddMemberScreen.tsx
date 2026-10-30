import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import { Alert } from "react-native";

import { addMonths, compareYearMonth, currentIstMonth, type YearMonth } from "../domain/calendar";
import { useStrings } from "../localization/strings";
import type { Nav } from "../navigation/types";
import { submitNewMember } from "../services/financeService";
import { Button, Card, Field, Loading, MonthSelector, Note, Screen } from "../ui/components";
import { mandalStart } from "../ui/selectors";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

const EARLIEST_START_MONTHS_BACK = 24;

export default function AddMemberScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { state, error, reload } = useFinance();
    const [name, setName] = useState("");
    const [mobile, setMobile] = useState("");
    const [installment, setInstallment] = useState("");
    const [start, setStart] = useState<YearMonth | null>(null);
    const [busy, setBusy] = useState(false);

    const current = currentIstMonth();
    const fixedStart = state ? mandalStart(state) : null;
    const earliest = fixedStart ?? addMonths(current, -EARLIEST_START_MONTHS_BACK);
    const latest = addMonths(current, 1);

    useEffect(() => {
        if (state && !start) setStart(fixedStart ?? current);
    }, [state, start, fixedStart, current]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state || !start) return <Loading />;

    const save = async () => {
        const amount = Number(installment);
        if (!Number.isInteger(amount) || amount <= 0) {
            Alert.alert(s.common.error, s.memberMonth.invalidAmount);
            return;
        }
        setBusy(true);
        try {
            const member = await submitNewMember({ name, mobile, installmentRupees: amount, start });
            Alert.alert(s.addMember.added(member.name));
            navigation.goBack();
        } catch (e) {
            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Screen title={s.addMember.title} onBack={() => navigation.goBack()}>
            <Card>
                <Field label={s.editMember.name} value={name} onChangeText={setName} />
                <Field label={s.editMember.mobile} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" maxLength={10} />
                <Field label={s.editMember.installment} value={installment} onChangeText={setInstallment} keyboardType="number-pad" />
            </Card>
            <Card title={s.addMember.startMonth}>
                <MonthSelector
                    label={s.monthLabel(start.year, start.month)}
                    onPrev={compareYearMonth(start, earliest) > 0 ? () => setStart(addMonths(start, -1)) : undefined}
                    onNext={compareYearMonth(start, latest) < 0 ? () => setStart(addMonths(start, 1)) : undefined}
                />
                <Note>{s.addMember.startNote}</Note>
            </Card>
            <Button label={s.common.save} onPress={save} busy={busy} />
        </Screen>
    );
}
