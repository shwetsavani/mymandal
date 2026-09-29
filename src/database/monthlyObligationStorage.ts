import AsyncStorage from "@react-native-async-storage/async-storage";
import { triggerCloudSync } from "../services/cloudSync";

export type MonthlyObligationStatus =
    | "pending"
    | "partially_paid"
    | "paid"
    | "overdue";

export type MonthlyObligation = {
    id: string;

    memberId: string;

    year: number;

    month: number;

    originalInstallment: number;

    currentAmountDue: number;

    penalty: number;

    paidAmount: number;

    remainingAmount: number;

    status: MonthlyObligationStatus;

    createdAt: string;

    updatedAt: string;
};

const OBLIGATIONS_KEY = "mandal_monthly_obligations";

export const getMonthlyObligations =
    async (): Promise<MonthlyObligation[]> => {
        try {
            const data =
                await AsyncStorage.getItem(
                    OBLIGATIONS_KEY
                );

            if (!data) {
                return [];
            }

            return JSON.parse(data);
        } catch (error) {
            console.error(
                "Get monthly obligations error:",
                error
            );

            return [];
        }
    };

export const saveMonthlyObligations =
    async (
        obligations: MonthlyObligation[]
    ): Promise<void> => {
        try {
            // Always save locally first.
            await AsyncStorage.setItem(
                OBLIGATIONS_KEY,
                JSON.stringify(obligations)
            );

            // Automatically sync to Firebase.
            // This does not block the local save.
            void triggerCloudSync();
        } catch (error) {
            console.error(
                "Save monthly obligations error:",
                error
            );

            throw error;
        }
    };

export const getMonthlyObligation =
    async (
        memberId: string,
        year: number,
        month: number
    ): Promise<MonthlyObligation | null> => {
        const obligations =
            await getMonthlyObligations();

        return (
            obligations.find(
                (obligation) =>
                    obligation.memberId === memberId &&
                    obligation.year === year &&
                    obligation.month === month
            ) ?? null
        );
    };

export const createMonthlyObligation =
    async (
        memberId: string,
        year: number,
        month: number,
        originalInstallment: number
    ): Promise<MonthlyObligation> => {
        const obligations =
            await getMonthlyObligations();

        const existing =
            obligations.find(
                (obligation) =>
                    obligation.memberId === memberId &&
                    obligation.year === year &&
                    obligation.month === month
            );

        if (existing) {
            return existing;
        }

        const now =
            new Date().toISOString();

        const newObligation: MonthlyObligation = {
            id: `${memberId}-${year}-${month}`,

            memberId,

            year,

            month,

            originalInstallment,

            currentAmountDue:
            originalInstallment,

            penalty: 0,

            paidAmount: 0,

            remainingAmount:
            originalInstallment,

            status: "pending",

            createdAt: now,

            updatedAt: now,
        };

        await saveMonthlyObligations([
            ...obligations,
            newObligation,
        ]);

        return newObligation;
    };

export const updateMonthlyObligation =
    async (
        obligationId: string,
        updates: Partial<
            Pick<
                MonthlyObligation,
                | "currentAmountDue"
                | "penalty"
                | "paidAmount"
                | "remainingAmount"
                | "status"
            >
        >
    ): Promise<void> => {
        const obligations =
            await getMonthlyObligations();

        const obligationExists =
            obligations.some(
                (obligation) =>
                    obligation.id === obligationId
            );

        if (!obligationExists) {
            throw new Error(
                "Monthly obligation not found."
            );
        }

        const updatedObligations =
            obligations.map(
                (obligation) =>
                    obligation.id === obligationId
                        ? {
                            ...obligation,
                            ...updates,
                            updatedAt:
                                new Date().toISOString(),
                        }
                        : obligation
            );

        await saveMonthlyObligations(
            updatedObligations
        );
    };

/**
 * Permanently removes every monthly obligation
 * belonging to a specific member.
 *
 * This is used when a member permanently leaves
 * the Mandal.
 */
export const deleteMonthlyObligationsForMember =
    async (
        memberId: string
    ): Promise<void> => {
        const obligations =
            await getMonthlyObligations();

        const updatedObligations =
            obligations.filter(
                (obligation) =>
                    obligation.memberId !== memberId
            );

        await saveMonthlyObligations(
            updatedObligations
        );
    };