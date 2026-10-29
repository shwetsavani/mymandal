import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Synthetic data in the exact shape written by the original app (schema v1):
 * eight members (₹1,000 or ₹500), September and October 2026 obligations,
 * rupee float payments with cached obligation values, a pending installment
 * change, and a plaintext PIN. Names are test data only.
 */
const MEMBERS = [
    { id: "m1", name: "Tarul", amount: 1000 },
    { id: "m2", name: "Asha", amount: 1000 },
    { id: "m3", name: "Bhavin", amount: 500 },
    { id: "m4", name: "Chetan", amount: 1000 },
    { id: "m5", name: "Daksha", amount: 500 },
    { id: "m6", name: "Esha", amount: 1000 },
    { id: "m7", name: "Farhan", amount: 500 },
    { id: "m8", name: "Gopi", amount: 1000 },
];

export const LEGACY_PIN = "4826";

export const buildLegacyDataset = () => {
    const members = MEMBERS.map((m, i) => ({
        id: m.id,
        name: m.name,
        mobile: `98765432${String(i).padStart(2, "0")}`,
        monthlyInstallment: m.amount,
        isActive: true,
        createdAt: "2026-09-01T05:00:00.000Z",
        ...(m.id === "m8"
            ? { pendingMonthlyInstallment: 500, pendingInstallmentEffectiveYear: 2026, pendingInstallmentEffectiveMonth: 11 }
            : {}),
    }));
    const obligations = MEMBERS.flatMap((m) =>
        [9, 10].map((month) => ({
            id: `${m.id}-2026-${month}`,
            memberId: m.id,
            year: 2026,
            month,
            originalInstallment: m.amount,
            currentAmountDue: m.amount,
            penalty: 0,
            paidAmount: month === 9 ? m.amount : 0,
            remainingAmount: month === 9 ? 0 : m.amount,
            status: month === 9 ? "paid" : "pending",
            createdAt: `2026-${String(month).padStart(2, "0")}-01T05:00:00.000Z`,
            updatedAt: `2026-${String(month).padStart(2, "0")}-05T05:00:00.000Z`,
        }))
    );
    const payments = [
        ...MEMBERS.map((m, i) => ({
            id: `p-sep-${m.id}`,
            obligationId: `${m.id}-2026-9`,
            memberId: m.id,
            year: 2026,
            month: 9,
            calculatedAmount: m.amount,
            calculatedPenalty: 0,
            actualCollectedAmount: m.amount,
            isManualOverride: false,
            paidAt: `2026-09-${String(5 + i).padStart(2, "0")}T06:30:00.000Z`,
            createdAt: `2026-09-${String(5 + i).padStart(2, "0")}T06:30:00.000Z`,
            updatedAt: `2026-09-${String(5 + i).padStart(2, "0")}T06:30:00.000Z`,
        })),
        {
            id: "p-oct-m1",
            obligationId: "m1-2026-10",
            memberId: "m1",
            year: 2026,
            month: 10,
            calculatedAmount: 400,
            calculatedPenalty: 0,
            actualCollectedAmount: 400,
            isManualOverride: false,
            paidAt: "2026-10-08T07:00:00.000Z",
            createdAt: "2026-10-08T07:00:00.000Z",
            updatedAt: "2026-10-08T07:00:00.000Z",
        },
        {
            id: "p-oct-m2",
            obligationId: "m2-2026-10",
            memberId: "m2",
            year: 2026,
            month: 10,
            calculatedAmount: 1200,
            calculatedPenalty: 200,
            actualCollectedAmount: 1199.5,
            isManualOverride: true,
            overrideReason: "Rounded",
            paidAt: "2026-10-17T07:00:00.000Z",
            createdAt: "2026-10-17T07:00:00.000Z",
            updatedAt: "2026-10-17T07:00:00.000Z",
        },
    ];
    const setup = {
        mandalName: "Test Mandal",
        adminName: "Admin",
        mobile: "9999999999",
        email: "admin@example.com",
        pin: LEGACY_PIN,
        createdAt: "2026-09-01T04:00:00.000Z",
    };
    return { members, obligations, payments, setup };
};

export const seedLegacyStorage = async (): Promise<Record<string, string>> => {
    const data = buildLegacyDataset();
    const raw: Record<string, string> = {
        mandal_members: JSON.stringify(data.members),
        mandal_monthly_obligations: JSON.stringify(data.obligations),
        mandal_payments: JSON.stringify(data.payments),
        mandal_setup: JSON.stringify(data.setup),
        mandal_app_language: "gu",
        mandal_biometric_enabled: "false",
        mandal_cloud_deleted_records: JSON.stringify([]),
    };
    await AsyncStorage.multiSet(Object.entries(raw));
    return raw;
};
