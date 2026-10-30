import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import * as Crypto from "expo-crypto";
import React, { useMemo, useRef, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";

import { compareYearMonth, currentIstMonth, formatIstDate, formatIstDateTime, istParts, parseIstDateTime } from "../domain/calendar";
import { computeObligation, paymentAmountPaise, type ObligationSummary } from "../domain/financeEngine";
import { paiseToPlain, parseRupeeInput } from "../domain/money";
import { FinanceError, findObligation, previewMonthReset, summarize } from "../domain/operations";
import type { FinancialState, Payment, Waiver } from "../domain/types";
import { useStrings, type AppStrings } from "../localization/strings";
import type { Nav, RootStackParamList } from "../navigation/types";
import {
    prepareObligation,
    submitAllocation,
    submitMonthReset,
    submitPayment,
    submitPaymentDate,
    submitPaymentReversal,
    submitWaiver,
    submitWaiverReversal,
} from "../services/financeService";
import { Badge, Button, Card, Field, Loading, Note, Row, Screen, Sheet, colors } from "../ui/components";
import { money, statusLabel, statusTone } from "../ui/selectors";
import { TotalsCard } from "../ui/TotalsCard";
import { useFinance } from "../ui/useFinance";
import { DataErrorView } from "./DataErrorScreen";

type Action =
    | { kind: "pay"; mode: "simple" | "full" | "manual" }
    | { kind: "waive" }
    | { kind: "reset" }
    | { kind: "reverse"; payment: Payment }
    | { kind: "split"; payment: Payment; classify: boolean }
    | { kind: "date"; payment: Payment }
    | { kind: "reverseWaiver"; waiver: Waiver };

const errorMessage = (e: unknown) => (e instanceof FinanceError || e instanceof Error ? e.message : String(e));

const nowDateText = () => formatIstDate(Date.now());
const nowTimeText = () => {
    const p = istParts(Date.now());
    return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};
const plain = (paise: number) => (paise > 0 ? paiseToPlain(paise).replace(/\.00$/, "") : "");

export default function MemberMonthScreen() {
    const s = useStrings();
    const navigation = useNavigation<Nav>();
    const { params } = useRoute<RouteProp<RootStackParamList, "MemberMonth">>();
    const ym = { year: params.year, month: params.month };
    const { state, asOf, error, reload } = useFinance();
    const [action, setAction] = useState<Action | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const data = useMemo(() => {
        if (!state) return null;
        const member = state.members.find((m) => m.id === params.memberId) ?? null;
        const obligation = findObligation(state, params.memberId, ym);
        const summary = obligation ? summarize(state, obligation, asOf) : null;
        const payments = obligation
            ? state.payments.filter((p) => p.obligationId === obligation.id).sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt))
            : [];
        const waivers = obligation ? state.waivers.filter((w) => w.obligationId === obligation.id) : [];
        return { member, obligation, summary, payments, waivers };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, asOf, params.memberId, params.year, params.month]);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state || !data) return <Loading />;
    const { member, obligation, summary, payments, waivers } = data;
    if (!member) return <Screen title={s.memberMonth.title} onBack={() => navigation.goBack()}><Note>Member not found.</Note></Screen>;

    const monthText = s.monthLabel(ym.year, ym.month);
    const validPayments = payments.filter((p) => p.status !== "reversed");

    const openAdvance = async () => {
        setBusy(true);
        try {
            await prepareObligation(member.id, ym);
        } catch (e) {
            Alert.alert(s.common.error, errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const allocationLabel = (paymentId: string) => {
        const item = summary?.timeline.find((t) => t.type === "payment" && t.paymentId === paymentId);
        if (!item || item.type !== "payment") return null;
        return item;
    };

    return (
        <Screen title={`${member.name} · ${monthText}`} onBack={() => navigation.goBack()}>
            {!obligation || !summary ? (
                <Card>
                    <Note>{compareYearMonth(ym, currentIstMonth(asOf)) > 0 ? s.payments.futureMonth : ""}</Note>
                    <Button label={s.memberMonth.createAdvance} onPress={openAdvance} busy={busy} />
                </Card>
            ) : (
                <>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                        <Badge label={statusLabel(s, summary.status)} tone={statusTone(summary.status)} />
                        <Note>{s.common.asOf(formatIstDateTime(asOf))}</Note>
                    </View>
                    <TotalsCard figures={summary}>
                        {summary.nextBoundary ? (
                            <Note>{s.payments.nextStep(formatIstDate(summary.nextBoundary.at), money(summary.nextBoundary.chargePaise))}</Note>
                        ) : null}
                    </TotalsCard>

                    {!summary.reliable ? (
                        <Card tone="warning">
                            <Note tone="warning">{s.memberMonth.legacyNote}</Note>
                        </Card>
                    ) : null}

                    {summary.reliable && summary.totalOutstandingPaise > 0 ? (
                        summary.penaltyOutstandingPaise === 0 ? (
                            <Button label={s.memberMonth.collectRemaining} onPress={() => setAction({ kind: "pay", mode: "simple" })} />
                        ) : (
                            <>
                                <Button label={`${s.memberMonth.payFull} (${money(summary.totalOutstandingPaise)})`} onPress={() => setAction({ kind: "pay", mode: "full" })} />
                                <Button variant="secondary" label={s.memberMonth.payManual} onPress={() => setAction({ kind: "pay", mode: "manual" })} />
                            </>
                        )
                    ) : null}
                    {summary.reliable && summary.totalOutstandingPaise > 0 ? (
                        <Button variant="secondary" label={s.memberMonth.waive} onPress={() => setAction({ kind: "waive" })} />
                    ) : null}

                    <Card title={s.memberMonth.payments}>
                        {payments.length === 0 ? <Note>{s.memberMonth.noPayments}</Note> : null}
                        {payments.map((p) => {
                            const reversed = p.status === "reversed";
                            const item = allocationLabel(p.id);
                            const open = expanded === p.id;
                            return (
                                <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: "#EAECF0", paddingTop: 8, marginTop: 4, opacity: reversed ? 0.6 : 1 }}>
                                    <TouchableOpacity onPress={() => setExpanded(open ? null : p.id)}>
                                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, textDecorationLine: reversed ? "line-through" : "none" }}>
                                                {money(paymentAmountPaise(p))}
                                            </Text>
                                            <Text style={{ color: colors.muted }}>{formatIstDateTime(p.paidAt)} {open ? "▲" : "▼"}</Text>
                                        </View>
                                        {reversed ? <Badge label={s.status.reversed} tone="muted" /> : null}
                                    </TouchableOpacity>
                                    {open ? (
                                        <View style={{ gap: 4, marginTop: 6 }}>
                                            {item ? (
                                                <>
                                                    <Note>
                                                        {item.allocation === "explicit"
                                                            ? s.memberMonth.allocationExplicit
                                                            : item.allocation === "inferred"
                                                              ? s.memberMonth.allocationInferred
                                                              : s.memberMonth.allocationUnclassified}
                                                    </Note>
                                                    {item.allocation !== "unclassified" ? (
                                                        <>
                                                            <Row label={s.money.installment} value={money(item.principalPaise)} />
                                                            <Row label={s.money.penalty} value={money(item.penaltyPaise)} />
                                                        </>
                                                    ) : null}
                                                </>
                                            ) : null}
                                            {p.note ? <Note>{p.note}</Note> : null}
                                            {reversed ? <Note>{s.memberMonth.reversedOn(formatIstDateTime(p.reversedAt ?? p.updatedAt))}: {p.reversalReason}</Note> : null}
                                            {p.corrections?.length ? (
                                                <Note>
                                                    {s.memberMonth.corrections}: {p.corrections.map((c) => `${formatIstDate(c.at)} ${c.reason}`).join("; ")}
                                                </Note>
                                            ) : null}
                                            {!reversed ? (
                                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                                    {item?.allocation === "unclassified" ? (
                                                        <Button size="small" label={s.memberMonth.classify} onPress={() => setAction({ kind: "split", payment: p, classify: true })} />
                                                    ) : (
                                                        <Button size="small" variant="secondary" label={s.memberMonth.correctSplit} onPress={() => setAction({ kind: "split", payment: p, classify: false })} />
                                                    )}
                                                    <Button size="small" variant="secondary" label={s.memberMonth.correctDate} onPress={() => setAction({ kind: "date", payment: p })} />
                                                    <Button size="small" variant="secondary" label={s.memberMonth.reverse} onPress={() => setAction({ kind: "reverse", payment: p })} />
                                                </View>
                                            ) : null}
                                        </View>
                                    ) : null}
                                </View>
                            );
                        })}
                    </Card>

                    {validPayments.length > 0 ? (
                        <Button variant="warning" label={s.memberMonth.reset} onPress={() => setAction({ kind: "reset" })} />
                    ) : null}

                    {waivers.length > 0 ? (
                        <Card title={s.memberMonth.waivers}>
                            {waivers.map((w) => (
                                <View key={w.id} style={{ borderTopWidth: 1, borderTopColor: "#EAECF0", paddingTop: 6, opacity: w.status === "reversed" ? 0.6 : 1 }}>
                                    <Row label={formatIstDateTime(w.effectiveAt)} value={`${money(w.principalPaise)} + ${money(w.penaltyPaise)}`} />
                                    <Note>{w.reason}</Note>
                                    {w.status === "reversed" ? (
                                        <Badge label={s.status.reversed} tone="muted" />
                                    ) : (
                                        <Button size="small" variant="secondary" label={s.memberMonth.reverse} onPress={() => setAction({ kind: "reverseWaiver", waiver: w })} />
                                    )}
                                </View>
                            ))}
                        </Card>
                    ) : null}

                    <Card title={s.memberMonth.penaltySteps}>
                        {summary.timeline.filter((t) => t.type === "charge").length === 0 ? <Note>{s.memberMonth.noPenaltySteps}</Note> : null}
                        {summary.timeline.map((t, i) =>
                            t.type === "charge" ? (
                                <Row key={i} label={`${formatIstDate(t.at)} (${s.money.installmentOutstanding} ${money(t.principalAtBoundary)})`} value={`+${money(t.amountPaise)}`} tone="danger" />
                            ) : null
                        )}
                    </Card>
                </>
            )}

            {action && obligation && summary ? (
                <ActionSheet
                    s={s}
                    action={action}
                    state={state}
                    summary={summary}
                    memberId={member.id}
                    memberName={member.name}
                    monthText={monthText}
                    ym={ym}
                    onClose={() => setAction(null)}
                />
            ) : null}
        </Screen>
    );
}

function ActionSheet(props: {
    s: AppStrings;
    action: Action;
    state: FinancialState;
    summary: ObligationSummary;
    memberId: string;
    memberName: string;
    monthText: string;
    ym: { year: number; month: number };
    onClose: () => void;
}) {
    const { s, action, summary } = props;
    const idempotencyKey = useRef(Crypto.randomUUID()).current;
    const [busy, setBusy] = useState(false);
    const [dateText, setDateText] = useState(action.kind === "date" ? formatIstDate(action.payment.paidAt) : nowDateText());
    const [timeText, setTimeText] = useState(() => {
        if (action.kind !== "date") return nowTimeText();
        const p = istParts(action.payment.paidAt);
        return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    });
    const [amount, setAmount] = useState(action.kind === "pay" && action.mode === "simple" ? plain(summary.principalOutstandingPaise) : "");
    const [principal, setPrincipal] = useState(action.kind === "split" && action.payment.principalPaise !== undefined ? plain(action.payment.principalPaise) : "");
    const [penalty, setPenalty] = useState(action.kind === "split" && action.payment.penaltyPaise !== undefined ? plain(action.payment.penaltyPaise) : "");
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");

    const receivedAt = parseIstDateTime(dateText, timeText);
    const obligation = props.state.obligations.find((o) => o.id === summary.obligationId)!;
    const atDate = useMemo(
        () => (receivedAt !== null ? computeObligation({ obligation, payments: props.state.payments, waivers: props.state.waivers, asOf: receivedAt }) : null),
        [receivedAt, obligation, props.state]
    );

    const run = async (task: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await task();
            if (result && typeof result === "object" && "duplicate" in result && (result as { duplicate: boolean }).duplicate) {
                Alert.alert(s.memberMonth.saved, s.memberMonth.duplicate);
            }
            props.onClose();
        } catch (e) {
            Alert.alert(s.common.error, errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const dateFields = (
        <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 3 }}>
                <Field label={s.memberMonth.receivedDate} value={dateText} onChangeText={setDateText} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 2 }}>
                <Field label={s.memberMonth.receivedTime} value={timeText} onChangeText={setTimeText} keyboardType="numbers-and-punctuation" />
            </View>
        </View>
    );
    const reasonField = <Field label={s.common.reason} value={reason} onChangeText={setReason} placeholder={s.common.reasonPlaceholder} />;

    if (action.kind === "pay") {
        const title = action.mode === "full" ? s.memberMonth.payFull : action.mode === "manual" ? s.memberMonth.payManual : s.memberMonth.collectRemaining;
        const submit = () => {
            if (receivedAt === null) return Alert.alert(s.common.error, s.memberMonth.invalidDate);
            let amountPaise: number | null;
            let principalPaise: number | null;
            let penaltyPaise: number | null;
            if (action.mode === "full") {
                if (!atDate) return;
                principalPaise = atDate.principalOutstandingPaise;
                penaltyPaise = atDate.penaltyOutstandingPaise;
                amountPaise = principalPaise + penaltyPaise;
            } else if (action.mode === "simple") {
                amountPaise = parseRupeeInput(amount);
                principalPaise = amountPaise;
                penaltyPaise = 0;
            } else {
                amountPaise = parseRupeeInput(amount);
                principalPaise = principal.trim() === "" ? 0 : parseRupeeInput(principal);
                penaltyPaise = penalty.trim() === "" ? 0 : parseRupeeInput(penalty);
            }
            if (amountPaise === null || principalPaise === null || penaltyPaise === null || amountPaise <= 0) {
                return Alert.alert(s.common.error, s.memberMonth.invalidAmount);
            }
            void run(() =>
                submitPayment({
                    idempotencyKey,
                    memberId: props.memberId,
                    year: props.ym.year,
                    month: props.ym.month,
                    receivedAt,
                    amountPaise: amountPaise!,
                    principalPaise: principalPaise!,
                    penaltyPaise: penaltyPaise!,
                    mode: action.mode,
                    note,
                })
            );
        };
        return (
            <Sheet visible title={`${title} · ${props.memberName}`} onClose={props.onClose}>
                <Note>{props.monthText}</Note>
                {dateFields}
                {atDate ? (
                    <Card>
                        <Note>{s.common.asOf(dateText)}</Note>
                        <Row label={s.money.installmentOutstanding} value={money(atDate.principalOutstandingPaise)} />
                        {atDate.penaltyOutstandingPaise > 0 || action.mode !== "simple" ? (
                            <Row label={s.money.penaltyOutstanding} value={money(atDate.penaltyOutstandingPaise)} />
                        ) : null}
                        <Row label={s.money.total} value={money(atDate.totalOutstandingPaise)} strong />
                    </Card>
                ) : (
                    <Note tone="danger">{s.memberMonth.invalidDate}</Note>
                )}
                {action.mode === "full" && atDate ? (
                    <Note>{s.memberMonth.fullBreakdown(money(atDate.principalOutstandingPaise), money(atDate.penaltyOutstandingPaise), money(atDate.totalOutstandingPaise))}</Note>
                ) : null}
                {action.mode !== "full" ? <Field label={s.memberMonth.amountReceived} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /> : null}
                {action.mode === "manual" ? (
                    <>
                        <Field label={s.memberMonth.towardsInstallment} value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" />
                        <Field label={s.memberMonth.towardsPenalty} value={penalty} onChangeText={setPenalty} keyboardType="decimal-pad" />
                    </>
                ) : null}
                <Field label={s.memberMonth.note} value={note} onChangeText={setNote} />
                <Button label={s.memberMonth.confirmPayment} onPress={submit} busy={busy} disabled={!atDate} />
            </Sheet>
        );
    }

    if (action.kind === "waive") {
        const submit = () => {
            const p = principal.trim() === "" ? 0 : parseRupeeInput(principal);
            const n = penalty.trim() === "" ? 0 : parseRupeeInput(penalty);
            if (p === null || n === null || p + n <= 0) return Alert.alert(s.common.error, s.memberMonth.invalidAmount);
            void run(() =>
                submitWaiver({ idempotencyKey, memberId: props.memberId, year: props.ym.year, month: props.ym.month, principalPaise: p, penaltyPaise: n, reason })
            );
        };
        return (
            <Sheet visible title={`${s.memberMonth.waive} · ${props.memberName}`} onClose={props.onClose}>
                <Note>{props.monthText}</Note>
                <Note tone="warning">{s.memberMonth.waiverNote}</Note>
                <Row label={s.money.installmentOutstanding} value={money(summary.principalOutstandingPaise)} />
                <Row label={s.money.penaltyOutstanding} value={money(summary.penaltyOutstandingPaise)} />
                <Field label={s.memberMonth.waiveInstallment} value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" />
                <Field label={s.memberMonth.waivePenalty} value={penalty} onChangeText={setPenalty} keyboardType="decimal-pad" />
                {reasonField}
                <Button label={s.common.confirm} onPress={submit} busy={busy} />
            </Sheet>
        );
    }

    if (action.kind === "reset") {
        const preview = previewMonthReset(props.state, props.memberId, props.ym);
        return (
            <Sheet visible title={s.memberMonth.resetPreviewTitle} onClose={props.onClose}>
                <Note>{s.memberMonth.resetPreview(props.memberName, props.monthText, preview.payments.length, money(preview.totalPaise))}</Note>
                {preview.payments.map((p) => (
                    <Row key={p.id} label={formatIstDateTime(p.paidAt)} value={money(paymentAmountPaise(p))} />
                ))}
                {reasonField}
                <Button variant="danger" label={s.memberMonth.reset} onPress={() => void run(() => submitMonthReset(props.memberId, props.ym, reason))} busy={busy} />
            </Sheet>
        );
    }

    if (action.kind === "reverse") {
        return (
            <Sheet visible title={`${s.memberMonth.reverse} ${money(paymentAmountPaise(action.payment))}`} onClose={props.onClose}>
                <Note>{formatIstDateTime(action.payment.paidAt)}</Note>
                {reasonField}
                <Button variant="danger" label={s.memberMonth.reverse} onPress={() => void run(() => submitPaymentReversal(action.payment.id, reason))} busy={busy} />
            </Sheet>
        );
    }

    if (action.kind === "split") {
        const total = paymentAmountPaise(action.payment);
        const submit = () => {
            const p = principal.trim() === "" ? 0 : parseRupeeInput(principal);
            const n = penalty.trim() === "" ? 0 : parseRupeeInput(penalty);
            if (p === null || n === null) return Alert.alert(s.common.error, s.memberMonth.invalidAmount);
            void run(() => submitAllocation(action.payment.id, p, n, reason));
        };
        return (
            <Sheet visible title={action.classify ? s.memberMonth.classify : s.memberMonth.correctSplit} onClose={props.onClose}>
                <Row label={s.memberMonth.received} value={`${money(total)} · ${formatIstDateTime(action.payment.paidAt)}`} strong />
                {action.classify ? <Note tone="warning">{s.memberMonth.legacyNote}</Note> : null}
                <Field label={s.memberMonth.towardsInstallment} value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" />
                <Field label={s.memberMonth.towardsPenalty} value={penalty} onChangeText={setPenalty} keyboardType="decimal-pad" />
                {reasonField}
                <Button label={s.common.save} onPress={submit} busy={busy} />
            </Sheet>
        );
    }

    if (action.kind === "date") {
        const submit = () => {
            if (receivedAt === null) return Alert.alert(s.common.error, s.memberMonth.invalidDate);
            void run(() => submitPaymentDate(action.payment.id, receivedAt, reason));
        };
        return (
            <Sheet visible title={s.memberMonth.correctDate} onClose={props.onClose}>
                <Row label={s.memberMonth.received} value={money(paymentAmountPaise(action.payment))} strong />
                {dateFields}
                {reasonField}
                <Button label={s.common.save} onPress={submit} busy={busy} />
            </Sheet>
        );
    }

    return (
        <Sheet visible title={s.memberMonth.reverse} onClose={props.onClose}>
            {reasonField}
            <Button variant="danger" label={s.memberMonth.reverse} onPress={() => void run(() => submitWaiverReversal(action.waiver.id, reason))} busy={busy} />
        </Sheet>
    );
}
