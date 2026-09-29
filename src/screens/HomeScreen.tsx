import React, { useCallback, useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import {
    useFocusEffect,
    useNavigation,
} from "@react-navigation/native";

import type {
    NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import {
    getMembers,
    getInstallmentForMonth,
} from "../database/memberStorage";

import {
    createMonthlyObligation,
    getMonthlyObligations,
    type MonthlyObligation,
} from "../database/monthlyObligationStorage";

import {
    getPayments,
    type Payment,
} from "../database/paymentStorage";

type RootStackParamList = {
    Home: undefined;
    Members: undefined;
    AddMember: undefined;
    MonthlyPayments: undefined;
    History: undefined;
    Reports: undefined;
    Export: undefined;
    Settings: undefined;
};

type HomeScreenNavigationProp =
    NativeStackNavigationProp<
        RootStackParamList,
        "Home"
    >;

type DashboardData = {
    memberCount: number;
    paidCount: number;
    pendingCount: number;
    originalInstallments: number;
    penalty: number;
    collected: number;
    pendingAmount: number;
    oldOverdue: number;
};

export default function HomeScreen() {
    const navigation =
        useNavigation<HomeScreenNavigationProp>();

    const [dashboard, setDashboard] =
        useState<DashboardData>({
            memberCount: 0,
            paidCount: 0,
            pendingCount: 0,
            originalInstallments: 0,
            penalty: 0,
            collected: 0,
            pendingAmount: 0,
            oldOverdue: 0,
        });

    const [loading, setLoading] =
        useState(true);

    const now = new Date();

    const currentYear =
        now.getFullYear();

    const currentMonth =
        now.getMonth() + 1;

    const loadDashboard = async () => {
        try {
            setLoading(true);

            const members =
                await getMembers();

            const activeMembers =
                members.filter(
                    (member) =>
                        member.isActive
                );

            /*
             * Ensure the current month's
             * obligations exist using the
             * installment effective for this
             * specific month.
             */
            for (const member of activeMembers) {
                const installmentForMonth =
                    await getInstallmentForMonth(
                        member.id,
                        currentYear,
                        currentMonth
                    );

                await createMonthlyObligation(
                    member.id,
                    currentYear,
                    currentMonth,
                    installmentForMonth
                );
            }

            const allObligations =
                await getMonthlyObligations();

            const allPayments =
                await getPayments();

            const currentObligations =
                allObligations.filter(
                    (obligation) =>
                        obligation.year ===
                        currentYear &&
                        obligation.month ===
                        currentMonth &&
                        activeMembers.some(
                            (member) =>
                                member.id ===
                                obligation.memberId
                        )
                );

            const currentPayments =
                allPayments.filter(
                    (payment) =>
                        payment.year ===
                        currentYear &&
                        payment.month ===
                        currentMonth &&
                        activeMembers.some(
                            (member) =>
                                member.id ===
                                payment.memberId
                        )
                );

            const paidByObligation =
                new Map<string, number>();

            currentPayments.forEach(
                (payment: Payment) => {
                    const existing =
                        paidByObligation.get(
                            payment.obligationId
                        ) ?? 0;

                    paidByObligation.set(
                        payment.obligationId,
                        existing +
                        payment.actualCollectedAmount
                    );
                }
            );

            let originalInstallments = 0;
            let totalPenalty = 0;
            let collected = 0;
            let pendingAmount = 0;
            let paidCount = 0;
            let pendingCount = 0;

            currentObligations.forEach(
                (
                    obligation: MonthlyObligation
                ) => {
                    originalInstallments +=
                        obligation.originalInstallment;

                    totalPenalty +=
                        obligation.penalty;

                    const paid =
                        paidByObligation.get(
                            obligation.id
                        ) ?? 0;

                    collected += paid;

                    const remaining =
                        Math.max(
                            obligation.currentAmountDue -
                            paid,
                            0
                        );

                    pendingAmount +=
                        remaining;

                    if (remaining <= 0) {
                        paidCount += 1;
                    } else {
                        pendingCount += 1;
                    }
                }
            );

            const totalPaidByObligation =
                new Map<string, number>();

            allPayments.forEach(
                (payment: Payment) => {
                    const existing =
                        totalPaidByObligation.get(
                            payment.obligationId
                        ) ?? 0;

                    totalPaidByObligation.set(
                        payment.obligationId,
                        existing +
                        payment.actualCollectedAmount
                    );
                }
            );

            let calculatedOldOverdue = 0;

            allObligations.forEach(
                (
                    obligation: MonthlyObligation
                ) => {
                    const isPreviousMonth =
                        obligation.year <
                        currentYear ||
                        (
                            obligation.year ===
                            currentYear &&
                            obligation.month <
                            currentMonth
                        );

                    if (!isPreviousMonth) {
                        return;
                    }

                    const paid =
                        totalPaidByObligation.get(
                            obligation.id
                        ) ?? 0;

                    const remaining =
                        Math.max(
                            obligation.currentAmountDue -
                            paid,
                            0
                        );

                    calculatedOldOverdue +=
                        remaining;
                }
            );

            setDashboard({
                memberCount:
                activeMembers.length,
                paidCount,
                pendingCount,
                originalInstallments,
                penalty:
                totalPenalty,
                collected,
                pendingAmount,
                oldOverdue:
                calculatedOldOverdue,
            });
        } catch (error) {
            console.error(
                "Load dashboard error:",
                error
            );
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadDashboard();
        }, [])
    );

    const formatCurrency =
        (amount: number) =>
            `₹${amount.toLocaleString(
                "en-IN"
            )}`;

    const monthName =
        new Date(
            currentYear,
            currentMonth - 1,
            1
        ).toLocaleString("en-IN", {
            month: "long",
            year: "numeric",
        });

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={
                styles.content
            }
        >
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>
                        My Mandal
                    </Text>

                    <Text style={styles.month}>
                        {monthName}
                    </Text>
                </View>

                {/* Settings Menu */}
                <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() =>
                        navigation.navigate(
                            "Settings"
                        )
                    }
                    activeOpacity={0.7}
                >
                    <Text
                        style={styles.menuText}
                    >
                        ⋮
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Member Summary */}
            <View style={styles.memberRow}>
                <View style={styles.memberCard}>
                    <Text
                        style={styles.cardLabel}
                    >
                        Members
                    </Text>

                    <Text
                        style={styles.cardValue}
                    >
                        {loading
                            ? "..."
                            : dashboard.memberCount}
                    </Text>
                </View>

                <View style={styles.memberCard}>
                    <Text
                        style={styles.cardLabel}
                    >
                        Paid
                    </Text>

                    <Text
                        style={styles.cardValue}
                    >
                        {loading
                            ? "..."
                            : dashboard.paidCount}
                    </Text>
                </View>

                <View style={styles.memberCard}>
                    <Text
                        style={styles.cardLabel}
                    >
                        Pending
                    </Text>

                    <Text
                        style={styles.cardValue}
                    >
                        {loading
                            ? "..."
                            : dashboard.pendingCount}
                    </Text>
                </View>
            </View>

            {/* Financial Summary */}
            <Text style={styles.sectionTitle}>
                This Month
            </Text>

            <View style={styles.financeCard}>
                <Text
                    style={styles.financeLabel}
                >
                    Original Installments
                </Text>

                <Text
                    style={styles.financeAmount}
                >
                    {loading
                        ? "..."
                        : formatCurrency(
                            dashboard.originalInstallments
                        )}
                </Text>
            </View>

            <View style={styles.financeCard}>
                <Text
                    style={styles.financeLabel}
                >
                    Penalty
                </Text>

                <Text
                    style={styles.financeAmount}
                >
                    {loading
                        ? "..."
                        : formatCurrency(
                            dashboard.penalty
                        )}
                </Text>
            </View>

            <View style={styles.financeCard}>
                <Text
                    style={styles.financeLabel}
                >
                    Collected
                </Text>

                <Text
                    style={styles.financeAmount}
                >
                    {loading
                        ? "..."
                        : formatCurrency(
                            dashboard.collected
                        )}
                </Text>
            </View>

            <View style={styles.financeCard}>
                <Text
                    style={styles.financeLabel}
                >
                    Pending
                </Text>

                <Text
                    style={styles.financeAmount}
                >
                    {loading
                        ? "..."
                        : formatCurrency(
                            dashboard.pendingAmount
                        )}
                </Text>
            </View>

            {/* Old Overdue */}
            <View
                style={styles.overdueSection}
            >
                <Text
                    style={styles.overdueTitle}
                >
                    Old Overdue
                </Text>

                <Text
                    style={styles.overdueAmount}
                >
                    {loading
                        ? "..."
                        : formatCurrency(
                            dashboard.oldOverdue
                        )}
                </Text>

                <Text
                    style={
                        styles.overdueDescription
                    }
                >
                    Outstanding from previous
                    months
                </Text>
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>
                Quick Actions
            </Text>

            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() =>
                        navigation.navigate(
                            "MonthlyPayments"
                        )
                    }
                >
                    <Text
                        style={styles.actionText}
                    >
                        Record Payment
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() =>
                        navigation.navigate(
                            "AddMember"
                        )
                    }
                >
                    <Text
                        style={styles.actionText}
                    >
                        Add Member
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Main Navigation */}
            <Text style={styles.sectionTitle}>
                Manage
            </Text>

            <TouchableOpacity
                style={styles.navigationButton}
                onPress={() =>
                    navigation.navigate(
                        "MonthlyPayments"
                    )
                }
            >
                <Text
                    style={
                        styles.navigationText
                    }
                >
                    Monthly Payments
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.navigationButton}
                onPress={() =>
                    navigation.navigate(
                        "Members"
                    )
                }
            >
                <Text
                    style={
                        styles.navigationText
                    }
                >
                    Members
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.navigationButton}
                onPress={() =>
                    navigation.navigate(
                        "History"
                    )
                }
            >
                <Text
                    style={
                        styles.navigationText
                    }
                >
                    History
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.navigationButton}
                onPress={() =>
                    navigation.navigate(
                        "Reports"
                    )
                }
            >
                <Text
                    style={
                        styles.navigationText
                    }
                >
                    Reports
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.navigationButton}
                onPress={() =>
                    navigation.navigate(
                        "Export"
                    )
                }
            >
                <Text
                    style={
                        styles.navigationText
                    }
                >
                    Export
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F7F8FA",
    },

    content: {
        padding: 20,
        paddingBottom: 40,
    },

    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24,
    },

    title: {
        fontSize: 30,
        fontWeight: "700",
    },

    month: {
        fontSize: 16,
        color: "#666",
        marginTop: 4,
    },

    menuButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#FFFFFF",
        justifyContent: "center",
        alignItems: "center",
    },

    menuText: {
        fontSize: 28,
        lineHeight: 30,
    },

    memberRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 28,
    },

    memberCard: {
        flex: 1,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 14,
    },

    cardLabel: {
        fontSize: 13,
        color: "#666",
        marginBottom: 6,
    },

    cardValue: {
        fontSize: 24,
        fontWeight: "700",
    },

    sectionTitle: {
        fontSize: 20,
        fontWeight: "700",
        marginBottom: 12,
        marginTop: 8,
    },

    financeCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 18,
        marginBottom: 12,
    },

    financeLabel: {
        fontSize: 14,
        color: "#666",
        marginBottom: 6,
    },

    financeAmount: {
        fontSize: 24,
        fontWeight: "700",
    },

    overdueSection: {
        backgroundColor: "#FFF7ED",
        borderRadius: 14,
        padding: 18,
        marginTop: 10,
        marginBottom: 24,
    },

    overdueTitle: {
        fontSize: 18,
        fontWeight: "700",
    },

    overdueAmount: {
        fontSize: 24,
        fontWeight: "700",
        marginTop: 5,
    },

    overdueDescription: {
        fontSize: 14,
        color: "#666",
        marginTop: 4,
    },

    actionRow: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 24,
    },

    actionButton: {
        flex: 1,
        backgroundColor: "#2563EB",
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: "center",
    },

    actionText: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "600",
        textAlign: "center",
    },

    navigationButton: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 18,
        marginBottom: 10,
    },

    navigationText: {
        fontSize: 16,
        fontWeight: "600",
    },
});