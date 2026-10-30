import React from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useStrings } from "../localization/strings";

export const colors = {
    primary: "#2563EB",
    text: "#1A2639",
    muted: "#667085",
    border: "#D0D5DD",
    background: "#F5F7FB",
    card: "#FFFFFF",
    danger: "#B42318",
    dangerBg: "#FEF3F2",
    success: "#027A48",
    successBg: "#ECFDF3",
    warning: "#B54708",
    warningBg: "#FFFAEB",
};

export function Screen(props: { title: string; onBack?: () => void; children: React.ReactNode; right?: React.ReactNode; scroll?: boolean }) {
    const s = useStrings();
    const body = props.scroll === false ? <View style={styles.flex}>{props.children}</View> : (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {props.children}
        </ScrollView>
    );
    return (
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
            <View style={styles.header}>
                {props.onBack ? (
                    <TouchableOpacity onPress={props.onBack} style={styles.backButton} accessibilityRole="button">
                        <Text style={styles.backText}>‹ {s.common.back}</Text>
                    </TouchableOpacity>
                ) : null}
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {props.title}
                </Text>
                {props.right}
            </View>
            <KeyboardAvoidingView style={styles.flex} behavior="padding">
                {body}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

export function Card(props: { children: React.ReactNode; title?: string; tone?: "default" | "warning" | "danger" | "success" }) {
    const tone =
        props.tone === "warning"
            ? { backgroundColor: colors.warningBg, borderColor: "#FEDF89" }
            : props.tone === "danger"
              ? { backgroundColor: colors.dangerBg, borderColor: "#FECDCA" }
              : props.tone === "success"
                ? { backgroundColor: colors.successBg, borderColor: "#ABEFC6" }
                : null;
    return (
        <View style={[styles.card, tone]}>
            {props.title ? <Text style={styles.cardTitle}>{props.title}</Text> : null}
            {props.children}
        </View>
    );
}

export function Row(props: { label: string; value: string; strong?: boolean; tone?: "danger" | "success" | "muted" }) {
    const color = props.tone === "danger" ? colors.danger : props.tone === "success" ? colors.success : props.tone === "muted" ? colors.muted : colors.text;
    return (
        <View style={styles.row}>
            <Text style={[styles.rowLabel, props.strong && styles.strong]}>{props.label}</Text>
            <Text style={[styles.rowValue, props.strong && styles.strong, { color }]}>{props.value}</Text>
        </View>
    );
}

export function Button(props: {
    label: string;
    onPress: () => void;
    variant?: "primary" | "secondary" | "danger" | "warning";
    disabled?: boolean;
    busy?: boolean;
    size?: "medium" | "small";
}) {
    const variant = props.variant ?? "primary";
    const style =
        variant === "primary"
            ? styles.buttonPrimary
            : variant === "danger"
              ? styles.buttonDanger
              : variant === "warning"
                ? styles.buttonWarning
                : styles.buttonSecondary;
    const textStyle = variant === "secondary" ? styles.buttonTextSecondary : variant === "warning" ? styles.buttonTextWarning : styles.buttonText;
    return (
        <TouchableOpacity
            accessibilityRole="button"
            style={[styles.button, props.size === "small" && styles.buttonSmall, style, (props.disabled || props.busy) && styles.disabled]}
            onPress={props.onPress}
            disabled={props.disabled || props.busy}
        >
            {props.busy ? <ActivityIndicator color={variant === "secondary" ? colors.primary : "#FFF"} /> : <Text style={[textStyle, props.size === "small" && styles.smallText]}>{props.label}</Text>}
        </TouchableOpacity>
    );
}

export function Field(props: TextInputProps & { label: string; hint?: string }) {
    const { label, hint, style, ...rest } = props;
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput style={[styles.input, style]} placeholderTextColor="#98A2B3" {...rest} />
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
    );
}

export function Badge(props: { label: string; tone: "success" | "danger" | "warning" | "muted" | "primary" }) {
    const map = {
        success: { bg: colors.successBg, fg: colors.success },
        danger: { bg: colors.dangerBg, fg: colors.danger },
        warning: { bg: colors.warningBg, fg: colors.warning },
        muted: { bg: "#F2F4F7", fg: colors.muted },
        primary: { bg: "#EFF4FF", fg: colors.primary },
    }[props.tone];
    return (
        <View style={[styles.badge, { backgroundColor: map.bg }]}>
            <Text style={[styles.badgeText, { color: map.fg }]}>{props.label}</Text>
        </View>
    );
}

export function MonthSelector(props: { label: string; onPrev?: () => void; onNext?: () => void }) {
    return (
        <View style={styles.monthSelector}>
            <TouchableOpacity onPress={props.onPrev} disabled={!props.onPrev} style={[styles.monthArrow, !props.onPrev && styles.disabled]}>
                <Text style={styles.monthArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{props.label}</Text>
            <TouchableOpacity onPress={props.onNext} disabled={!props.onNext} style={[styles.monthArrow, !props.onNext && styles.disabled]}>
                <Text style={styles.monthArrowText}>›</Text>
            </TouchableOpacity>
        </View>
    );
}

export function Sheet(props: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
            <KeyboardAvoidingView style={styles.sheetOverlay} behavior="padding">
                <View style={styles.sheet}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>{props.title}</Text>
                        <TouchableOpacity onPress={props.onClose}>
                            <Text style={styles.sheetClose}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled">{props.children}</ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

export function Loading() {
    return (
        <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
    );
}

export function Note(props: { children: React.ReactNode; tone?: "muted" | "warning" | "danger" }) {
    const color = props.tone === "warning" ? colors.warning : props.tone === "danger" ? colors.danger : colors.muted;
    return <Text style={[styles.note, { color }]}>{props.children}</Text>;
}

export const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 12 },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: "#EAECF0", gap: 8 },
    backButton: { paddingVertical: 4, paddingRight: 8 },
    backText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text },
    card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#EAECF0", gap: 6 },
    cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 4 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 2 },
    rowLabel: { flex: 1, fontSize: 14, color: colors.muted },
    rowValue: { fontSize: 15, color: colors.text, fontWeight: "600" },
    strong: { fontSize: 16, fontWeight: "700", color: colors.text },
    button: { minHeight: 48, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, marginTop: 4 },
    buttonSmall: { minHeight: 36, paddingHorizontal: 10 },
    buttonPrimary: { backgroundColor: colors.primary },
    buttonDanger: { backgroundColor: colors.danger },
    buttonWarning: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: "#FEC84B" },
    buttonSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    buttonText: { color: "#FFF", fontSize: 16, fontWeight: "600", textAlign: "center" },
    buttonTextSecondary: { color: colors.primary, fontSize: 16, fontWeight: "600", textAlign: "center" },
    buttonTextWarning: { color: colors.warning, fontSize: 16, fontWeight: "700", textAlign: "center" },
    smallText: { fontSize: 14 },
    disabled: { opacity: 0.45 },
    field: { gap: 4, marginBottom: 10 },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.muted },
    input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: colors.text, backgroundColor: "#FFF" },
    hint: { fontSize: 12, color: colors.muted },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
    badgeText: { fontSize: 12, fontWeight: "700" },
    monthSelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: "#EAECF0" },
    monthArrow: { paddingHorizontal: 20, paddingVertical: 10 },
    monthArrowText: { fontSize: 26, color: colors.primary, fontWeight: "700" },
    monthLabel: { fontSize: 17, fontWeight: "700", color: colors.text },
    sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: "90%" },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.text, flex: 1 },
    sheetClose: { fontSize: 20, color: colors.muted, paddingHorizontal: 8 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    note: { fontSize: 13, lineHeight: 19 },
});
