import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    recordDeletedRecord,
} from "../services/syncDeletionStorage";

import {
    triggerCloudSync,
} from "../services/cloudSync";

export type Member = {
    id: string;

    name: string;

    mobile: string;

    monthlyInstallment: number;

    isActive: boolean;

    createdAt: string;

    /**
     * When an installment is changed, the new amount is scheduled
     * for the next calendar month instead of changing the current
     * month's obligation.
     */
    pendingMonthlyInstallment?: number;

    pendingInstallmentEffectiveYear?: number;

    pendingInstallmentEffectiveMonth?: number;
};

const MEMBERS_KEY = "mandal_members";

export const getMembers =
    async (): Promise<Member[]> => {
        try {
            const data =
                await AsyncStorage.getItem(
                    MEMBERS_KEY
                );

            if (!data) {
                return [];
            }

            return JSON.parse(data);
        } catch (error) {
            console.error(
                "Get members error:",
                error
            );

            return [];
        }
    };

export const saveMembers =
    async (
        members: Member[]
    ): Promise<void> => {
        try {
            // Always save locally first.
            await AsyncStorage.setItem(
                MEMBERS_KEY,
                JSON.stringify(members)
            );

            // Automatically sync the local
            // change to Firebase.
            void triggerCloudSync();
        } catch (error) {
            console.error(
                "Save members error:",
                error
            );

            throw error;
        }
    };

export const addMember =
    async (
        name: string,
        mobile: string,
        monthlyInstallment: number
    ): Promise<Member> => {
        const members =
            await getMembers();

        const newMember: Member = {
            id: `${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 9)}`,

            name,

            mobile,

            monthlyInstallment,

            isActive: true,

            createdAt:
                new Date().toISOString(),
        };

        await saveMembers([
            ...members,
            newMember,
        ]);

        return newMember;
    };

/**
 * Returns the installment that applies to a specific
 * calendar month.
 *
 * If a new installment was scheduled for this month
 * or an earlier month, it is promoted to the member's
 * current installment and the pending schedule is cleared.
 */
export const getInstallmentForMonth =
    async (
        memberId: string,
        year: number,
        month: number
    ): Promise<number> => {
        const members =
            await getMembers();

        const memberIndex =
            members.findIndex(
                (member) =>
                    member.id ===
                    memberId
            );

        if (memberIndex === -1) {
            throw new Error(
                "Member not found."
            );
        }

        const member =
            members[memberIndex];

        const effectiveYear =
            member.pendingInstallmentEffectiveYear;

        const effectiveMonth =
            member.pendingInstallmentEffectiveMonth;

        const pendingInstallment =
            member.pendingMonthlyInstallment;

        if (
            pendingInstallment !==
            undefined &&
            effectiveYear !==
            undefined &&
            effectiveMonth !==
            undefined
        ) {
            const targetMonthKey =
                year * 12 +
                (month - 1);

            const effectiveMonthKey =
                effectiveYear * 12 +
                (effectiveMonth - 1);

            if (
                targetMonthKey >=
                effectiveMonthKey
            ) {
                const updatedMember:
                    Member = {
                    ...member,

                    monthlyInstallment:
                    pendingInstallment,

                    pendingMonthlyInstallment:
                    undefined,

                    pendingInstallmentEffectiveYear:
                    undefined,

                    pendingInstallmentEffectiveMonth:
                    undefined,
                };

                members[memberIndex] =
                    updatedMember;

                await saveMembers(
                    members
                );

                return pendingInstallment;
            }
        }

        return member.monthlyInstallment;
    };

/**
 * Updates basic member details.
 *
 * A monthly installment change is intentionally scheduled
 * for the next calendar month. The current month's installment
 * remains unchanged.
 */
export const updateMember =
    async (
        memberId: string,
        updates: Partial<
            Pick<
                Member,
                "name" | "mobile"
            >
        > & {
            monthlyInstallment?: number;
        }
    ): Promise<void> => {
        const members =
            await getMembers();

        const memberIndex =
            members.findIndex(
                (member) =>
                    member.id ===
                    memberId
            );

        if (memberIndex === -1) {
            throw new Error(
                "Member not found."
            );
        }

        const currentMember =
            members[memberIndex];

        const updatedMember:
            Member = {
            ...currentMember,

            name:
                updates.name ??
                currentMember.name,

            mobile:
                updates.mobile ??
                currentMember.mobile,
        };

        if (
            updates.monthlyInstallment !==
            undefined &&
            updates.monthlyInstallment !==
            currentMember.monthlyInstallment
        ) {
            const now =
                new Date();

            let nextYear =
                now.getFullYear();

            let nextMonth =
                now.getMonth() + 2;

            if (nextMonth === 13) {
                nextMonth = 1;
                nextYear += 1;
            }

            updatedMember.pendingMonthlyInstallment =
                updates.monthlyInstallment;

            updatedMember.pendingInstallmentEffectiveYear =
                nextYear;

            updatedMember.pendingInstallmentEffectiveMonth =
                nextMonth;
        }

        members[memberIndex] =
            updatedMember;

        await saveMembers(
            members
        );
    };

export const setMemberActive =
    async (
        memberId: string,
        isActive: boolean
    ): Promise<void> => {
        const members =
            await getMembers();

        const memberExists =
            members.some(
                (member) =>
                    member.id ===
                    memberId
            );

        if (!memberExists) {
            throw new Error(
                "Member not found."
            );
        }

        const updatedMembers =
            members.map(
                (member) =>
                    member.id ===
                    memberId
                        ? {
                            ...member,
                            isActive,
                        }
                        : member
            );

        await saveMembers(
            updatedMembers
        );
    };

/**
 * Permanently removes the member record.
 *
 * The member's monthly obligations and payment
 * records are removed separately by their storage
 * modules as part of the complete deletion flow.
 *
 * A deletion record is stored before removing the
 * member locally so Firebase can permanently remove
 * the corresponding cloud record during the next sync.
 */
export const deleteMember =
    async (
        memberId: string
    ): Promise<void> => {
        const members =
            await getMembers();

        const memberExists =
            members.some(
                (member) =>
                    member.id ===
                    memberId
            );

        if (!memberExists) {
            throw new Error(
                "Member not found."
            );
        }

        /*
         * Record the deletion BEFORE removing
         * the member from local storage.
         *
         * This allows cloud sync to know that
         * the Firebase member document must also
         * be permanently deleted.
         */
        await recordDeletedRecord(
            "members",
            memberId
        );

        const updatedMembers =
            members.filter(
                (member) =>
                    member.id !==
                    memberId
            );

        /*
         * Save locally first.
         * saveMembers() automatically triggers
         * cloud synchronization.
         */
        await saveMembers(
            updatedMembers
        );
    };