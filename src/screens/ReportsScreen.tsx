import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../localization/LanguageContext";

type MonthlyObligation = {
    id: string;
    memberId: string;
    year: number;
    month: number;
    originalInstallment: number;
    currentAmountDue: number;
    penalty: number;
    paidAmount: number;
    remainingAmount: number;
    status:
        | "pending"
        | "partially_paid"
        | "paid"
        | "overdue";
};

type Payment = {
    id: string;
    obligationId: string;
    memberId: string;
    year: number;
    month: number;
    actualCollectedAmount: number;
    paidAt: string;
};

const OBLIGATIONS_KEY =
    "mandal_monthly_obligations";

const PAYMENTS_KEY =
    "mandal_payments";

const monthNames = {
    English: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],
    Gujarati: [
        "જાન્યુઆરી",
        "ફેબ્રુઆરી",
        "માર્ચ",
        "એપ્રિલ",
        "મે",
        "જૂન",
        "જુલાઈ",
        "ઑગસ્ટ",
        "સપ્ટેમ્બર",
        "ઑક્ટોબર",
        "નવેમ્બર",
        "ડિસેમ્બર",
    ],
};

type ReportTotals = {
    originalInstallments: number;
    penalty: number;
    collected: number;
    pending: number;
};

const emptyTotals = (): ReportTotals => ({
    originalInstallments: 0,
    penalty: 0,
    collected: 0,
    pending: 0,
});

const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const getTotalsForObligations = (
    obligations: MonthlyObligation[],
    payments: Payment[]
): ReportTotals => {
    const paidByObligation = new Map<
        string,
        number
    >();

    payments.forEach((payment) => {
        paidByObligation.set(
            payment.obligationId,
            (paidByObligation.get(
                payment.obligationId
            ) ?? 0) +
            Number(
                payment.actualCollectedAmount
            )
        );
    });

    return obligations.reduce(
        (totals, obligation) => {
            const collected =
                paidByObligation.get(
                    obligation.id
                ) ?? 0;

            const pending = Math.max(
                Number(
                    obligation.currentAmountDue
                ) -
                collected,
                0
            );

            totals.originalInstallments +=
                Number(
                    obligation.originalInstallment
                );

            totals.penalty += Number(
                obligation.penalty
            );

            totals.collected += collected;
            totals.pending += pending;

            return totals;
        },
        emptyTotals()
    );
};

export default function ReportsScreen() {
    const navigation = useNavigation();
    const { language } = useLanguage();

    const text =
        language === "Gujarati"
            ? {
                loading: "રિપોર્ટ લોડ થઈ રહ્યો છે...",
                back: "← પાછા",
                reports: "રિપોર્ટ્સ",
                subtitle: "માસિક અને વાર્ષિક નાણાકીય સારાંશ",
                yearlySummary: "વાર્ષિક સારાંશ",
                originalInstallments: "મૂળ હપ્તા",
                penalty: "દંડ",
                collected: "વસૂલ થયેલ",
                pending: "બાકી",
                monthlyBreakdown: "માસિક વિગત",
                twelveMonthOverview: "12 મહિનાનો ઓવરવ્યૂ",
                original: "મૂળ",
            }
            : {
                loading: "Loading reports...",
                back: "← Back",
                reports: "Reports",
                subtitle: "Monthly and yearly financial summary",
                yearlySummary: "Yearly Summary",
                originalInstallments: "Original Installments",
                penalty: "Penalty",
                collected: "Collected",
                pending: "Pending",
                monthlyBreakdown: "Monthly Breakdown",
                twelveMonthOverview: "12-Month Overview",
                original: "Original",
            };

    const [loading, setLoading] =
        useState(true);

    const [year, setYear] = useState(
        new Date().getFullYear()
    );

    const [selectedMonth, setSelectedMonth] =
        useState(
            new Date().getMonth() + 1
        );

    const [yearTotals, setYearTotals] =
        useState<ReportTotals>(
            emptyTotals()
        );

    const [monthlyTotals, setMonthlyTotals] =
        useState<
            Record<number, ReportTotals>
        >({});

    const loadReports = useCallback(
        async () => {
            try {
                setLoading(true);

                const [
                    obligationsJson,
                    paymentsJson,
                ] = await Promise.all([
                    AsyncStorage.getItem(
                        OBLIGATIONS_KEY
                    ),
                    AsyncStorage.getItem(
                        PAYMENTS_KEY
                    ),
                ]);

                const obligations: MonthlyObligation[] =
                    obligationsJson
                        ? JSON.parse(
                            obligationsJson
                        )
                        : [];

                const payments: Payment[] =
                    paymentsJson
                        ? JSON.parse(
                            paymentsJson
                        )
                        : [];

                const yearObligations =
                    obligations.filter(
                        (item) =>
                            item.year === year
                    );

                const yearPayments =
                    payments.filter(
                        (payment) =>
                            payment.year === year
                    );

                setYearTotals(
                    getTotalsForObligations(
                        yearObligations,
                        yearPayments
                    )
                );

                const breakdown: Record<
                    number,
                    ReportTotals
                > = {};

                for (
                    let month = 1;
                    month <= 12;
                    month++
                ) {
                    const monthObligations =
                        yearObligations.filter(
                            (item) =>
                                item.month ===
                                month
                        );

                    const monthPayments =
                        yearPayments.filter(
                            (payment) =>
                                payment.month ===
                                month
                        );

                    breakdown[month] =
                        getTotalsForObligations(
                            monthObligations,
                            monthPayments
                        );
                }

                setMonthlyTotals(
                    breakdown
                );
            } catch (error) {
                console.error(
                    "Load reports error:",
                    error
                );
            } finally {
                setLoading(false);
            }
        },
        [year]
    );

    useFocusEffect(
        useCallback(() => {
            loadReports();
        }, [loadReports])
    );

    const selectedTotals =
        monthlyTotals[selectedMonth] ??
        emptyTotals();

    if (loading) {
        return (
            <View
                style={
                    styles.loadingContainer
                }
            >
                <ActivityIndicator
                    size="large"
                />
                <Text
                    style={
                        styles.loadingText
                    }
                >
                    {text.loading}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={
                    styles.content
                }
            >
                <TouchableOpacity
                    onPress={() =>
                        navigation.goBack()
                    }
                >
                    <Text
                        style={
                            styles.backText
                        }
                    >
                        {text.back}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.title}>
                    {text.reports}
                </Text>

                <Text
                    style={
                        styles.subtitle
                    }
                >
                    {text.subtitle}
                </Text>

                <View
                    style={
                        styles.yearSelector
                    }
                >
                    <TouchableOpacity
                        style={
                            styles.yearButton
                        }
                        onPress={() =>
                            setYear(
                                (current) =>
                                    current - 1
                            )
                        }
                    >
                        <Text
                            style={
                                styles.yearButtonText
                            }
                        >
                            ‹
                        </Text>
                    </TouchableOpacity>

                    <Text
                        style={
                            styles.yearText
                        }
                    >
                        {year}
                    </Text>

                    <TouchableOpacity
                        style={
                            styles.yearButton
                        }
                        onPress={() =>
                            setYear(
                                (current) =>
                                    current + 1
                            )
                        }
                    >
                        <Text
                            style={
                                styles.yearButtonText
                            }
                        >
                            ›
                        </Text>
                    </TouchableOpacity>
                </View>

                <Text
                    style={
                        styles.sectionTitle
                    }
                >
                    {text.yearlySummary}
                </Text>

                <View
                    style={
                        styles.summaryGrid
                    }
                >
                    <SummaryCard
                        label={text.originalInstallments}
                        value={
                            yearTotals.originalInstallments
                        }
                    />
                    <SummaryCard
                        label={text.penalty}
                        value={
                            yearTotals.penalty
                        }
                    />
                    <SummaryCard
                        label={text.collected}
                        value={
                            yearTotals.collected
                        }
                    />
                    <SummaryCard
                        label={text.pending}
                        value={
                            yearTotals.pending
                        }
                    />
                </View>

                <Text
                    style={
                        styles.sectionTitle
                    }
                >
                    {text.monthlyBreakdown}
                </Text>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={
                        false
                    }
                    contentContainerStyle={
                        styles.monthSelector
                    }
                >
                    {monthNames[language].map(
                        (name, index) => {
                            const month =
                                index + 1;

                            return (
                                <TouchableOpacity
                                    key={
                                        month
                                    }
                                    style={[
                                        styles.monthButton,
                                        selectedMonth ===
                                        month
                                            ? styles.monthButtonSelected
                                            : null,
                                    ]}
                                    onPress={() =>
                                        setSelectedMonth(
                                            month
                                        )
                                    }
                                >
                                    <Text
                                        style={[
                                            styles.monthButtonText,
                                            selectedMonth ===
                                            month
                                                ? styles.monthButtonTextSelected
                                                : null,
                                        ]}
                                    >
                                        {name.slice(
                                            0,
                                            3
                                        )}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }
                    )}
                </ScrollView>

                <View
                    style={
                        styles.selectedMonthCard
                    }
                >
                    <Text
                        style={
                            styles.selectedMonthTitle
                        }
                    >
                        {
                            monthNames[language][selectedMonth - 1]
                        }{" "}
                        {year}
                    </Text>

                    <SummaryRow
                        label={text.originalInstallments}
                        value={
                            selectedTotals.originalInstallments
                        }
                    />
                    <SummaryRow
                        label={text.penalty}
                        value={
                            selectedTotals.penalty
                        }
                    />
                    <SummaryRow
                        label={text.collected}
                        value={
                            selectedTotals.collected
                        }
                    />
                    <SummaryRow
                        label={text.pending}
                        value={
                            selectedTotals.pending
                        }
                    />
                </View>

                <Text
                    style={
                        styles.sectionTitle
                    }
                >
                    {text.twelveMonthOverview}
                </Text>

                {monthNames[language].map(
                    (name, index) => {
                        const month =
                            index + 1;

                        const totals =
                            monthlyTotals[
                                month
                                ] ??
                            emptyTotals();

                        return (
                            <TouchableOpacity
                                key={
                                    month
                                }
                                style={
                                    styles.monthRow
                                }
                                onPress={() =>
                                    setSelectedMonth(
                                        month
                                    )
                                }
                            >
                                <View
                                    style={
                                        styles.monthRowHeader
                                    }
                                >
                                    <Text
                                        style={
                                            styles.monthRowTitle
                                        }
                                    >
                                        {name}
                                    </Text>

                                    <Text
                                        style={
                                            styles.monthRowCollected
                                        }
                                    >
                                        {formatCurrency(
                                            totals.collected
                                        )}
                                    </Text>
                                </View>

                                <View
                                    style={
                                        styles.monthRowDetails
                                    }
                                >
                                    <Text
                                        style={
                                            styles.monthRowDetailText
                                        }
                                    >
                                        {text.original}:{" "}
                                        {formatCurrency(
                                            totals.originalInstallments
                                        )}
                                    </Text>

                                    <Text
                                        style={
                                            styles.monthRowDetailText
                                        }
                                    >
                                        {text.penalty}:{" "}
                                        {formatCurrency(
                                            totals.penalty
                                        )}
                                    </Text>

                                    <Text
                                        style={
                                            styles.monthRowDetailText
                                        }
                                    >
                                        {text.pending}:{" "}
                                        {formatCurrency(
                                            totals.pending
                                        )}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }
                )}
            </ScrollView>
        </View>
    );
}

function SummaryCard({
                         label,
                         value,
                     }: {
    label: string;
    value: number;
}) {
    return (
        <View style={styles.summaryCard}>
            <Text
                style={
                    styles.summaryCardLabel
                }
            >
                {label}
            </Text>
            <Text
                style={
                    styles.summaryCardValue
                }
            >
                {formatCurrency(value)}
            </Text>
        </View>
    );
}

function SummaryRow({
                        label,
                        value,
                    }: {
    label: string;
    value: number;
}) {
    return (
        <View
            style={
                styles.summaryRow
            }
        >
            <Text
                style={
                    styles.summaryRowLabel
                }
            >
                {label}
            </Text>
            <Text
                style={
                    styles.summaryRowValue
                }
            >
                {formatCurrency(value)}
            </Text>
        </View>
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
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 10,
        color: "#666",
    },
    backText: {
        fontSize: 16,
        marginBottom: 14,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
    },
    subtitle: {
        marginTop: 5,
        color: "#666",
        fontSize: 14,
        marginBottom: 20,
    },
    yearSelector: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 10,
        marginBottom: 22,
    },
    yearButton: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: "#EEEEEE",
        alignItems: "center",
        justifyContent: "center",
    },
    yearButtonText: {
        fontSize: 30,
    },
    yearText: {
        fontSize: 22,
        fontWeight: "700",
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: "700",
        marginBottom: 12,
        marginTop: 6,
    },
    summaryGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 22,
    },
    summaryCard: {
        width: "48%",
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 15,
    },
    summaryCardLabel: {
        fontSize: 12,
        color: "#666",
    },
    summaryCardValue: {
        marginTop: 5,
        fontSize: 18,
        fontWeight: "700",
    },
    monthSelector: {
        gap: 8,
        paddingBottom: 12,
    },
    monthButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: "#FFFFFF",
    },
    monthButtonSelected: {
        backgroundColor: "#2563EB",
    },
    monthButtonText: {
        fontSize: 13,
        fontWeight: "600",
    },
    monthButtonTextSelected: {
        color: "#FFFFFF",
    },
    selectedMonthCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 16,
        marginBottom: 22,
    },
    selectedMonthTitle: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 10,
    },
    summaryRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: "#EEEEEE",
    },
    summaryRowLabel: {
        fontSize: 14,
        color: "#555",
    },
    summaryRowValue: {
        fontSize: 14,
        fontWeight: "700",
    },
    monthRow: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 15,
        marginBottom: 10,
    },
    monthRowHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    monthRowTitle: {
        fontSize: 16,
        fontWeight: "700",
    },
    monthRowCollected: {
        fontSize: 16,
        fontWeight: "700",
    },
    monthRowDetails: {
        marginTop: 8,
        gap: 3,
    },
    monthRowDetailText: {
        fontSize: 12,
        color: "#666",
    },
});
