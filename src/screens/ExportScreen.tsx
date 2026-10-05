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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
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

type Obligation = {
    id: string;
    memberId: string;
    year: number;
    month: number;
    originalInstallment: number;
    currentAmountDue: number;
    penalty: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
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
};

type ExportRow = {
    memberName: string;
    mobile: string;
    year: number;
    month: string;
    originalInstallment: number;
    penalty: number;
    totalDue: number;
    paid: number;
    pending: number;
    status: string;
    paymentDate: string;
    paymentAmount: number | "";
    manualOverride: string;
    overrideReason: string;
    calculatedAmount: number | "";
    calculatedPenalty: number | "";
};

const MEMBERS_KEY = "mandal_members";
const OBLIGATIONS_KEY = "mandal_monthly_obligations";
const PAYMENTS_KEY = "mandal_payments";

const months = {
    English: [
        "January", "February", "March", "April",
        "May", "June", "July", "August",
        "September", "October", "November", "December",
    ],
    Gujarati: [
        "જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ",
        "મે", "જૂન", "જુલાઈ", "ઓગસ્ટ",
        "સપ્ટેમ્બર", "ઓક્ટોબર", "નવેમ્બર", "ડિસેમ્બર",
    ],
};

const escapeCsv = (value: unknown) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
};

const money = (value: number) =>
    Number(value || 0).toFixed(2);

const buildRows = (
    members: Member[],
    obligations: Obligation[],
    payments: Payment[],
    monthNames: string[]
): ExportRow[] => {
    return obligations.flatMap(
        (obligation): ExportRow[] => {
            const member = members.find(
                (item) => item.id === obligation.memberId
            );

            const memberPayments = payments
                .filter(
                    (payment) =>
                        payment.obligationId === obligation.id
                )
                .sort(
                    (a, b) =>
                        new Date(a.paidAt).getTime() -
                        new Date(b.paidAt).getTime()
                );

            if (memberPayments.length === 0) {
                const row: ExportRow = {
                    memberName: member?.name ?? "Unknown",
                    mobile: member?.mobile ?? "",
                    year: obligation.year,
                    month:
                        monthNames[obligation.month - 1] ??
                        String(obligation.month),
                    originalInstallment:
                    obligation.originalInstallment,
                    penalty: obligation.penalty,
                    totalDue: obligation.currentAmountDue,
                    paid: obligation.paidAmount,
                    pending: obligation.remainingAmount,
                    status: obligation.status,
                    paymentDate: "",
                    paymentAmount: 0,
                    manualOverride: "",
                    overrideReason: "",
                    calculatedAmount: "",
                    calculatedPenalty: "",
                };

                return [row];
            }

            return memberPayments.map(
                (payment): ExportRow => ({
                    memberName: member?.name ?? "Unknown",
                    mobile: member?.mobile ?? "",
                    year: obligation.year,
                    month:
                        monthNames[obligation.month - 1] ??
                        String(obligation.month),
                    originalInstallment:
                    obligation.originalInstallment,
                    penalty: obligation.penalty,
                    totalDue: obligation.currentAmountDue,
                    paid: obligation.paidAmount,
                    pending: obligation.remainingAmount,
                    status: obligation.status,
                    paymentDate: new Date(
                        payment.paidAt
                    ).toLocaleString(),
                    paymentAmount:
                    payment.actualCollectedAmount,
                    manualOverride:
                        payment.isManualOverride
                            ? "Yes"
                            : "No",
                    overrideReason:
                        payment.overrideReason ?? "",
                    calculatedAmount:
                    payment.calculatedAmount,
                    calculatedPenalty:
                    payment.calculatedPenalty,
                })
            );
        }
    );
};

const rowsToCsv = (rows: ReturnType<typeof buildRows>) => {
    const header = [
        "Member Name",
        "Mobile",
        "Year",
        "Month",
        "Original Installment",
        "Penalty",
        "Total Due",
        "Paid",
        "Pending",
        "Status",
        "Payment Date",
        "Payment Amount",
        "Manual Override",
        "Override Reason",
        "Calculated Amount",
        "Calculated Penalty",
    ];

    const lines = rows.map((row) =>
        [
            row.memberName,
            row.mobile,
            row.year,
            row.month,
            money(row.originalInstallment),
            money(row.penalty),
            money(row.totalDue),
            money(row.paid),
            money(row.pending),
            row.status,
            row.paymentDate,
            row.paymentAmount === ""
                ? ""
                : money(row.paymentAmount),
            row.manualOverride,
            row.overrideReason,
            row.calculatedAmount === ""
                ? ""
                : money(row.calculatedAmount),
            row.calculatedPenalty === ""
                ? ""
                : money(row.calculatedPenalty),
        ]
            .map(escapeCsv)
            .join(",")
    );

    return [header.map(escapeCsv).join(","), ...lines].join("\n");
};

const rowsToHtml = (
    rows: ReturnType<typeof buildRows>,
    title: string
) => {
    const body = rows
        .map(
            (row) => `
                <tr>
                    <td>${row.memberName}</td>
                    <td>${row.mobile}</td>
                    <td>${row.year}</td>
                    <td>${row.month}</td>
                    <td>₹${money(row.originalInstallment)}</td>
                    <td>₹${money(row.penalty)}</td>
                    <td>₹${money(row.totalDue)}</td>
                    <td>₹${money(row.paid)}</td>
                    <td>₹${money(row.pending)}</td>
                    <td>${row.status}</td>
                    <td>${row.paymentDate}</td>
                    <td>₹${money(Number(row.paymentAmount || 0))}</td>
                    <td>${row.manualOverride}</td>
                    <td>${row.overrideReason}</td>
                </tr>`
        )
        .join("");

    return `
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { font-size: 22px; }
                table { width: 100%; border-collapse: collapse; font-size: 9px; }
                th, td { border: 1px solid #ccc; padding: 5px; text-align: left; }
                th { background: #f1f1f1; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            <table>
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>Mobile</th>
                        <th>Year</th>
                        <th>Month</th>
                        <th>Original</th>
                        <th>Penalty</th>
                        <th>Total Due</th>
                        <th>Paid</th>
                        <th>Pending</th>
                        <th>Status</th>
                        <th>Payment Date</th>
                        <th>Payment Amount</th>
                        <th>Override</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </body>
        </html>
    `;
};

export default function ExportScreen() {
    const navigation = useNavigation();
    const { language } = useLanguage();

    const monthNames = months[language];

    const text = language === "Gujarati"
        ? {
            back: "← પાછા",
            title: "ડેટા એક્સપોર્ટ",
            subtitle: "તમારા મંડળના રેકોર્ડ CSV અથવા PDF તરીકે એક્સપોર્ટ કરો.",
            exportScope: "એક્સપોર્ટનો પ્રકાર",
            month: "મહિનો",
            year: "વર્ષ",
            all: "બધા",
            includedTitle: "એક્સપોર્ટમાં સમાવિષ્ટ",
            includedText:
                "સભ્યની વિગતો, મૂળ હપ્તો, દંડ, કુલ બાકી, ભરેલ રકમ, બાકી રકમ, ચુકવણી તારીખો, આંશિક ચુકવણીઓ અને મેન્યુઅલ ઓવરરાઇડ વિગતો.",
            exportCsv: "CSV એક્સપોર્ટ",
            exportPdf: "PDF એક્સપોર્ટ",
            csvHint: "Excel સાથે સુસંગત સ્પ્રેડશીટ ફોર્મેટ",
            pdfHint: "પ્રિન્ટ અથવા શેર કરી શકાય તેવો રિપોર્ટ",
            loading: "એક્સપોર્ટ ડેટા લોડ થઈ રહ્યો છે...",
            error: "ભૂલ",
            loadError: "એક્સપોર્ટ માટે ડેટા લોડ કરી શકાયું નથી.",
            noData: "ડેટા ઉપલબ્ધ નથી",
            noDataMessage: "પસંદ કરેલા એક્સપોર્ટ માટે કોઈ ડેટા ઉપલબ્ધ નથી.",
            sharingUnavailable: "શેરિંગ ઉપલબ્ધ નથી",
            sharingMessage: "આ ડિવાઇસ પર શેરિંગ ઉપલબ્ધ નથી.",
            exportError: "એક્સપોર્ટ ભૂલ",
            csvError: "CSV એક્સપોર્ટ બનાવી શકાયું નથી.",
            pdfSharingMessage: "PDF બનાવવામાં આવી છે, પરંતુ આ ડિવાઇસ પર શેરિંગ ઉપલબ્ધ નથી.",
            pdfError: "PDF એક્સપોર્ટ ભૂલ",
            exportCsvDialog: "My Mandal CSV એક્સપોર્ટ",
            exportPdfDialog: "My Mandal PDF એક્સપોર્ટ",
            allHistory: "My Mandal - તમામ ઐતિહાસિક ડેટા",
        }
        : {
            back: "← Back",
            title: "Export Data",
            subtitle: "Export your Mandal records as CSV or PDF.",
            exportScope: "Export Scope",
            month: "Month",
            year: "Year",
            all: "All",
            includedTitle: "Included in export",
            includedText:
                "Member details, original installment, penalty, total due, paid, pending, payment dates, partial payments, and manual override details.",
            exportCsv: "Export CSV",
            exportPdf: "Export PDF",
            csvHint: "Excel-compatible spreadsheet format",
            pdfHint: "Printable/shareable report",
            loading: "Loading export data...",
            error: "Error",
            loadError: "Unable to load data for export.",
            noData: "No Data",
            noDataMessage: "There is no data available for the selected export.",
            sharingUnavailable: "Sharing Unavailable",
            sharingMessage: "Sharing is not available on this device.",
            exportError: "Export Error",
            csvError: "Unable to create the CSV export.",
            pdfSharingMessage: "The PDF was created, but sharing is not available on this device.",
            pdfError: "PDF Export Error",
            exportCsvDialog: "Export My Mandal CSV",
            exportPdfDialog: "Export My Mandal PDF",
            allHistory: "My Mandal - All Historical Data",
        };

    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(
        new Date().getMonth() + 1
    );
    const [scope, setScope] =
        useState<"month" | "year" | "all">("month");

    const [members, setMembers] = useState<Member[]>([]);
    const [obligations, setObligations] = useState<Obligation[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);

            const [membersJson, obligationsJson, paymentsJson] =
                await Promise.all([
                    AsyncStorage.getItem(MEMBERS_KEY),
                    AsyncStorage.getItem(OBLIGATIONS_KEY),
                    AsyncStorage.getItem(PAYMENTS_KEY),
                ]);

            setMembers(
                membersJson ? JSON.parse(membersJson) : []
            );
            setObligations(
                obligationsJson ? JSON.parse(obligationsJson) : []
            );
            setPayments(
                paymentsJson ? JSON.parse(paymentsJson) : []
            );
        } catch (error) {
            console.error("Export load error:", error);
            Alert.alert(
                text.error,
                text.loadError
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const getExportRows = () => {
        let filteredObligations = obligations;

        if (scope === "year") {
            filteredObligations = obligations.filter(
                (item) => item.year === year
            );
        }

        if (scope === "month") {
            filteredObligations = obligations.filter(
                (item) =>
                    item.year === year &&
                    item.month === month
            );
        }

        const obligationIds = new Set(
            filteredObligations.map((item) => item.id)
        );

        const filteredPayments = payments.filter(
            (payment) =>
                obligationIds.has(payment.obligationId)
        );

        return buildRows(
            members,
            filteredObligations,
            filteredPayments,
            monthNames
        );
    };

    const exportCsv = async () => {
        try {
            const rows = getExportRows();

            if (rows.length === 0) {
                Alert.alert(
                    text.noData,
                    text.noDataMessage
                );
                return;
            }

            const csv = rowsToCsv(rows);

            if (!(await Sharing.isAvailableAsync())) {
                Alert.alert(
                    text.sharingUnavailable,
                    text.sharingMessage
                );
                return;
            }

            const fileUri =
                `${FileSystem.cacheDirectory}my-mandal-export-${Date.now()}.csv`;

            await FileSystem.writeAsStringAsync(
                fileUri,
                csv,
                {
                    encoding: FileSystem.EncodingType.UTF8,
                }
            );

            await Sharing.shareAsync(fileUri, {
                mimeType: "text/csv",
                dialogTitle: text.exportCsvDialog,
                UTI: "public.comma-separated-values-text",
            });
        } catch (error) {
            console.error("CSV export error:", error);
            Alert.alert(
                text.exportError,
                text.csvError
            );
        }
    };

    const exportPdf = async () => {
        try {
            const rows = getExportRows();

            if (rows.length === 0) {
                Alert.alert(
                    text.noData,
                    text.noDataMessage
                );
                return;
            }

            const title =
                scope === "month"
                    ? `My Mandal - ${monthNames[month - 1]} ${year}`
                    : scope === "year"
                        ? `My Mandal - ${year}`
                        : text.allHistory;

            const { base64 } = await Print.printToFileAsync({
                html: rowsToHtml(rows, title),
                base64: true,
            });

            if (!base64) {
                throw new Error("PDF data was not generated.");
            }

            const fileName =
                scope === "month"
                    ? `my-mandal-${year}-${String(month).padStart(2, "0")}.pdf`
                    : scope === "year"
                        ? `my-mandal-${year}.pdf`
                        : "my-mandal-all-history.pdf";

            const fileUri =
                `${FileSystem.cacheDirectory}${fileName}`;

            await FileSystem.writeAsStringAsync(
                fileUri,
                base64,
                {
                    encoding:
                    FileSystem.EncodingType.Base64,
                }
            );

            const sharingAvailable =
                await Sharing.isAvailableAsync();

            if (!sharingAvailable) {
                Alert.alert(
                    text.sharingUnavailable,
                    text.pdfSharingMessage
                );
                return;
            }

            await Sharing.shareAsync(fileUri, {
                mimeType: "application/pdf",
                dialogTitle: text.exportPdfDialog,
                UTI: "com.adobe.pdf",
            });
        } catch (error) {
            console.error("PDF export error:", error);

            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            Alert.alert(
                text.pdfError,
                message
            );
        }
    };

    if (loading) {
        return (
            <View style={styles.loading}>
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
                contentContainerStyle={styles.content}
            >
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.back}>
                        {text.back}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.title}>
                    {text.title}
                </Text>

                <Text style={styles.subtitle}>
                    {text.subtitle}
                </Text>

                <Text style={styles.sectionTitle}>
                    {text.exportScope}
                </Text>

                <View style={styles.scopeRow}>
                    {(
                        [
                            ["month", text.month],
                            ["year", text.year],
                            ["all", text.all],
                        ] as Array<["month" | "year" | "all", string]>
                    ).map(([value, label]) => (
                        <TouchableOpacity
                            key={value}
                            style={[
                                styles.scopeButton,
                                scope === value &&
                                styles.scopeButtonSelected,
                            ]}
                            onPress={() =>
                                setScope(
                                    value as
                                        | "month"
                                        | "year"
                                        | "all"
                                )
                            }
                        >
                            <Text
                                style={[
                                    styles.scopeText,
                                    scope === value &&
                                    styles.scopeTextSelected,
                                ]}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {scope !== "all" && (
                    <View style={styles.selectorCard}>
                        <View style={styles.selectorRow}>
                            <TouchableOpacity
                                style={styles.smallButton}
                                onPress={() =>
                                    setYear(
                                        (current) =>
                                            current - 1
                                    )
                                }
                            >
                                <Text style={styles.smallButtonText}>
                                    ‹
                                </Text>
                            </TouchableOpacity>

                            <Text style={styles.yearText}>
                                {year}
                            </Text>

                            <TouchableOpacity
                                style={styles.smallButton}
                                onPress={() =>
                                    setYear(
                                        (current) =>
                                            current + 1
                                    )
                                }
                            >
                                <Text style={styles.smallButtonText}>
                                    ›
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {scope === "month" && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={
                                    false
                                }
                                contentContainerStyle={
                                    styles.monthRow
                                }
                            >
                                {monthNames.map(
                                    (name: string, index: number) => (
                                        <TouchableOpacity
                                            key={name}
                                            style={[
                                                styles.monthButton,
                                                month ===
                                                index +
                                                1 &&
                                                styles.monthButtonSelected,
                                            ]}
                                            onPress={() =>
                                                setMonth(
                                                    index +
                                                    1
                                                )
                                            }
                                        >
                                            <Text
                                                style={[
                                                    styles.monthText,
                                                    month ===
                                                    index +
                                                    1 &&
                                                    styles.monthTextSelected,
                                                ]}
                                            >
                                                {name.slice(
                                                    0,
                                                    3
                                                )}
                                            </Text>
                                        </TouchableOpacity>
                                    )
                                )}
                            </ScrollView>
                        )}
                    </View>
                )}

                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>
                        {text.includedTitle}
                    </Text>
                    <Text style={styles.infoText}>
                        {text.includedText}
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.exportButton}
                    onPress={exportCsv}
                >
                    <Text style={styles.exportButtonText}>
                        {text.exportCsv}
                    </Text>
                    <Text style={styles.exportHint}>
                        {text.csvHint}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.exportButton}
                    onPress={exportPdf}
                >
                    <Text style={styles.exportButtonText}>
                        {text.exportPdf}
                    </Text>
                    <Text style={styles.exportHint}>
                        {text.pdfHint}
                    </Text>
                </TouchableOpacity>
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
        padding: 20,
        paddingBottom: 40,
    },
    loading: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingText: {
        marginTop: 10,
        color: "#666",
    },
    back: {
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
        marginBottom: 22,
    },
    sectionTitle: {
        fontSize: 19,
        fontWeight: "700",
        marginBottom: 10,
    },
    scopeRow: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 14,
    },
    scopeButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
    },
    scopeButtonSelected: {
        backgroundColor: "#2563EB",
    },
    scopeText: {
        fontWeight: "600",
    },
    scopeTextSelected: {
        color: "#FFFFFF",
    },
    selectorCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
    },
    selectorRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    smallButton: {
        width: 42,
        height: 42,
        borderRadius: 10,
        backgroundColor: "#EEEEEE",
        alignItems: "center",
        justifyContent: "center",
    },
    smallButtonText: {
        fontSize: 28,
    },
    yearText: {
        fontSize: 21,
        fontWeight: "700",
    },
    monthRow: {
        gap: 8,
        paddingBottom: 2,
    },
    monthButton: {
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 9,
        backgroundColor: "#F1F1F1",
    },
    monthButtonSelected: {
        backgroundColor: "#2563EB",
    },
    monthText: {
        fontSize: 13,
        fontWeight: "600",
    },
    monthTextSelected: {
        color: "#FFFFFF",
    },
    infoCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 16,
        marginBottom: 18,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 5,
    },
    infoText: {
        color: "#666",
        lineHeight: 20,
    },
    exportButton: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 17,
        marginBottom: 12,
    },
    exportButtonText: {
        fontSize: 17,
        fontWeight: "700",
    },
    exportHint: {
        marginTop: 4,
        fontSize: 12,
        color: "#666",
    },
});

