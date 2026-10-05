import React, { useState } from "react";

import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { useNavigation } from "@react-navigation/native";

import type {
    NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import { addMember } from "../database/memberStorage";

import { useLanguage } from "../localization/LanguageContext";

type RootStackParamList = {
    Home: undefined;
    Members: undefined;
    AddMember: undefined;
};

type AddMemberNavigationProp =
    NativeStackNavigationProp<
        RootStackParamList,
        "AddMember"
    >;

export default function AddMemberScreen() {
    const navigation =
        useNavigation<AddMemberNavigationProp>();

    const { language, t } = useLanguage();

    const [name, setName] =
        useState("");

    const [mobile, setMobile] =
        useState("");

    const [monthlyInstallment, setMonthlyInstallment] =
        useState("");

    const [saving, setSaving] =
        useState(false);

    const isGujarati =
        language === "Gujarati";

    const text = isGujarati
        ? {
            title: "સભ્ય ઉમેરો",
            subtitle:
                "નીચે સભ્યની વિગતો દાખલ કરો.",
            name: "નામ",
            mobile: "મોબાઇલ નંબર",
            installment:
                "માસિક હપ્તો",
            namePlaceholder:
                "સભ્યનું નામ દાખલ કરો",
            mobilePlaceholder:
                "મોબાઇલ નંબર દાખલ કરો",
            amountPlaceholder:
                "રકમ દાખલ કરો",
            required: "જરૂરી",
            enterName:
                "કૃપા કરીને સભ્યનું નામ દાખલ કરો.",
            enterMobile:
                "કૃપા કરીને મોબાઇલ નંબર દાખલ કરો.",
            enterInstallment:
                "કૃપા કરીને માસિક હપ્તો દાખલ કરો.",
            invalidAmount:
                "અમાન્ય રકમ",
            validInstallment:
                "કૃપા કરીને માન્ય માસિક હપ્તો દાખલ કરો.",
            memberAdded:
                "સભ્ય ઉમેરાયો",
            addedSuccessfully:
                "સફળતાપૂર્વક ઉમેરવામાં આવ્યો છે.",
            saveError:
                "સભ્ય સાચવી શક્યા નથી. કૃપા કરીને ફરી પ્રયાસ કરો.",
            ok: "બરાબર",
            saving: "સાચવી રહ્યું છે...",
            saveMember:
                "સભ્ય સાચવો",
        }
        : {
            title: "Add Member",
            subtitle:
                "Enter the member details below.",
            name: "Name",
            mobile: "Mobile Number",
            installment:
                "Monthly Installment",
            namePlaceholder:
                "Enter member name",
            mobilePlaceholder:
                "Enter mobile number",
            amountPlaceholder:
                "Enter amount",
            required: "Required",
            enterName:
                "Please enter member name.",
            enterMobile:
                "Please enter mobile number.",
            enterInstallment:
                "Please enter monthly installment.",
            invalidAmount:
                "Invalid Amount",
            validInstallment:
                "Please enter a valid monthly installment.",
            memberAdded:
                "Member Added",
            addedSuccessfully:
                "has been added successfully.",
            saveError:
                "Unable to save the member. Please try again.",
            ok: "OK",
            saving: "Saving...",
            saveMember:
                "Save Member",
        };

    const handleSave = async () => {
        const trimmedName =
            name.trim();

        const trimmedMobile =
            mobile.trim();

        const trimmedInstallment =
            monthlyInstallment.trim();

        if (!trimmedName) {
            Alert.alert(
                text.required,
                text.enterName
            );
            return;
        }

        if (!trimmedMobile) {
            Alert.alert(
                text.required,
                text.enterMobile
            );
            return;
        }

        if (!trimmedInstallment) {
            Alert.alert(
                text.required,
                text.enterInstallment
            );
            return;
        }

        const installment =
            Number(trimmedInstallment);

        if (
            !Number.isFinite(
                installment
            ) ||
            installment <= 0
        ) {
            Alert.alert(
                text.invalidAmount,
                text.validInstallment
            );
            return;
        }

        try {
            setSaving(true);

            await addMember(
                trimmedName,
                trimmedMobile,
                installment
            );

            Alert.alert(
                text.memberAdded,
                isGujarati
                    ? `${trimmedName} ${text.addedSuccessfully}`
                    : `${trimmedName} ${text.addedSuccessfully}`,
                [
                    {
                        text: text.ok,
                        onPress: () => {
                            navigation.navigate(
                                "Members"
                            );
                        },
                    },
                ]
            );
        } catch (error) {
            console.error(
                "Add member error:",
                error
            );

            Alert.alert(
                t.common.error,
                text.saveError
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={
                Platform.OS === "ios"
                    ? "padding"
                    : undefined
            }
        >
            <ScrollView
                contentContainerStyle={
                    styles.content
                }
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.title}>
                    {text.title}
                </Text>

                <Text style={styles.subtitle}>
                    {text.subtitle}
                </Text>

                {/* Name */}
                <View style={styles.field}>
                    <Text style={styles.label}>
                        {text.name}
                    </Text>

                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder={
                            text.namePlaceholder
                        }
                        placeholderTextColor="#9CA3AF"
                        style={styles.input}
                        autoCapitalize="words"
                    />
                </View>

                {/* Mobile */}
                <View style={styles.field}>
                    <Text style={styles.label}>
                        {text.mobile}
                    </Text>

                    <TextInput
                        value={mobile}
                        onChangeText={setMobile}
                        placeholder={
                            text.mobilePlaceholder
                        }
                        placeholderTextColor="#9CA3AF"
                        style={styles.input}
                        keyboardType="phone-pad"
                    />
                </View>

                {/* Monthly Installment */}
                <View style={styles.field}>
                    <Text style={styles.label}>
                        {text.installment}
                    </Text>

                    <TextInput
                        value={
                            monthlyInstallment
                        }
                        onChangeText={
                            setMonthlyInstallment
                        }
                        placeholder={
                            text.amountPlaceholder
                        }
                        placeholderTextColor="#9CA3AF"
                        style={styles.input}
                        keyboardType="numeric"
                    />
                </View>

                <TouchableOpacity
                    style={[
                        styles.saveButton,
                        saving &&
                        styles.disabledButton,
                    ]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    <Text
                        style={
                            styles.saveButtonText
                        }
                    >
                        {saving
                            ? text.saving
                            : text.saveMember}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
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

    title: {
        fontSize: 28,
        fontWeight: "700",
        color: "#1F2937",
        marginTop: 20,
    },

    subtitle: {
        fontSize: 14,
        color: "#6B7280",
        marginTop: 6,
        marginBottom: 28,
    },

    field: {
        marginBottom: 20,
    },

    label: {
        fontSize: 15,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 8,
    },

    input: {
        height: 52,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 12,
        paddingHorizontal: 15,
        fontSize: 16,
        color: "#111827",
    },

    saveButton: {
        marginTop: 12,
        height: 54,
        backgroundColor: "#2563EB",
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },

    disabledButton: {
        opacity: 0.6,
    },

    saveButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "700",
    },
});