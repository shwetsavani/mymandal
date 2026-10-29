import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import { Alert } from "react-native";

import { addMonths, currentIstMonth } from "../domain/calendar";
import { pendingInstallmentChange } from "../domain/installments";
import { rupeesToPaise } from "../domain/money";
import { memberStart } from "../domain/operations";
import { useStrings } from "../localization/strings";
import type { Nav, RootStackParamList } from "../navigation/types";
import { submitCancelInstallmentChange, submitInstallmentChange, submitMemberDetails } from "../services/financeService";
import { Button, Card, Field, Loading, Note, Row, Screen } from "../ui/components";
import { money } from "../ui/selectors";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

export default function EditMemberScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { params } = useRoute<RouteProp<RootStackParamList, "EditMember">>();
    const { state, error, reload } = useFinance();
    const member = state?.members.find((m) => m.id === params.memberId) ?? null;
    const [name, setName] = useState("");
    const [mobile, setMobile] = useState("");
    const [installment, setInstallment] = useState("");
    const [busy, setBusy] = useState(false);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (member && !initialized) {
            setName(member.name);
            setMobile(member.mobile);
            setInstallment(String(pendingInstallmentChange(member)?.amount ?? member.monthlyInstallment));
            setInitialized(true);
        }
    }, [member, initialized]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state || !member) return <Loading />;

    const pending = pendingInstallmentChange(member);
    const effective = addMonths(currentIstMonth(), 1);
    const start = memberStart(member, state);

    const save = async () => {
        const amount = Number(installment);
        if (!Number.isInteger(amount) || amount <= 0) {
            Alert.alert(s.common.error, s.memberMonth.invalidAmount);
            return;
        }
        setBusy(true);
        try {
            await submitMemberDetails(member.id, { name, mobile });
            await submitInstallmentChange(member.id, amount);
            navigation.goBack();
        } catch (e) {
            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Screen title={s.editMember.title} onBack={() => navigation.goBack()}>
            <Card>
                <Field label={s.editMember.name} value={name} onChangeText={setName} />
                <Field label={s.editMember.mobile} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" maxLength={10} />
                <Field
                    label={s.editMember.installment}
                    value={installment}
                    onChangeText={setInstallment}
                    keyboardType="number-pad"
                    hint={s.editMember.installmentNote(s.monthLabel(effective.year, effective.month))}
                />
                <Row label={s.money.installment} value={money(rupeesToPaise(member.monthlyInstallment))} />
                {start ? <Row label={s.editMember.startMonth} value={s.monthLabel(start.year, start.month)} /> : null}
            </Card>
            {pending ? (
                <Card tone="warning">
                    <Note tone="warning">{s.members.scheduled(money(rupeesToPaise(pending.amount)), s.monthLabel(pending.year, pending.month))}</Note>
                    <Button
                        size="small"
                        variant="secondary"
                        label={s.members.cancelScheduled}
                        onPress={async () => {
                            try {
                                await submitCancelInstallmentChange(member.id);
                                setInstallment(String(member.monthlyInstallment));
                            } catch (e) {
                                Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
                            }
                        }}
                    />
                </Card>
            ) : null}
            <Button label={s.common.save} onPress={save} busy={busy} />
        </Screen>
    );
}
