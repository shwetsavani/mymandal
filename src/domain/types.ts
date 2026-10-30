/**
 * Persisted record shapes.
 *
 * Every v2 field is optional and additive: records written by the original
 * app (schema v1) remain valid and are interpreted on read, never bulk
 * rewritten.
 */

export type InstallmentScheduleEntry = {
    year: number;
    month: number;
    /** Monthly installment in rupees (legacy unit, always a whole rupee amount). */
    amount: number;
};

export type MembershipStatus = "active" | "closed";

export type Member = {
    id: string;
    name: string;
    mobile: string;
    /** Rupees. Current installment (legacy field). */
    monthlyInstallment: number;
    isActive: boolean;
    createdAt: string;
    pendingMonthlyInstallment?: number;
    pendingInstallmentEffectiveYear?: number;
    pendingInstallmentEffectiveMonth?: number;

    // v2 additive fields
    obligationStartYear?: number;
    obligationStartMonth?: number;
    installmentSchedule?: InstallmentScheduleEntry[];
    membershipStatus?: MembershipStatus;
    closedAt?: string;
    closedThroughYear?: number;
    closedThroughMonth?: number;
    closureReason?: string;
    updatedAt?: string;
};

export type LegacyObligationStatus = "pending" | "partially_paid" | "paid" | "overdue";

export type MonthlyObligation = {
    id: string;
    memberId: string;
    year: number;
    month: number;
    /** Rupees. The installment owed for this month; never changed after creation. */
    originalInstallment: number;
    /** Legacy cached values written by v1. Kept for audit only, not used for calculations. */
    currentAmountDue: number;
    penalty: number;
    paidAmount: number;
    remainingAmount: number;
    status: LegacyObligationStatus;
    createdAt: string;
    updatedAt: string;

    // v2 additive fields
    generatedBy?: "generator" | "advance";
};

export type AllocationSource = "entered" | "full" | "classified";

export type PaymentCorrection = {
    at: string;
    reason: string;
    previousPrincipalPaise?: number;
    previousPenaltyPaise?: number;
    previousPaidAt?: string;
    previousAllocationSource?: AllocationSource;
};

export type Payment = {
    id: string;
    obligationId: string;
    memberId: string;
    year: number;
    month: number;
    /** Legacy v1 preview values (rupees). Kept for audit only. */
    calculatedAmount: number;
    calculatedPenalty: number;
    /** Rupees actually received. Never changed after creation. */
    actualCollectedAmount: number;
    isManualOverride: boolean;
    overrideReason?: string;
    /** Actual received date/time (ISO). */
    paidAt: string;
    createdAt: string;
    updatedAt: string;

    // v2 additive fields
    /** Exact amount received in paise; for legacy payments derived from actualCollectedAmount. */
    amountPaise?: number;
    principalPaise?: number;
    penaltyPaise?: number;
    allocationSource?: AllocationSource;
    status?: "valid" | "reversed";
    reversedAt?: string;
    reversalReason?: string;
    reversalBatchId?: string;
    idempotencyKey?: string;
    note?: string;
    corrections?: PaymentCorrection[];
};

export type Waiver = {
    id: string;
    obligationId: string;
    memberId: string;
    year: number;
    month: number;
    principalPaise: number;
    penaltyPaise: number;
    /** Instant from which the waiver applies (ISO). */
    effectiveAt: string;
    reason: string;
    createdAt: string;
    status?: "valid" | "reversed";
    reversedAt?: string;
    reversalReason?: string;
    idempotencyKey?: string;
};

export type AuditEntry = {
    id: string;
    at: string;
    action: string;
    memberId?: string;
    obligationId?: string;
    paymentId?: string;
    waiverId?: string;
    reason?: string;
    details?: string;
};

export type MandalSettings = {
    mandalStartYear?: number;
    mandalStartMonth?: number;
    /** Firebase uid that owns cloud backups for this phone. */
    cloudOwnerUid?: string;
    migratedAt?: string;
};

export type MandalSetup = {
    mandalName: string;
    adminName: string;
    mobile: string;
    email: string;
    /** Legacy plaintext PIN. Removed once the SecureStore verifier is confirmed. */
    pin?: string;
    pinMigratedAt?: string;
    createdAt: string;
};

export type FinancialState = {
    members: Member[];
    obligations: MonthlyObligation[];
    payments: Payment[];
    waivers: Waiver[];
    auditLog: AuditEntry[];
    settings: MandalSettings;
};

export const isPaymentValid = (payment: Payment): boolean => payment.status !== "reversed";
export const isWaiverValid = (waiver: Waiver): boolean => waiver.status !== "reversed";
export const isMemberClosed = (member: Member): boolean => member.membershipStatus === "closed";

export const newId = (): string =>
    `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
