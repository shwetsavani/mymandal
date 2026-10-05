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

import {
    useNavigation,
    useRoute,
} from "@react-navigation/native";

import type {
    NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import type {
    RouteProp,
} from "@react-navigation/native";

import {
    getMembers,
    updateMember,
} from "../database/memberStorage";

import { useLanguage } from "../localization/LanguageContext";

type RootStackParamList = {
    Home: undefined;
    Members: undefined;
    AddMember: undefined;
    EditMember: {
        memberId: string;
    };
};

type EditMemberNavigationProp =
    NativeStackNavigationProp<
        RootStackParamList,
        "EditMember"
    >;

type EditMemberRouteProp =
    RouteProp<
        RootStackParamList,
        "EditMember"
    >;

export default function EditMemberScreen() {
    const navigation =
        useNavigation<EditMemberNavigationProp>();

    const route =
        useRoute<EditMemberRouteProp>();

    const { memberId } = route.params;

    const { language, t } = useLanguage();

    const isGujarati =
        language === "Gujarati";

    const [name, setName] =
        useState("");

    const [mobile, setMobile] =
        useState("");

    const [monthlyInstallment, setMonthlyInstallment] =
        useState("");

    const [
        originalInstallment,
        setOriginalInstallment,
    ] = useState<number | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const text = isGujarati
        ? {
            memberNotFound:
                "સભ્ય મળ્યો નથી",
            memberNotFoundMessage:
                "આ સભ્ય મળી શક્યો નથી.",
            unableToLoad:
                "સભ્યની વિગતો લોડ કરી શકાઈ નથી.",
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
            memberUpdated:
                "સભ્ય અપડેટ થયો",
            updatedSuccessfully:
                "સફળતાપૂર્વક અપડેટ થયો છે.",
            newInstallmentNextMonth:
                "નવો માસિક હપ્તો આગામી મહિનાથી શરૂ થશે. વર્તમાન મહિનાનો હપ્તો બદલાશે નહીં.",
            unableToUpdate:
                "સભ્ય અપડેટ કરી શક્યા નથી. કૃપા કરીને ફરી પ્રયાસ કરો.",
            loadingMember:
                "સભ્ય લોડ થઈ રહ્યો છે...",
            editMember:
                "સભ્ય સંપાદિત કરો",
            updateDetails:
                "નીચે સભ્યની વિગતો અપડેટ કરો.",
            name: "નામ",
            mobileNumber:
                "મોબાઇલ નંબર",
            monthlyInstallment:
                "માસિક હપ્તો",
            namePlaceholder:
                "સભ્યનું નામ દાખલ કરો",
            mobilePlaceholder:
                "મોબાઇલ નંબર દાખલ કરો",
            amountPlaceholder:
                "રકમ દાખલ કરો",
            newInstallmentHelper:
                "નવો હપ્તો આગામી મહિનાથી શરૂ થશે. વર્તમાન મહિનાનો હપ્તો બદલાશે નહીં.",
            saving:
                "સાચવી રહ્યું છે...",
            saveChanges:
                "ફેરફારો સાચવો",
            ok: "બરાબર",
        }
        : {
            memberNotFound:
                "Member Not Found",
            memberNotFoundMessage:
                "This member could not be found.",
            unableToLoad:
                "Unable to load member details.",
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
            memberUpdated:
                "Member Updated",
            updatedSuccessfully:
                "has been updated successfully.",
            newInstallmentNextMonth:
                "The new monthly installment will start from next month. The current month's installment will remain unchanged.",
            unableToUpdate:
                "Unable to update the member. Please try again.",
            loadingMember:
                "Loading member...",
            editMember:
                "Edit Member",
            updateDetails:
                "Update the member details below.",
            name: "Name",
            mobileNumber:
                "Mobile Number",
            monthlyInstallment:
                "Monthly Installment",
            namePlaceholder:
                "Enter member name",
            mobilePlaceholder:
                "Enter mobile number",
            amountPlaceholder:
                "Enter amount",
            newInstallmentHelper:
                "The new installment will start from next month. The current month's installment will remain unchanged.",
            saving:
                "Saving...",
            saveChanges:
                "Save Changes",
            ok: "OK",
        };

    React.useEffect(() => {
        loadMember();
    }, []);

    const loadMember = async () => {
        try {
            const members =
                await getMembers();

            const member =
                members.find(
                    (item) =>
                        item.id === memberId
                );

            if (!member) {
                Alert.alert(
                    text.memberNotFound,
                    text.memberNotFoundMessage,
                    [
                        {
                            text: text.ok,
                            onPress: () =>
                                navigation.goBack(),
                        },
                    ]
                );

                return;
            }

            setName(member.name);

            setMobile(member.mobile);

            setMonthlyInstallment(
                String(
                    member.pendingMonthlyInstallment ??
                    member.monthlyInstallment
                )
            );

            setOriginalInstallment(
                member.monthlyInstallment
            );
        } catch (error) {
            console.error(
                "Load member error:",
                error
            );

            Alert.alert(
                t.common.error,
                text.unableToLoad
            );
        } finally {
            setLoading(false);
        }
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

        const installmentChanged =
            originalInstallment !== null &&
            installment !==
            originalInstallment;

        try {
            setSaving(true);

            await updateMember(
                memberId,
                {
                    name: trimmedName,
                    mobile: trimmedMobile,
                    monthlyInstallment:
                    installment,
                }
            );

            if (installmentChanged) {
                Alert.alert(
                    text.memberUpdated,

                    `${trimmedName} ${text.updatedSuccessfully}\n\n${text.newInstallmentNextMonth}`,

                    [
                        {
                            text: text.ok,
                            onPress: () =>
                                navigation.goBack(),
                        },
                    ]
                );
            } else {
                Alert.alert(
                    text.memberUpdated,

                    `${trimmedName} ${text.updatedSuccessfully}`,

                    [
                        {
                            text: text.ok,
                            onPress: () =>
                                navigation.goBack(),
                        },
                    ]
                );
            }
        } catch (error) {
            console.error(
                "Update member error:",
                error
            );

            Alert.alert(
                t.common.error,
                text.unableToUpdate
            );
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View
                style={
                    styles.loadingContainer
                }
            >
                <Text
                    style={
                        styles.loadingText
                    }
                >
                    {text.loadingMember}
                </Text>
            </View>
        );
    }

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
                    {text.editMember}
                </Text>

                <Text style={styles.subtitle}>
                    {text.updateDetails}
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
                        {text.mobileNumber}
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
                        {text.monthlyInstallment}
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

                    {originalInstallment !==
                        null &&
                        Number(
                            monthlyInstallment
                        ) !==
                        originalInstallment && (
                            <Text
                                style={
                                    styles.helperText
                                }
                            >
                                {
                                    text.newInstallmentHelper
                                }
                            </Text>
                        )}
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
                            : text.saveChanges}
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

    helperText: {
        marginTop: 8,
        fontSize: 13,
        lineHeight: 19,
        color: "#6B7280",
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

    loadingContainer: {
        flex: 1,
        backgroundColor: "#F7F8FA",
        justifyContent: "center",
        alignItems: "center",
    },

    loadingText: {
        fontSize: 15,
        color: "#6B7280",
    },
});