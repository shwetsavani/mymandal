import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import { formatIstDateTime } from "../domain/calendar";
import { pendingInstallmentChange } from "../domain/installments";
import { rupeesToPaise } from "../domain/money";
import { checkMembershipClosure, FinanceError, previewMemberDeletion } from "../domain/operations";
import { isMemberClosed, type DeletedMemberRecord, type Member } from "../domain/types";
import { useStrings } from "../localization/strings";
import type { Nav } from "../navigation/types";
import {
    listDeletedMembers,
    submitCancelInstallmentChange,
    submitDeletedMemberRestore,
    submitMemberDeletion,
    submitMembershipClosure,
} from "../services/financeService";
import { Badge, Button, Card, Field, Loading, Note, Row, Screen, Sheet, colors } from "../ui/components";
import { money } from "../ui/selectors";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

export default function MembersScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { state, asOf, error, reload } = useFinance();
    const [closing, setClosing] = useState<Member | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [deleted, setDeleted] = useState<DeletedMemberRecord[]>([]);

    useEffect(() => {
        listDeletedMembers()
            .then(setDeleted)
            .catch(() => setDeleted([]));
    }, [state]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state) return <Loading />;

    const active = state.members.filter((m) => !isMemberClosed(m)).sort((a, b) => a.name.localeCompare(b.name));
    const closed = state.members.filter(isMemberClosed);
    const closure = closing ? checkMembershipClosure(state, closing.id, asOf) : null;

    const cancelScheduled = (member: Member) => {
        Alert.alert(s.members.cancelScheduled, member.name, [
            { text: s.common.no, style: "cancel" },
            {
                text: s.common.yes,
                onPress: async () => {
                    try {
                        await submitCancelInstallmentChange(member.id);
                    } catch (e) {
                        Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
                    }
                },
            },
        ]);
    };

    const confirmClose = async () => {
        if (!closing) return;
        setBusy(true);
        try {
            await submitMembershipClosure(closing.id, reason);
            setClosing(null);
            setReason("");
        } catch (e) {
            Alert.alert(s.common.error, e instanceof FinanceError || e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const confirmDelete = (member: Member) => {
        const preview = previewMemberDeletion(state, member.id);
        Alert.alert(
            s.members.deleteTitle(member.name),
            s.members.deleteConfirm(preview.obligationCount, preview.paymentCount, money(preview.receivedPaise)),
            [
                { text: s.common.cancel, style: "cancel" },
                {
                    text: s.members.deleteAction,
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await submitMemberDeletion(member.id);
                        } catch (e) {
                            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
                        }
                    },
                },
            ]
        );
    };

    const restoreDeleted = async (record: DeletedMemberRecord) => {
        try {
            await submitDeletedMemberRestore(record.id);
            Alert.alert(s.members.restored(record.member.name));
        } catch (e) {
            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
        }
    };

    const renderMember = (member: Member) => {
        const pending = pendingInstallmentChange(member);
        return (
            <Card key={member.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text, flex: 1 }}>{member.name}</Text>
                    <Badge label={isMemberClosed(member) ? s.status.closed : s.status.active} tone={isMemberClosed(member) ? "muted" : "success"} />
                </View>
                {member.mobile ? <Note>{member.mobile}</Note> : null}
                <Row label={s.money.installment} value={money(rupeesToPaise(member.monthlyInstallment))} />
                {pending ? (
                    <>
                        <Note tone="warning">{s.members.scheduled(money(rupeesToPaise(pending.amount)), s.monthLabel(pending.year, pending.month))}</Note>
                        <Button size="small" variant="secondary" label={s.members.cancelScheduled} onPress={() => cancelScheduled(member)} />
                    </>
                ) : null}
                {isMemberClosed(member) ? (
                    <Note>{member.closureReason}</Note>
                ) : (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                            <Button size="small" variant="secondary" label={s.members.edit} onPress={() => navigation.navigate("EditMember", { memberId: member.id })} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button size="small" variant="secondary" label={s.members.close} onPress={() => setClosing(member)} />
                        </View>
                    </View>
                )}
                <Button size="small" variant="danger" label={s.members.deletePermanently} onPress={() => confirmDelete(member)} />
            </Card>
        );
    };

    const sectionTitle = { fontSize: 16, fontWeight: "700" as const, color: colors.muted, marginTop: 8 };

    return (
        <Screen
            title={s.members.title}
            onBack={() => navigation.goBack()}
            right={<Button size="small" label={s.members.add} onPress={() => navigation.navigate("AddMember")} />}
        >
            {active.map(renderMember)}
            {closed.length > 0 ? <Text style={sectionTitle}>{s.members.closedMembers}</Text> : null}
            {closed.map(renderMember)}
            {deleted.length > 0 ? <Text style={sectionTitle}>{s.members.recentlyDeleted}</Text> : null}
            {deleted.map((record) => (
                <Card key={record.id}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{record.member.name}</Text>
                    <Note>{s.members.deletedOn(formatIstDateTime(record.deletedAt))}</Note>
                    <Button size="small" variant="secondary" label={s.members.restore} onPress={() => void restoreDeleted(record)} />
                </Card>
            ))}

            {closing && closure ? (
                <Sheet visible title={`${s.members.close} · ${closing.name}`} onClose={() => setClosing(null)}>
                    {closure.canClose ? (
                        <>
                            <Note>{s.members.closeConfirm(closing.name)}</Note>
                            <Field label={s.common.reason} value={reason} onChangeText={setReason} placeholder={s.common.reasonPlaceholder} />
                            <Button variant="danger" label={s.members.close} onPress={confirmClose} busy={busy} />
                        </>
                    ) : (
                        <>
                            <Note tone="danger">{s.members.closeBlocked}</Note>
                            {closure.blocking.map((b) => (
                                <Button
                                    key={b.obligationId}
                                    size="small"
                                    variant="secondary"
                                    label={`${s.monthLabel(b.year, b.month)}: ${b.reliable ? money(b.totalOutstandingPaise) : s.status.needs_review}`}
                                    onPress={() => {
                                        setClosing(null);
                                        navigation.navigate("MemberMonth", { memberId: closing.id, year: b.year, month: b.month });
                                    }}
                                />
                            ))}
                        </>
                    )}
                </Sheet>
            ) : null}
        </Screen>
    );
}
