import React, {
    useCallback,
    useState,
} from "react";

import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import {
    useFocusEffect,
    useNavigation,
    useRoute,
} from "@react-navigation/native";

import {
    NativeStackNavigationProp,
    NativeStackScreenProps,
} from "@react-navigation/native-stack";

import {
    getPaymentsForObligation,
    Payment,
    updatePayment,
} from "../database/paymentStorage";

import {
    getMonthlyObligation,
    updateMonthlyObligation,
} from "../database/monthlyObligationStorage";

import {
    calculatePaymentAmount,
} from "../utils/paymentCalculator";

import { useLanguage } from "../localization/LanguageContext";

type RootStackParamList = {
    Home: undefined;
    Members: undefined;
    AddMember: undefined;
    EditMember: {
        memberId: string;
    };
    MonthlyPayments: undefined;
    PaymentDetails: {
        obligationId: string;
        memberName: string;
        originalInstallment: number;
    };
};

type PaymentDetailsRoute =
    NativeStackScreenProps<
        RootStackParamList,
        "PaymentDetails"
    >;

type NavigationProp =
    NativeStackNavigationProp<
        RootStackParamList,
        "PaymentDetails"
    >;

export default function PaymentDetailsScreen() {
    const { language } = useLanguage();

    const text = language === "Gujarati" ? {
        error: "ભૂલ", unableLoad: "ચુકવણી રેકોર્ડ લોડ કરી શકાયા નથી.", invalidDate: "અમાન્ય તારીખ",
        invalidDateMessage: "કૃપા કરીને માન્ય તારીખ અને સમય દાખલ કરો.\\n\\nતારીખ: DD/MM/YYYY\\nસમય: HH:MM",
        confirmDateChange: "તારીખ બદલવાની પુષ્ટિ કરો", member: "સભ્ય", oldDateTime: "જૂની તારીખ/સમય:",
        newDateTime: "નવી તારીખ/સમય:", originalInstallment: "મૂળ હપ્તો", newPenalty: "નવી પેનલ્ટી",
        newTotalDue: "નવી કુલ બાકી રકમ", totalCollected: "કુલ વસૂલાત", remaining: "બાકી", newStatus: "નવી સ્થિતિ",
        paid: "ચૂકવેલ", partiallyPaid: "આંશિક ચૂકવેલ", pending: "બાકી", cancel: "રદ કરો", confirm: "પુષ્ટિ કરો",
        paymentUpdated: "ચુકવણી અપડેટ થઈ", paymentUpdatedMessage: "ચુકવણીની તારીખ/સમય સફળતાપૂર્વક અપડેટ થયો.",
        unableUpdate: "ચુકવણીની તારીખ અપડેટ કરી શકાયી નથી.", ok: "બરાબર", loading: "ચુકવણીઓ લોડ થઈ રહી છે...",
        back: "← પાછા", paymentDetails: "ચુકવણી વિગતો", installment: "હપ્તો", noPayments: "કોઈ ચુકવણી નોંધાઈ નથી.",
        payment: "ચુકવણી", collected: "વસૂલ કરેલ", date: "તારીખ", time: "સમય", calculatedAmount: "ગણતરી કરેલ રકમ",
        calculatedPenalty: "ગણતરી કરેલ પેનલ્ટી", manualOverride: "મેન્યુઅલ ફેરફાર", editDate: "તારીખ અને સમય સંપાદિત કરો", save: "સાચવો"
    } : {
        error: "Error", unableLoad: "Unable to load payment records.", invalidDate: "Invalid Date",
        invalidDateMessage: "Please enter a valid date and time.\\n\\nDate: DD/MM/YYYY\\nTime: HH:MM",
        confirmDateChange: "Confirm Date Change", member: "Member", oldDateTime: "Old date/time:",
        newDateTime: "New date/time:", originalInstallment: "Original installment", newPenalty: "New penalty",
        newTotalDue: "New total due", totalCollected: "Total collected", remaining: "Remaining", newStatus: "New status",
        paid: "Paid", partiallyPaid: "Partially Paid", pending: "Pending", cancel: "Cancel", confirm: "Confirm",
        paymentUpdated: "Payment Updated", paymentUpdatedMessage: "Payment date/time updated successfully.",
        unableUpdate: "Unable to update the payment date.", ok: "OK", loading: "Loading payments...", back: "← Back",
        paymentDetails: "Payment Details", installment: "Installment", noPayments: "No payments recorded.",
        payment: "Payment", collected: "Collected", date: "Date", time: "Time", calculatedAmount: "Calculated amount",
        calculatedPenalty: "Calculated penalty", manualOverride: "Manual override", editDate: "Edit Date & Time", save: "Save"
    };

    const navigation =
        useNavigation<NavigationProp>();

    const route =
        useRoute<PaymentDetailsRoute["route"]>();

    const {
        obligationId,
        memberName,
        originalInstallment,
    } = route.params;

    const [payments, setPayments] =
        useState<Payment[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [editingPaymentId, setEditingPaymentId] =
        useState<string | null>(null);

    const [editDate, setEditDate] =
        useState("");

    const [editTime, setEditTime] =
        useState("");

    const loadPayments =
        useCallback(async () => {
            try {
                setLoading(true);

                const data =
                    await getPaymentsForObligation(
                        obligationId
                    );

                setPayments(data);
            } catch (error) {
                console.error(
                    "Load payments error:",
                    error
                );

                Alert.alert(
                    text.error,
                    text.unableLoad
                );
            } finally {
                setLoading(false);
            }
        }, [obligationId]);

    useFocusEffect(
        useCallback(() => {
            loadPayments();
        }, [loadPayments])
    );

    const startEditing = (
        payment: Payment
    ) => {
        const date =
            new Date(payment.paidAt);

        const day = String(
            date.getDate()
        ).padStart(2, "0");

        const month = String(
            date.getMonth() + 1
        ).padStart(2, "0");

        const year =
            date.getFullYear();

        const hours = String(
            date.getHours()
        ).padStart(2, "0");

        const minutes = String(
            date.getMinutes()
        ).padStart(2, "0");

        setEditDate(
            `${day}/${month}/${year}`
        );

        setEditTime(
            `${hours}:${minutes}`
        );

        setEditingPaymentId(
            payment.id
        );
    };

    const cancelEditing = () => {
        setEditingPaymentId(null);
        setEditDate("");
        setEditTime("");
    };

    const parseDateTime = (): Date | null => {
        const dateParts =
            editDate.trim().split("/");

        const timeParts =
            editTime.trim().split(":");

        if (
            dateParts.length !== 3 ||
            timeParts.length !== 2
        ) {
            return null;
        }

        const day =
            Number(dateParts[0]);

        const month =
            Number(dateParts[1]);

        const year =
            Number(dateParts[2]);

        const hours =
            Number(timeParts[0]);

        const minutes =
            Number(timeParts[1]);

        if (
            !Number.isInteger(day) ||
            !Number.isInteger(month) ||
            !Number.isInteger(year) ||
            !Number.isInteger(hours) ||
            !Number.isInteger(minutes)
        ) {
            return null;
        }

        if (
            year < 2000 ||
            year > 2100 ||
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31 ||
            hours < 0 ||
            hours > 23 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        const date =
            new Date(
                year,
                month - 1,
                day,
                hours,
                minutes,
                0,
                0
            );

        // Prevent JavaScript from accepting invalid dates
        // such as 31/02/2026.
        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day ||
            date.getHours() !== hours ||
            date.getMinutes() !== minutes
        ) {
            return null;
        }

        return date;
    };

    /*
     * Recalculate the whole monthly obligation from the actual payment
     * records. We do not trust an old/stale calculatedAmount because
     * the record may have originally been entered using today's date.
     *
     * The latest actual payment date is the month's penalty reference.
     * The penalty is calculated once on the full original installment.
     */
    const recalculateObligation = async (
        updatedPayments: Payment[]
    ) => {
        if (updatedPayments.length === 0) {
            return;
        }

        const firstPayment =
            updatedPayments[0];

        const obligation =
            await getMonthlyObligation(
                obligationId,
                firstPayment.year,
                firstPayment.month
            );

        if (!obligation) {
            return;
        }

        /*
         * The monthly obligation has ONE total due.
         *
         * Penalty is calculated on the FULL original
         * installment, not separately for each payment.
         *
         * The latest actual payment date determines
         * the current applicable penalty for the month.
         */
        const sortedPayments =
            [...updatedPayments].sort(
                (a, b) =>
                    new Date(b.paidAt).getTime() -
                    new Date(a.paidAt).getTime()
            );

        const latestPayment =
            sortedPayments[0];

        /*
         * IMPORTANT:
         * Recalculate from the actual payment date.
         * Do not use the old stored calculatedAmount,
         * because the payment date may have been edited.
         */
        const latestCalculation =
            calculatePaymentAmount(
                obligation.originalInstallment,
                new Date(latestPayment.paidAt)
            );

        const totalDue =
            latestCalculation.totalDue;

        const penalty =
            latestCalculation.penalty;

        /*
         * Actual money collected must NEVER be changed
         * just because the payment date changed.
         */
        const totalPaid =
            updatedPayments.reduce(
                (total, payment) =>
                    total +
                    payment.actualCollectedAmount,
                0
            );

        const remainingAmount =
            Math.max(
                totalDue - totalPaid,
                0
            );

        const status =
            remainingAmount === 0
                ? "paid"
                : totalPaid > 0
                    ? "partially_paid"
                    : "pending";

        /*
         * Rebuild the complete monthly obligation
         * from ALL payment records.
         */
        await updateMonthlyObligation(
            obligation.id,
            {
                currentAmountDue:
                totalDue,

                penalty:
                penalty,

                paidAmount:
                totalPaid,

                remainingAmount:
                remainingAmount,

                status:
                status,
            }
        );
    };

    const saveEditedDate = async (
        payment: Payment
    ) => {
        const newDate =
            parseDateTime();

        if (!newDate) {
            Alert.alert(
                text.invalidDate,
                text.invalidDateMessage
            );

            return;
        }

        /*
         * The obligation month NEVER changes.
         * Only the actual payment date/time changes.
         */
        const calculation =
            calculatePaymentAmount(
                originalInstallment,
                newDate
            );

        /*
         * Get all existing payments first so we can
         * show the correct result before confirmation.
         */
        const existingPayments =
            await getPaymentsForObligation(
                obligationId
            );

        /*
         * Simulate this payment's new date without
         * changing the stored payment yet.
         */
        const simulatedPayments =
            existingPayments.map(
                (existingPayment) =>
                    existingPayment.id === payment.id
                        ? {
                            ...existingPayment,
                            paidAt:
                                newDate.toISOString(),
                            calculatedAmount:
                            calculation.totalDue,
                            calculatedPenalty:
                            calculation.penalty,
                        }
                        : existingPayment
            );

        /*
         * The latest payment date determines the
         * month's applicable penalty.
         */
        const sortedSimulatedPayments =
            [...simulatedPayments].sort(
                (a, b) =>
                    new Date(b.paidAt).getTime() -
                    new Date(a.paidAt).getTime()
            );

        const latestPayment =
            sortedSimulatedPayments[0];

        const newMonthlyCalculation =
            calculatePaymentAmount(
                originalInstallment,
                new Date(latestPayment.paidAt)
            );

        /*
         * IMPORTANT:
         * Actual collected amounts are historical money.
         * Never automatically change them because the
         * payment date was edited.
         */
        const totalPaid =
            simulatedPayments.reduce(
                (total, item) =>
                    total +
                    item.actualCollectedAmount,
                0
            );

        const totalDue =
            newMonthlyCalculation.totalDue;

        const penalty =
            newMonthlyCalculation.penalty;

        const remainingAmount =
            Math.max(
                totalDue - totalPaid,
                0
            );

        const newStatus =
            remainingAmount === 0
                ? "paid"
                : totalPaid > 0
                    ? "partially_paid"
                    : "pending";

        const oldDate =
            new Date(payment.paidAt);

        const oldDateText =
            `${String(oldDate.getDate()).padStart(2, "0")}/` +
            `${String(oldDate.getMonth() + 1).padStart(2, "0")}/` +
            `${oldDate.getFullYear()} ` +
            `${String(oldDate.getHours()).padStart(2, "0")}:` +
            `${String(oldDate.getMinutes()).padStart(2, "0")}`;

        const newDateText =
            `${String(newDate.getDate()).padStart(2, "0")}/` +
            `${String(newDate.getMonth() + 1).padStart(2, "0")}/` +
            `${newDate.getFullYear()} ` +
            `${String(newDate.getHours()).padStart(2, "0")}:` +
            `${String(newDate.getMinutes()).padStart(2, "0")}`;

        Alert.alert(
            text.confirmDateChange,

            `${text.member}: ${memberName}\n\n` +

            `${text.oldDateTime}\n${oldDateText}\n\n` +

            `${text.newDateTime}\n${newDateText}\n\n` +

            `${text.originalInstallment}: ₹${originalInstallment.toFixed(2)}\n` +

            `${text.newPenalty}: ₹${penalty.toFixed(2)}\n` +

            `${text.newTotalDue}: ₹${totalDue.toFixed(2)}\n` +

            `${text.totalCollected}: ₹${totalPaid.toFixed(2)}\n` +

            `${text.remaining}: ₹${remainingAmount.toFixed(2)}\n\n` +

            `${text.newStatus}: ${
                newStatus === "paid"
                    ? "Paid"
                    : newStatus === "partially_paid"
                        ? "Partially Paid"
                        : "Pending"
            }`,

            [
                {
                    text: text.cancel,
                    style: "cancel",
                },
                {
                    text: text.confirm,

                    onPress: async () => {
                        try {
                            /*
                             * Update ONLY the selected payment.
                             *
                             * Actual collected amount stays exactly
                             * as it was.
                             *
                             * {text.manualOverride} also stays preserved.
                             */
                            await updatePayment(
                                payment.id,
                                {
                                    paidAt:
                                        newDate.toISOString(),

                                    calculatedAmount:
                                    calculation.totalDue,

                                    calculatedPenalty:
                                    calculation.penalty,
                                }
                            );

                            /*
                             * Reload ALL payments after the update.
                             */
                            const refreshedPayments =
                                await getPaymentsForObligation(
                                    obligationId
                                );

                            /*
                             * Update the screen.
                             */
                            setPayments(
                                refreshedPayments
                            );

                            /*
                             * Completely rebuild this month's
                             * obligation from ALL payments.
                             */
                            await recalculateObligation(
                                refreshedPayments
                            );

                            cancelEditing();

                            Alert.alert(
                                text.paymentUpdated,

                                `${text.paymentUpdatedMessage}\n\n` +

                                `Total due: ₹${totalDue.toFixed(2)}\n` +

                                `${text.totalCollected}: ₹${totalPaid.toFixed(2)}\n` +

                                `${text.remaining}: ₹${remainingAmount.toFixed(2)}\n\n` +

                                `${text.newStatus}: ${
                                    newStatus === "paid"
                                        ? "Paid"
                                        : newStatus === "partially_paid"
                                            ? "Partially Paid"
                                            : "Pending"
                                }`,

                                [
                                    {
                                        text: text.ok,
                                        onPress:
                                        loadPayments,
                                    },
                                ]
                            );
                        } catch (error) {
                            console.error(
                                "Update payment date error:",
                                error
                            );

                            Alert.alert(
                                "Error",
                                text.unableUpdate
                            );
                        }
                    },
                },
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <Text>
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
                    <Text style={styles.back}>
                        {text.back}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.title}>
                    {text.paymentDetails}
                </Text>

                <Text
                    style={styles.memberName}
                >
                    {memberName}
                </Text>

                <Text
                    style={styles.subtitle}
                >
                    {text.installment}: ₹
                    {originalInstallment.toFixed(
                        2
                    )}
                </Text>

                {payments.length === 0 ? (
                    <View
                        style={
                            styles.emptyContainer
                        }
                    >
                        <Text>
                            {text.noPayments}
                        </Text>
                    </View>
                ) : (
                    payments.map(
                        (
                            payment,
                            index
                        ) => {
                            const paidDate =
                                new Date(
                                    payment.paidAt
                                );

                            const isEditing =
                                editingPaymentId ===
                                payment.id;

                            return (
                                <View
                                    key={
                                        payment.id
                                    }
                                    style={
                                        styles.paymentCard
                                    }
                                >
                                    <Text
                                        style={
                                            styles.paymentNumber
                                        }
                                    >
                                        {text.payment} #
                                        {index + 1}
                                    </Text>

                                    <Text
                                        style={
                                            styles.amount
                                        }
                                    >
                                        {text.collected}: ₹
                                        {payment.actualCollectedAmount.toFixed(
                                            2
                                        )}
                                    </Text>

                                    <Text
                                        style={
                                            styles.info
                                        }
                                    >
                                        Date:{" "}
                                        {paidDate.toLocaleDateString()}
                                    </Text>

                                    <Text
                                        style={
                                            styles.info
                                        }
                                    >
                                        Time:{" "}
                                        {paidDate.toLocaleTimeString()}
                                    </Text>

                                    <Text
                                        style={
                                            styles.info
                                        }
                                    >
                                        {text.calculatedAmount}: ₹
                                        {payment.calculatedAmount.toFixed(
                                            2
                                        )}
                                    </Text>

                                    <Text
                                        style={
                                            styles.info
                                        }
                                    >
                                        {text.calculatedPenalty}: ₹
                                        {payment.calculatedPenalty.toFixed(
                                            2
                                        )}
                                    </Text>

                                    {payment.isManualOverride && (
                                        <Text
                                            style={
                                                styles.overrideInfo
                                            }
                                        >
                                            {text.manualOverride}
                                            {payment.overrideReason
                                                ? `: ${payment.overrideReason}`
                                                : ""}
                                        </Text>
                                    )}

                                    {isEditing ? (
                                        <View
                                            style={
                                                styles.editBox
                                            }
                                        >
                                            <Text
                                                style={
                                                    styles.label
                                                }
                                            >
                                                Date
                                                {" "}
                                                (DD/MM/YYYY)
                                            </Text>

                                            <TextInput
                                                style={
                                                    styles.input
                                                }
                                                value={
                                                    editDate
                                                }
                                                onChangeText={
                                                    setEditDate
                                                }
                                                placeholder="14/09/2026"
                                                keyboardType="numbers-and-punctuation"
                                                maxLength={
                                                    10
                                                }
                                            />

                                            <Text
                                                style={
                                                    styles.label
                                                }
                                            >
                                                Time
                                                {" "}
                                                (HH:MM)
                                            </Text>

                                            <TextInput
                                                style={
                                                    styles.input
                                                }
                                                value={
                                                    editTime
                                                }
                                                onChangeText={
                                                    setEditTime
                                                }
                                                placeholder="16:30"
                                                keyboardType="numbers-and-punctuation"
                                                maxLength={
                                                    5
                                                }
                                            />

                                            <View
                                                style={
                                                    styles.editButtons
                                                }
                                            >
                                                <TouchableOpacity
                                                    style={
                                                        styles.cancelEditButton
                                                    }
                                                    onPress={
                                                        cancelEditing
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.cancelEditText
                                                        }
                                                    >
                                                        Cancel
                                                    </Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={
                                                        styles.saveButton
                                                    }
                                                    onPress={() =>
                                                        saveEditedDate(
                                                            payment
                                                        )
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.saveButtonText
                                                        }
                                                    >
                                                        Save
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={
                                                styles.editButton
                                            }
                                            onPress={() =>
                                                startEditing(
                                                    payment
                                                )
                                            }
                                        >
                                            <Text
                                                style={
                                                    styles.editButtonText
                                                }
                                            >
                                                {text.editDate}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        }
                    )
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

    content: {
        padding: 16,
        paddingBottom: 40,
    },

    center: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },

    back: {
        fontSize: 16,
        marginBottom: 16,
    },

    title: {
        fontSize: 25,
        fontWeight: "700",
    },

    memberName: {
        marginTop: 6,
        fontSize: 18,
        fontWeight: "600",
    },

    subtitle: {
        marginTop: 4,
        color: "#666",
    },

    paymentCard: {
        marginTop: 16,
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
    },

    paymentNumber: {
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 8,
    },

    amount: {
        fontSize: 17,
        fontWeight: "700",
    },

    info: {
        marginTop: 5,
        fontSize: 14,
        color: "#555",
    },

    overrideInfo: {
        marginTop: 8,
        fontSize: 13,
        color: "#9A6700",
        fontWeight: "600",
    },

    editButton: {
        marginTop: 14,
        alignSelf: "flex-start",
        backgroundColor: "#222",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
    },

    editButtonText: {
        color: "#FFFFFF",
        fontWeight: "600",
    },

    editBox: {
        marginTop: 16,
    },

    label: {
        marginTop: 10,
        marginBottom: 6,
        fontSize: 14,
        fontWeight: "600",
    },

    input: {
        borderWidth: 1,
        borderColor: "#D5D5D5",
        borderRadius: 9,
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontSize: 16,
        backgroundColor: "#FAFAFA",
    },

    editButtons: {
        flexDirection: "row",
        gap: 10,
        marginTop: 16,
    },

    cancelEditButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#CCC",
        paddingVertical: 12,
        borderRadius: 9,
        alignItems: "center",
    },

    cancelEditText: {
        fontSize: 15,
        fontWeight: "600",
    },

    saveButton: {
        flex: 1,
        backgroundColor: "#222",
        paddingVertical: 12,
        borderRadius: 9,
        alignItems: "center",
    },

    saveButtonText: {
        color: "#FFFFFF",
        fontWeight: "700",
    },

    emptyContainer: {
        marginTop: 40,
        alignItems: "center",
    },
});
