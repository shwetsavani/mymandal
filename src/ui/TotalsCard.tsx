import React from "react";

import type { ObligationSummary, Totals } from "../domain/financeEngine";
import { useStrings } from "../localization/strings";
import { Card, Row } from "./components";
import { money } from "./selectors";

type Figures = Pick<
    Totals,
    | "installmentPaise"
    | "principalCollectedPaise"
    | "principalWaivedPaise"
    | "principalOutstandingPaise"
    | "penaltyChargedPaise"
    | "penaltyCollectedPaise"
    | "penaltyWaivedPaise"
    | "penaltyOutstandingPaise"
    | "cashCollectedPaise"
    | "unclassifiedPaise"
    | "excessPaise"
    | "totalOutstandingPaise"
    | "reversedPaise"
>;

/** The standard breakdown used on every screen, from the shared engine. */
export function TotalsCard(props: { title?: string; figures: Figures | ObligationSummary; asOfLabel?: string; children?: React.ReactNode }) {
    const s = useStrings();
    const f = props.figures;
    return (
        <Card title={props.title}>
            {props.asOfLabel ? <Row label={props.asOfLabel} value="" tone="muted" /> : null}
            <Row label={s.money.originalInstallment} value={money(f.installmentPaise)} />
            <Row label={s.money.installmentCollected} value={money(f.principalCollectedPaise)} tone="success" />
            {f.principalWaivedPaise > 0 ? <Row label={s.money.installmentWaived} value={money(f.principalWaivedPaise)} /> : null}
            <Row label={s.money.installmentOutstanding} value={money(f.principalOutstandingPaise)} tone={f.principalOutstandingPaise > 0 ? "danger" : undefined} />
            <Row label={s.money.penaltyCharged} value={money(f.penaltyChargedPaise)} />
            <Row label={s.money.penaltyCollected} value={money(f.penaltyCollectedPaise)} tone="success" />
            {f.penaltyWaivedPaise > 0 ? <Row label={s.money.penaltyWaived} value={money(f.penaltyWaivedPaise)} /> : null}
            <Row label={s.money.penaltyOutstanding} value={money(f.penaltyOutstandingPaise)} tone={f.penaltyOutstandingPaise > 0 ? "danger" : undefined} />
            <Row label={s.money.cashCollected} value={money(f.cashCollectedPaise)} strong />
            {f.unclassifiedPaise > 0 ? <Row label={s.money.unclassified} value={money(f.unclassifiedPaise)} tone="danger" /> : null}
            {f.excessPaise > 0 ? <Row label={s.money.excess} value={money(f.excessPaise)} tone="danger" /> : null}
            {f.reversedPaise > 0 ? <Row label={s.money.reversed} value={money(f.reversedPaise)} tone="muted" /> : null}
            <Row label={s.money.totalRemaining} value={money(f.totalOutstandingPaise)} strong tone={f.totalOutstandingPaise > 0 ? "danger" : "success"} />
            {props.children}
        </Card>
    );
}
