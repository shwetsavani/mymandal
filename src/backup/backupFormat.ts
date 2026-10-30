import { sha256Hex } from "../domain/checksum";
import { rupeesToPaise } from "../domain/money";
import type { FinancialState, MandalSetup } from "../domain/types";

export const BACKUP_FORMAT = "my-mandal-backup";
export const BACKUP_FORMAT_VERSION = 1;

export type BackupData = FinancialState;

export type MandalBackup = {
    format: typeof BACKUP_FORMAT;
    formatVersion: number;
    createdAt: string;
    appVersion: string;
    schemaVersion: number;
    source: "local" | "cloud-snapshot" | "legacy-cloud-mirror";
    /** Mandal details without PIN or any credential. */
    mandal: Pick<MandalSetup, "mandalName" | "adminName" | "mobile" | "email"> | null;
    counts: { members: number; obligations: number; payments: number; validPayments: number; waivers: number };
    /** Sum of actual amounts received on non-reversed payments, in paise. */
    totalReceivedPaise: number;
    checksum: string;
    data: BackupData;
};

export const paymentAmountPaise = (payment: FinancialState["payments"][number]): number =>
    typeof payment.amountPaise === "number" ? payment.amountPaise : rupeesToPaise(payment.actualCollectedAmount);

export const summarizeData = (data: BackupData) => {
    const validPayments = data.payments.filter((p) => p.status !== "reversed");
    return {
        counts: {
            members: data.members.length,
            obligations: data.obligations.length,
            payments: data.payments.length,
            validPayments: validPayments.length,
            waivers: data.waivers.length,
        },
        totalReceivedPaise: validPayments.reduce((sum, p) => sum + paymentAmountPaise(p), 0),
    };
};

export const buildBackup = (params: {
    state: FinancialState;
    setup: MandalSetup | null;
    appVersion: string;
    schemaVersion: number;
    source?: MandalBackup["source"];
    createdAt?: string;
}): MandalBackup => {
    const data: BackupData = {
        members: params.state.members,
        obligations: params.state.obligations,
        payments: params.state.payments,
        waivers: params.state.waivers,
        auditLog: params.state.auditLog,
        // The cloud owner uid is device binding, not financial data.
        settings: { ...params.state.settings, cloudOwnerUid: undefined },
    };
    const summary = summarizeData(data);
    return {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: params.createdAt ?? new Date().toISOString(),
        appVersion: params.appVersion,
        schemaVersion: params.schemaVersion,
        source: params.source ?? "local",
        mandal: params.setup
            ? {
                  mandalName: params.setup.mandalName,
                  adminName: params.setup.adminName,
                  mobile: params.setup.mobile,
                  email: params.setup.email,
              }
            : null,
        ...summary,
        checksum: sha256Hex(JSON.stringify(data)),
        data,
    };
};

export type BackupValidation = {
    ok: boolean;
    errors: string[];
    warnings: string[];
    backup: MandalBackup | null;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNonNegative = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
const isPaiseValue = (value: unknown): boolean => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isDate = (value: unknown): boolean => typeof value === "string" && Number.isFinite(Date.parse(value));
const isMonth = (year: unknown, month: unknown): boolean =>
    Number.isInteger(year) && Number.isInteger(month) && (year as number) >= 2000 && (year as number) <= 2100 && (month as number) >= 1 && (month as number) <= 12;

/**
 * Validates financial data before it is allowed to replace local data:
 * schema, unique IDs, relationships, monetary fields and dates.
 */
export const validateBackupData = (data: unknown): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const d = data as Partial<BackupData> | null;
    if (!d || typeof d !== "object") {
        return { errors: ["Backup data is missing."], warnings };
    }
    for (const key of ["members", "obligations", "payments", "waivers", "auditLog"] as const) {
        if (!Array.isArray(d[key])) {
            errors.push(`"${key}" must be a list.`);
        }
    }
    if (errors.length > 0) {
        return { errors, warnings };
    }
    const members = d.members!;
    const obligations = d.obligations!;
    const payments = d.payments!;
    const waivers = d.waivers!;

    const memberIds = new Set<string>();
    members.forEach((m, i) => {
        if (!isNonEmptyString(m?.id)) errors.push(`Member #${i + 1} has no ID.`);
        else if (memberIds.has(m.id)) errors.push(`Duplicate member ID ${m.id}.`);
        else memberIds.add(m.id);
        if (!isNonEmptyString(m?.name)) errors.push(`Member ${m?.id} has no name.`);
        if (!isFiniteNonNegative(m?.monthlyInstallment) || m.monthlyInstallment <= 0)
            errors.push(`Member ${m?.id} has an invalid installment.`);
    });

    const obligationById = new Map<string, NonNullable<typeof obligations>[number]>();
    const obligationSlots = new Set<string>();
    obligations.forEach((o, i) => {
        if (!isNonEmptyString(o?.id)) {
            errors.push(`Obligation #${i + 1} has no ID.`);
            return;
        }
        if (obligationById.has(o.id)) errors.push(`Duplicate obligation ID ${o.id}.`);
        obligationById.set(o.id, o);
        if (!memberIds.has(o.memberId)) errors.push(`Obligation ${o.id} refers to a missing member.`);
        if (!isMonth(o.year, o.month)) errors.push(`Obligation ${o.id} has an invalid month.`);
        if (!isFiniteNonNegative(o.originalInstallment)) errors.push(`Obligation ${o.id} has an invalid installment.`);
        const slot = `${o.memberId}|${o.year}|${o.month}`;
        if (obligationSlots.has(slot)) errors.push(`More than one obligation for member ${o.memberId} in ${o.month}/${o.year}.`);
        obligationSlots.add(slot);
    });

    const paymentIds = new Set<string>();
    payments.forEach((p, i) => {
        if (!isNonEmptyString(p?.id)) {
            errors.push(`Payment #${i + 1} has no ID.`);
            return;
        }
        if (paymentIds.has(p.id)) errors.push(`Duplicate payment ID ${p.id}.`);
        paymentIds.add(p.id);
        const obligation = obligationById.get(p.obligationId);
        if (!obligation) errors.push(`Payment ${p.id} refers to a missing obligation.`);
        else if (obligation.memberId !== p.memberId) errors.push(`Payment ${p.id} member does not match its obligation.`);
        if (!isFiniteNonNegative(p.actualCollectedAmount)) errors.push(`Payment ${p.id} has an invalid amount.`);
        if (!isDate(p.paidAt)) errors.push(`Payment ${p.id} has an invalid payment date.`);
        if (p.amountPaise !== undefined) {
            if (!isPaiseValue(p.amountPaise)) errors.push(`Payment ${p.id} has an invalid paise amount.`);
            else if (isFiniteNonNegative(p.actualCollectedAmount) && rupeesToPaise(p.actualCollectedAmount) !== p.amountPaise)
                errors.push(`Payment ${p.id} amount fields disagree.`);
        }
        if (p.principalPaise !== undefined || p.penaltyPaise !== undefined) {
            if (!isPaiseValue(p.principalPaise) || !isPaiseValue(p.penaltyPaise))
                errors.push(`Payment ${p.id} has invalid allocation values.`);
            else if (p.principalPaise! + p.penaltyPaise! !== paymentAmountPaise(p))
                errors.push(`Payment ${p.id} allocation does not equal the amount received.`);
        }
    });

    const waiverIds = new Set<string>();
    waivers.forEach((w, i) => {
        if (!isNonEmptyString(w?.id)) {
            errors.push(`Waiver #${i + 1} has no ID.`);
            return;
        }
        if (waiverIds.has(w.id)) errors.push(`Duplicate waiver ID ${w.id}.`);
        waiverIds.add(w.id);
        if (!obligationById.has(w.obligationId)) errors.push(`Waiver ${w.id} refers to a missing obligation.`);
        if (!isPaiseValue(w.principalPaise) || !isPaiseValue(w.penaltyPaise)) errors.push(`Waiver ${w.id} has invalid amounts.`);
        if (!isNonEmptyString(w.reason)) errors.push(`Waiver ${w.id} has no reason.`);
        if (!isDate(w.effectiveAt)) errors.push(`Waiver ${w.id} has an invalid date.`);
    });

    if (members.length === 0) warnings.push("This backup contains no members.");
    if (payments.length === 0) warnings.push("This backup contains no payments.");
    return { errors, warnings };
};

export const parseAndValidateBackup = (json: string): BackupValidation => {
    let parsed: MandalBackup;
    try {
        parsed = JSON.parse(json) as MandalBackup;
    } catch {
        return { ok: false, errors: ["The file is not valid JSON."], warnings: [], backup: null };
    }
    return validateBackup(parsed);
};

export const validateBackup = (parsed: MandalBackup): BackupValidation => {
    const errors: string[] = [];
    if (!parsed || parsed.format !== BACKUP_FORMAT) {
        return { ok: false, errors: ["This is not a My Mandal backup file."], warnings: [], backup: null };
    }
    if (typeof parsed.formatVersion !== "number" || parsed.formatVersion > BACKUP_FORMAT_VERSION) {
        errors.push("This backup was created by a newer app version.");
    }
    if (parsed.checksum !== sha256Hex(JSON.stringify(parsed.data))) {
        errors.push("Checksum mismatch: the backup file is incomplete or was modified.");
    }
    const result = validateBackupData(parsed.data);
    errors.push(...result.errors);
    if (errors.length === 0) {
        const summary = summarizeData(parsed.data);
        if (summary.counts.payments !== parsed.counts?.payments || summary.totalReceivedPaise !== parsed.totalReceivedPaise) {
            errors.push("Backup totals do not match its contents.");
        }
    }
    return { ok: errors.length === 0, errors, warnings: result.warnings, backup: errors.length === 0 ? parsed : null };
};

const stripSyncFields = <T extends object>(records: unknown[]): T[] =>
    records.map((record) => {
        const { syncedAt: _syncedAt, ...rest } = (record ?? {}) as Record<string, unknown>;
        return rest as T;
    });

/**
 * Accepts either a My Mandal backup file or the JSON written by
 * tools/firestore-readonly-export.mjs (legacy cloud mirror), and returns a
 * validated backup. A legacy mirror is flagged so the UI can warn that it is
 * an unverified copy.
 */
export const parseAnyBackup = (json: string, appVersion: string): BackupValidation & { legacyMirror: boolean } => {
    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { ok: false, errors: ["The file is not valid JSON."], warnings: [], backup: null, legacyMirror: false };
    }
    if (parsed?.kind === "my-mandal-firestore-readonly-export") {
        const state: FinancialState = {
            members: stripSyncFields(parsed.members ?? []),
            obligations: stripSyncFields(parsed.obligations ?? []),
            payments: stripSyncFields(parsed.payments ?? []),
            waivers: [],
            auditLog: [],
            settings: {},
        };
        const backup = buildBackup({
            state,
            setup: null,
            appVersion,
            schemaVersion: 1,
            source: "legacy-cloud-mirror",
            createdAt: parsed.exportedAt,
        });
        const result = validateBackup(backup);
        return {
            ...result,
            warnings: ["This is a copy of the old cloud mirror. Compare it with your records before relying on it.", ...result.warnings],
            legacyMirror: true,
        };
    }
    return { ...validateBackup(parsed), legacyMirror: false };
};

/** A restore that would remove members or payments needs typed confirmation. */
export const isDestructiveRestore = (current: FinancialState, incoming: BackupData): boolean =>
    incoming.members.length === 0 ||
    incoming.members.length < current.members.length ||
    incoming.payments.length < current.payments.length ||
    incoming.obligations.length < current.obligations.length;
