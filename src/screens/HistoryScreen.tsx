import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useLanguage } from "../localization/LanguageContext";

type Member = {
    id: string;
    name: string;
    mobile: string;
    monthlyInstallment: number;
    isActive: boolean;
    createdAt: string;
};

type MonthlyObligationStatus =
    | "pending"
    | "partially_paid"
    | "paid"
    | "overdue";

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
    status: MonthlyObligationStatus;
    createdAt: string;
    updatedAt: string;
};

type Payment = {
    id: string;
    obligationId: string;
    memberId: string;
    year: number;
    month: number;
    calculatedAmount: number;
    calculatedPenalty: number;
    actualCollectedAmount: number;
    isManualOverride: boolean;
    overrideReason?: string;
    paidAt: string;
    createdAt: string;
    updatedAt: string;
};

type HistoryMemberRow = {
    member: Member | null;
    obligation: MonthlyObligation;
    payments: Payment[];
};

type HistoryMonth = {
    year: number;
    month: number;
    obligations: MonthlyObligation[];
};

const MEMBERS_KEY = "mandal_members";
const OBLIGATIONS_KEY = "mandal_monthly_obligations";
const PAYMENTS_KEY = "mandal_payments";

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

const readStorage = async <T,>(
    key: string,
    fallback: T
): Promise<T> => {
    try {
        const AsyncStorage =
            require("@react-native-async-storage/async-storage")
                .default;

        const value = await AsyncStorage.getItem(key);

        if (!value) {
            return fallback;
        }

        return JSON.parse(value) as T;
    } catch (error) {
        console.error(`History read error: ${key}`, error);
        return fallback;
    }
};

const formatCurrency = (amount: number) =>
    `₹${amount.toFixed(2)}`;

const formatDateTime = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Invalid date";
    }

    return `${date.toLocaleDateString()} ${date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit",
        }
    )}`;
};

const getStatusLabel = (
    status: MonthlyObligationStatus,
    language: "English" | "Gujarati"
) => {
    if (language === "Gujarati") {
        if (status === "paid") return "ચૂકવેલ";
        if (status === "partially_paid") return "આંશિક ચૂકવેલ";
        if (status === "overdue") return "મુદત વીતી ગયેલ";
        return "બાકી";
    }
    if (status === "paid") return "Paid";
    if (status === "partially_paid") return "Partially Paid";
    if (status === "overdue") return "Overdue";
    return "Pending";
};

export default function HistoryScreen() {
    const navigation = useNavigation();
    const { language } = useLanguage();

    const text = language === "Gujarati"
        ? {
            loading: "ઇતિહાસ લોડ થઈ રહ્યો છે...",
            back: "← પાછા",
            history: "ઇતિહાસ",
            monthlyRecords: "માસિક ચુકવણી રેકોર્ડ",
            noHistory: (y: number) => `${y} માટે કોઈ ઇતિહાસ નથી`,
            recordsAppear: "Obligations બનાવ્યા પછી માસિક રેકોર્ડ અહીં દેખાશે.",
            member: "સભ્ય",
            members: "સભ્યો",
            original: "મૂળ",
            penalty: "દંડ",
            collected: "વસૂલ થયેલ",
            pending: "બાકી",
            installment: "હપ્તો",
            totalDue: "કુલ ચૂકવવાનું",
            paid: "ચૂકવેલ",
            paymentHistory: "ચુકવણી ઇતિહાસ",
            noPayments: "આ મહિના માટે કોઈ ચુકવણી નોંધાયેલ નથી.",
            payment: "ચુકવણી",
            manualOverride: "મેન્યુઅલ ઓવરરાઇડ",
            reason: "કારણ",
            noReason: "કોઈ કારણ નોંધાયેલ નથી",
            calculated: "ગણતરી કરેલ",
            unavailable: "સભ્યનો રેકોર્ડ ઉપલબ્ધ નથી",
            error: "ભૂલ",
            unableLoad: "ચુકવણી ઇતિહાસ લોડ કરી શકાયો નથી.",
            unableMonth: "આ મહિનાનો ઇતિહાસ લોડ કરી શકાયો નથી.",
        }
        : {
            loading: "Loading history...",
            back: "← Back",
            history: "History",
            monthlyRecords: "Monthly payment records",
            noHistory: (y: number) => `No history for ${y}`,
            recordsAppear: "Monthly records will appear here after obligations are created.",
            member: "member",
            members: "members",
            original: "Original",
            penalty: "Penalty",
            collected: "Collected",
            pending: "Pending",
            installment: "Installment",
            totalDue: "Total Due",
            paid: "Paid",
            paymentHistory: "Payment History",
            noPayments: "No payments recorded for this month.",
            payment: "Payment",
            manualOverride: "Manual Override",
            reason: "Reason",
            noReason: "No reason recorded",
            calculated: "Calculated",
            unavailable: "Member record unavailable",
            error: "Error",
            unableLoad: "Unable to load payment history.",
            unableMonth: "Unable to load this month history.",
        };

    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(
        new Date().getFullYear()
    );
    const [months, setMonths] = useState<HistoryMonth[]>(
        []
    );
    const [expandedMonth, setExpandedMonth] = useState<
        string | null
    >(null);
    const [expandedMember, setExpandedMember] = useState<
        string | null
    >(null);

    const loadHistory = useCallback(async () => {
        try {
            setLoading(true);

            const members = await readStorage<Member[]>(
                MEMBERS_KEY,
                []
            );

            const obligations =
                await readStorage<MonthlyObligation[]>(
                    OBLIGATIONS_KEY,
                    []
                );

            const yearObligations = obligations
                .filter((item) => item.year === year)
                .sort(
                    (a, b) =>
                        b.month - a.month
                );

            const grouped = new Map<
                number,
                MonthlyObligation[]
            >();

            yearObligations.forEach((obligation) => {
                const existing =
                    grouped.get(obligation.month) ?? [];

                existing.push(obligation);
                grouped.set(
                    obligation.month,
                    existing
                );
            });

            setMonths(
                Array.from(grouped.entries()).map(
                    ([month, monthObligations]) => ({
                        year,
                        month,
                        obligations: monthObligations,
                    })
                )
            );
        } catch (error) {
            console.error(
                "Load history error:",
                error
            );

            Alert.alert(
                "Error",
                text.unableLoad
            );
        } finally {
            setLoading(false);
        }
    }, [year]);

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [loadHistory])
    );

    const getMonthRows = async (
        month: HistoryMonth
    ): Promise<HistoryMemberRow[]> => {
        const [members, payments] = await Promise.all([
            readStorage<Member[]>(
                MEMBERS_KEY,
                []
            ),
            readStorage<Payment[]>(
                PAYMENTS_KEY,
                []
            ),
        ]);

        return month.obligations.map((obligation) => ({
            member:
                members.find(
                    (member) =>
                        member.id ===
                        obligation.memberId
                ) ?? null,
            obligation,
            payments: payments
                .filter(
                    (payment) =>
                        payment.obligationId ===
                        obligation.id
                )
                .sort(
                    (a, b) =>
                        new Date(a.paidAt).getTime() -
                        new Date(b.paidAt).getTime()
                ),
        }));
    };

    const [monthRows, setMonthRows] = useState<
        Record<string, HistoryMemberRow[]>
    >({});

    const toggleMonth = async (
        month: HistoryMonth
    ) => {
        const key = `${month.year}-${month.month}`;

        if (expandedMonth === key) {
            setExpandedMonth(null);
            setExpandedMember(null);
            return;
        }

        try {
            const rows = await getMonthRows(month);

            setMonthRows((current) => ({
                ...current,
                [key]: rows,
            }));

            setExpandedMonth(key);
            setExpandedMember(null);
        } catch (error) {
            console.error(
                "Load history month error:",
                error
            );

            Alert.alert(
                "Error",
                text.unableMonth
            );
        }
    };

    const getMonthSummary = (
        obligations: MonthlyObligation[]
    ) => {
        const originalInstallments =
            obligations.reduce(
                (sum, item) =>
                    sum + item.originalInstallment,
                0
            );

        const penalties = obligations.reduce(
            (sum, item) => sum + item.penalty,
            0
        );

        const collected = obligations.reduce(
            (sum, item) =>
                sum + item.paidAmount,
            0
        );

        const pending = obligations.reduce(
            (sum, item) =>
                sum + item.remainingAmount,
            0
        );

        return {
            originalInstallments,
            penalties,
            collected,
            pending,
        };
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>
                    {text.loading}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={
                    styles.scrollContent
                }
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() =>
                            navigation.goBack()
                        }
                    >
                        <Text style={styles.backText}>
                            {text.back}
                        </Text>
                    </TouchableOpacity>

                    <Text style={styles.title}>
                        {text.history}
                    </Text>

                    <Text style={styles.subtitle}>
                        {text.monthlyRecords}
                    </Text>
                </View>

                <View style={styles.yearSelector}>
                    <TouchableOpacity
                        style={styles.yearButton}
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

                    <Text style={styles.yearText}>
                        {year}
                    </Text>

                    <TouchableOpacity
                        style={styles.yearButton}
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

                {months.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text
                            style={styles.emptyTitle}
                        >
                            {text.noHistory(year)}
                        </Text>

                        <Text
                            style={styles.emptyText}
                        >
                            {text.recordsAppear}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.monthList}>
                        {months.map((month) => {
                            const key = `${month.year}-${month.month}`;
                            const summary =
                                getMonthSummary(
                                    month.obligations
                                );

                            const isExpanded =
                                expandedMonth === key;

                            const rows =
                                monthRows[key] ?? [];

                            return (
                                <View
                                    key={key}
                                    style={
                                        styles.monthCard
                                    }
                                >
                                    <TouchableOpacity
                                        onPress={() =>
                                            toggleMonth(
                                                month
                                            )
                                        }
                                        activeOpacity={
                                            0.8
                                        }
                                    >
                                        <View
                                            style={
                                                styles.monthHeader
                                            }
                                        >
                                            <View
                                                style={
                                                    styles.monthHeaderText
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.monthTitle
                                                    }
                                                >
                                                    {monthNames[language][month.month - 1]}
                                                </Text>

                                                <Text
                                                    style={
                                                        styles.memberCount
                                                    }
                                                >
                                                    {month.obligations.length === 1
                                                        ? text.member
                                                        : text.members}
                                                </Text>
                                            </View>

                                            <Text
                                                style={
                                                    styles.expandIcon
                                                }
                                            >
                                                {isExpanded
                                                    ? "−"
                                                    : "+"}
                                            </Text>
                                        </View>

                                        <View
                                            style={
                                                styles.summaryGrid
                                            }
                                        >
                                            <View
                                                style={
                                                    styles.summaryItem
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.summaryLabel
                                                    }
                                                >
                                                    {text.original}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.summaryValue
                                                    }
                                                >
                                                    {formatCurrency(
                                                        summary.originalInstallments
                                                    )}
                                                </Text>
                                            </View>

                                            <View
                                                style={
                                                    styles.summaryItem
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.summaryLabel
                                                    }
                                                >
                                                    {text.penalty}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.summaryValue
                                                    }
                                                >
                                                    {formatCurrency(
                                                        summary.penalties
                                                    )}
                                                </Text>
                                            </View>

                                            <View
                                                style={
                                                    styles.summaryItem
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.summaryLabel
                                                    }
                                                >
                                                    {text.collected}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.summaryValue
                                                    }
                                                >
                                                    {formatCurrency(
                                                        summary.collected
                                                    )}
                                                </Text>
                                            </View>

                                            <View
                                                style={
                                                    styles.summaryItem
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.summaryLabel
                                                    }
                                                >
                                                    {text.pending}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.summaryValue
                                                    }
                                                >
                                                    {formatCurrency(
                                                        summary.pending
                                                    )}
                                                </Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>

                                    {isExpanded && (
                                        <View
                                            style={
                                                styles.memberList
                                            }
                                        >
                                            {rows.map(
                                                (
                                                    row
                                                ) => {
                                                    const memberKey =
                                                        `${key}-${row.obligation.memberId}`;

                                                    const isMemberExpanded =
                                                        expandedMember ===
                                                        memberKey;

                                                    return (
                                                        <View
                                                            key={
                                                                row
                                                                    .obligation
                                                                    .id
                                                            }
                                                            style={
                                                                styles.memberCard
                                                            }
                                                        >
                                                            <TouchableOpacity
                                                                onPress={() =>
                                                                    setExpandedMember(
                                                                        isMemberExpanded
                                                                            ? null
                                                                            : memberKey
                                                                    )
                                                                }
                                                                activeOpacity={
                                                                    0.8
                                                                }
                                                            >
                                                                <View
                                                                    style={
                                                                        styles.memberHeader
                                                                    }
                                                                >
                                                                    <View
                                                                        style={
                                                                            styles.memberHeaderText
                                                                        }
                                                                    >
                                                                        <Text
                                                                            style={
                                                                                styles.memberName
                                                                            }
                                                                        >
                                                                            {row.member?.name ??
                                                                                text.unavailable}
                                                                        </Text>

                                                                        {row.member && (
                                                                            <Text
                                                                                style={
                                                                                    styles.memberMobile
                                                                                }
                                                                            >
                                                                                {
                                                                                    row
                                                                                        .member
                                                                                        .mobile
                                                                                }
                                                                            </Text>
                                                                        )}
                                                                    </View>

                                                                    <Text
                                                                        style={
                                                                            styles.statusBadge
                                                                        }
                                                                    >
                                                                        {getStatusLabel(
                                                                            row.obligation.status,
                                                                            language
                                                                        )}
                                                                    </Text>
                                                                </View>

                                                                <View
                                                                    style={
                                                                        styles.memberSummary
                                                                    }
                                                                >
                                                                    <Text
                                                                        style={
                                                                            styles.memberSummaryText
                                                                        }
                                                                    >
                                                                        {text.installment}:{" "}
                                                                        {formatCurrency(
                                                                            row
                                                                                .obligation
                                                                                .originalInstallment
                                                                        )}
                                                                    </Text>

                                                                    <Text
                                                                        style={
                                                                            styles.memberSummaryText
                                                                        }
                                                                    >
                                                                        {text.penalty}:{" "}
                                                                        {formatCurrency(
                                                                            row
                                                                                .obligation
                                                                                .penalty
                                                                        )}
                                                                    </Text>

                                                                    <Text
                                                                        style={
                                                                            styles.memberSummaryText
                                                                        }
                                                                    >
                                                                        {text.totalDue}:{" "}
                                                                        {formatCurrency(
                                                                            row
                                                                                .obligation
                                                                                .currentAmountDue
                                                                        )}
                                                                    </Text>

                                                                    <Text
                                                                        style={
                                                                            styles.memberSummaryText
                                                                        }
                                                                    >
                                                                        {text.paid}:{" "}
                                                                        {formatCurrency(
                                                                            row
                                                                                .obligation
                                                                                .paidAmount
                                                                        )}
                                                                    </Text>

                                                                    <Text
                                                                        style={
                                                                            styles.memberSummaryText
                                                                        }
                                                                    >
                                                                        {text.pending}:{" "}
                                                                        {formatCurrency(
                                                                            row
                                                                                .obligation
                                                                                .remainingAmount
                                                                        )}
                                                                    </Text>
                                                                </View>
                                                            </TouchableOpacity>

                                                            {isMemberExpanded && (
                                                                <View
                                                                    style={
                                                                        styles.paymentHistory
                                                                    }
                                                                >
                                                                    <Text
                                                                        style={
                                                                            styles.paymentHistoryTitle
                                                                        }
                                                                    >
                                                                        {text.paymentHistory}
                                                                    </Text>

                                                                    {row
                                                                        .payments
                                                                        .length ===
                                                                    0 ? (
                                                                        <Text
                                                                            style={
                                                                                styles.noPayments
                                                                            }
                                                                        >
                                                                            {text.noPayments}
                                                                        </Text>
                                                                    ) : (
                                                                        row.payments.map(
                                                                            (
                                                                                payment,
                                                                                index
                                                                            ) => (
                                                                                <View
                                                                                    key={
                                                                                        payment.id
                                                                                    }
                                                                                    style={
                                                                                        styles.paymentRow
                                                                                    }
                                                                                >
                                                                                    <View
                                                                                        style={
                                                                                            styles.paymentRowMain
                                                                                        }
                                                                                    >
                                                                                        <Text
                                                                                            style={
                                                                                                styles.paymentNumber
                                                                                            }
                                                                                        >
                                                                                            {text.payment}{" "}
                                                                                            {index +
                                                                                                1}
                                                                                        </Text>

                                                                                        <Text
                                                                                            style={
                                                                                                styles.paymentDate
                                                                                            }
                                                                                        >
                                                                                            {formatDateTime(
                                                                                                payment.paidAt
                                                                                            )}
                                                                                        </Text>
                                                                                    </View>

                                                                                    <Text
                                                                                        style={
                                                                                            styles.paymentAmount
                                                                                        }
                                                                                    >
                                                                                        {formatCurrency(
                                                                                            payment.actualCollectedAmount
                                                                                        )}
                                                                                    </Text>

                                                                                    {payment.isManualOverride && (
                                                                                        <View
                                                                                            style={
                                                                                                styles.overrideInfo
                                                                                            }
                                                                                        >
                                                                                            <Text
                                                                                                style={
                                                                                                    styles.overrideLabel
                                                                                                }
                                                                                            >
                                                                                                {text.manualOverride}
                                                                                            </Text>

                                                                                            <Text
                                                                                                style={
                                                                                                    styles.overrideReason
                                                                                                }
                                                                                            >
                                                                                                {text.reason}:{" "}
                                                                                                {payment.overrideReason ??
                                                                                                    text.noReason}
                                                                                            </Text>

                                                                                            <Text
                                                                                                style={
                                                                                                    styles.overrideCalculated
                                                                                                }
                                                                                            >
                                                                                                {text.calculated}:{" "}
                                                                                                {formatCurrency(
                                                                                                    payment.calculatedAmount
                                                                                                )}
                                                                                            </Text>
                                                                                        </View>
                                                                                    )}
                                                                                </View>
                                                                            )
                                                                        )
                                                                    )}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                }
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F7F8FA",
    },
    scrollContent: {
        padding: 16,
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
    header: {
        marginBottom: 18,
    },
    backText: {
        fontSize: 16,
        marginBottom: 10,
    },
    title: {
        fontSize: 26,
        fontWeight: "700",
    },
    subtitle: {
        marginTop: 4,
        fontSize: 15,
        color: "#666",
    },
    yearSelector: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 10,
        marginBottom: 16,
    },
    yearButton: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: "#EEEEEE",
        justifyContent: "center",
        alignItems: "center",
    },
    yearButtonText: {
        fontSize: 30,
        lineHeight: 34,
    },
    yearText: {
        fontSize: 22,
        fontWeight: "700",
    },
    monthList: {
        gap: 12,
    },
    monthCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        overflow: "hidden",
    },
    monthHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
    },
    monthHeaderText: {
        flex: 1,
    },
    monthTitle: {
        fontSize: 19,
        fontWeight: "700",
    },
    memberCount: {
        marginTop: 3,
        fontSize: 13,
        color: "#666",
    },
    expandIcon: {
        fontSize: 28,
        fontWeight: "400",
    },
    summaryGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: 12,
        paddingBottom: 14,
        gap: 8,
    },
    summaryItem: {
        width: "48%",
        backgroundColor: "#F5F5F5",
        borderRadius: 9,
        padding: 10,
    },
    summaryLabel: {
        fontSize: 12,
        color: "#666",
    },
    summaryValue: {
        marginTop: 3,
        fontSize: 15,
        fontWeight: "700",
    },
    memberList: {
        borderTopWidth: 1,
        borderTopColor: "#EEEEEE",
        padding: 10,
        gap: 8,
    },
    memberCard: {
        backgroundColor: "#F8F8F8",
        borderRadius: 10,
        overflow: "hidden",
    },
    memberHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: 12,
    },
    memberHeaderText: {
        flex: 1,
        paddingRight: 8,
    },
    memberName: {
        fontSize: 16,
        fontWeight: "700",
    },
    memberMobile: {
        marginTop: 3,
        fontSize: 13,
        color: "#666",
    },
    statusBadge: {
        fontSize: 12,
        fontWeight: "700",
        color: "#555",
    },
    memberSummary: {
        paddingHorizontal: 12,
        paddingBottom: 12,
        gap: 3,
    },
    memberSummaryText: {
        fontSize: 13,
        color: "#444",
    },
    paymentHistory: {
        borderTopWidth: 1,
        borderTopColor: "#E5E5E5",
        padding: 12,
    },
    paymentHistoryTitle: {
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 8,
    },
    paymentRow: {
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    paymentRowMain: {
        flex: 1,
    },
    paymentNumber: {
        fontSize: 13,
        fontWeight: "700",
    },
    paymentDate: {
        marginTop: 3,
        fontSize: 12,
        color: "#666",
    },
    paymentAmount: {
        marginTop: 7,
        fontSize: 16,
        fontWeight: "700",
    },
    overrideInfo: {
        marginTop: 8,
        padding: 8,
        borderRadius: 7,
        backgroundColor: "#FFF7E6",
    },
    overrideLabel: {
        fontSize: 12,
        fontWeight: "700",
    },
    overrideReason: {
        marginTop: 3,
        fontSize: 12,
    },
    overrideCalculated: {
        marginTop: 3,
        fontSize: 12,
        color: "#666",
    },
    emptyCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 24,
        alignItems: "center",
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: "700",
    },
    emptyText: {
        marginTop: 8,
        textAlign: "center",
        color: "#666",
        lineHeight: 20,
    },
    noPayments: {
        color: "#666",
        fontSize: 13,
    },
});