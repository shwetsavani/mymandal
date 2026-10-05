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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useLanguage } from "../localization/LanguageContext";

type Props = {
    onSetupComplete: () => void;
};

const BIOMETRIC_ENABLED_KEY = "mandal_biometric_enabled";

export default function SetupScreen({
                                        onSetupComplete,
                                    }: Props) {
    const { language } = useLanguage();

    const text =
        language === "Gujarati"
            ? {
                title: "My Mandal",
                subtitle: "તમારું મંડળ સેટ કરો",
                mandalName: "મંડળનું નામ",
                adminName: "એડમિનનું નામ",
                mobile: "મોબાઇલ નંબર",
                recoveryEmail: "રિકવરી ઈમેઇલ",
                createPin: "4 અંકનો PIN બનાવો",
                confirmPin: "4 અંકનો PIN ફરી દાખલ કરો",
                saving: "સાચવી રહ્યા છીએ...",
                completeSetup: "સેટઅપ પૂર્ણ કરો",
                missingTitle: "માહિતી અધૂરી છે",
                missingMessage: "કૃપા કરીને બધી માહિતી ભરો.",
                invalidPinTitle: "અમાન્ય PIN",
                invalidPinMessage: "PIN માં ચોક્કસ 4 અંક હોવા જોઈએ.",
                pinMismatchTitle: "PIN મેળ ખાતો નથી",
                pinMismatchMessage: "PIN અને Confirm PIN મેળ ખાતા નથી.",
                invalidEmailTitle: "અમાન્ય ઈમેઇલ",
                invalidEmailMessage: "કૃપા કરીને માન્ય રિકવરી ઈમેઇલ દાખલ કરો.",
                invalidMobileTitle: "અમાન્ય મોબાઇલ નંબર",
                invalidMobileMessage: "કૃપા કરીને માન્ય મોબાઇલ નંબર દાખલ કરો.",
                setupCompleteTitle: "સેટઅપ પૂર્ણ",
                setupCompleteMessage: "તમારા મંડળનું સેટઅપ સફળતાપૂર્વક સેવ થયું છે.",
                continue: "ચાલુ રાખો",
                enableBiometricTitle: "બાયોમેટ્રિક અનલોક ચાલુ કરવું છે?",
                enableBiometricMessage:
                    "My Mandal ઝડપથી અનલોક કરવા માટે તમારા ફિંગરપ્રિન્ટ અથવા ચહેરાનો ઉપયોગ કરો. તમારા 4 અંકના PIN નો બેકઅપ તરીકે ઉપયોગ કરી શકશો.",
                notNow: "હમણાં નહીં",
                enable: "ચાલુ કરો",
                confirmBiometric: "બાયોમેટ્રિક અનલોકની પુષ્ટિ કરો",
                usePin: "PIN નો ઉપયોગ કરો",
                biometricNotEnabledTitle: "બાયોમેટ્રિક ચાલુ થયું નથી",
                biometricNotEnabledMessage:
                    "બાયોમેટ્રિક ઓથેન્ટિકેશન પૂર્ણ થયું નથી. તમે તમારા 4 અંકના PIN નો ઉપયોગ ચાલુ રાખી શકો છો.",
                errorTitle: "ભૂલ",
                saveError: "સેટઅપ માહિતી સેવ કરી શકાઈ નથી.",
            }
            : {
                title: "My Mandal",
                subtitle: "Set up your Mandal",
                mandalName: "Mandal Name",
                adminName: "Admin Name",
                mobile: "Mobile Number",
                recoveryEmail: "Recovery Email",
                createPin: "Create 4 Digit PIN",
                confirmPin: "Confirm 4 Digit PIN",
                saving: "Saving...",
                completeSetup: "Complete Setup",
                missingTitle: "Missing information",
                missingMessage: "Please fill in all fields.",
                invalidPinTitle: "Invalid PIN",
                invalidPinMessage: "PIN must contain exactly 4 digits.",
                pinMismatchTitle: "PIN mismatch",
                pinMismatchMessage: "PIN and Confirm PIN do not match.",
                invalidEmailTitle: "Invalid email",
                invalidEmailMessage: "Please enter a valid recovery email.",
                invalidMobileTitle: "Invalid mobile number",
                invalidMobileMessage: "Please enter a valid mobile number.",
                setupCompleteTitle: "Setup Complete",
                setupCompleteMessage: "Your Mandal setup has been saved successfully.",
                continue: "Continue",
                enableBiometricTitle: "Enable Biometric Unlock?",
                enableBiometricMessage:
                    "Use your fingerprint or face to unlock My Mandal faster. Your 4-digit PIN will remain available as a backup.",
                notNow: "Not Now",
                enable: "Enable",
                confirmBiometric: "Confirm biometric unlock",
                usePin: "Use PIN",
                biometricNotEnabledTitle: "Biometric Not Enabled",
                biometricNotEnabledMessage:
                    "Biometric authentication was not completed. You can continue using your 4-digit PIN.",
                errorTitle: "Error",
                saveError: "Unable to save setup information.",
            };

    const [mandalName, setMandalName] = useState("");
    const [adminName, setAdminName] = useState("");
    const [mobile, setMobile] = useState("");
    const [email, setEmail] = useState("");
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [saving, setSaving] = useState(false);

    const validateEmail = (value: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    };

    const finishSetup = async () => {
        await AsyncStorage.setItem(
            BIOMETRIC_ENABLED_KEY,
            "false"
        );

        onSetupComplete();
    };

    const askToEnableBiometric = async () => {
        try {
            const hasHardware =
                await LocalAuthentication.hasHardwareAsync();

            const isEnrolled =
                await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled) {
                await finishSetup();
                return;
            }

            Alert.alert(
                text.enableBiometricTitle,
                text.enableBiometricMessage,
                [
                    {
                        text: text.notNow,
                        style: "cancel",
                        onPress: async () => {
                            await finishSetup();
                        },
                    },
                    {
                        text: text.enable,
                        onPress: async () => {
                            try {
                                const result =
                                    await LocalAuthentication.authenticateAsync(
                                        {
                                            promptMessage:
                                            text.confirmBiometric,
                                            cancelLabel:
                                            text.usePin,
                                            disableDeviceFallback:
                                                true,
                                        }
                                    );

                                if (result.success) {
                                    await AsyncStorage.setItem(
                                        BIOMETRIC_ENABLED_KEY,
                                        "true"
                                    );

                                    onSetupComplete();
                                } else {
                                    await AsyncStorage.setItem(
                                        BIOMETRIC_ENABLED_KEY,
                                        "false"
                                    );

                                    Alert.alert(
                                        text.biometricNotEnabledTitle,
                                        text.biometricNotEnabledMessage,
                                        [
                                            {
                                                text: text.continue,
                                                onPress:
                                                finishSetup,
                                            },
                                        ]
                                    );
                                }
                            } catch (error) {
                                console.error(
                                    "Biometric setup error:",
                                    error
                                );

                                await AsyncStorage.setItem(
                                    BIOMETRIC_ENABLED_KEY,
                                    "false"
                                );

                                await finishSetup();
                            }
                        },
                    },
                ]
            );
        } catch (error) {
            console.error(
                "Biometric availability error:",
                error
            );

            await finishSetup();
        }
    };

    const saveSetup = async () => {
        if (
            !mandalName.trim() ||
            !adminName.trim() ||
            !mobile.trim() ||
            !email.trim() ||
            !pin ||
            !confirmPin
        ) {
            Alert.alert(
                text.missingTitle,
                text.missingMessage
            );
            return;
        }

        if (
            pin.length !== 4 ||
            !/^\d{4}$/.test(pin)
        ) {
            Alert.alert(
                text.invalidPinTitle,
                text.invalidPinMessage
            );
            return;
        }

        if (pin !== confirmPin) {
            Alert.alert(
                text.pinMismatchTitle,
                text.pinMismatchMessage
            );
            return;
        }

        if (!validateEmail(email.trim())) {
            Alert.alert(
                text.invalidEmailTitle,
                text.invalidEmailMessage
            );
            return;
        }

        if (!/^\d+$/.test(mobile.trim())) {
            Alert.alert(
                text.invalidMobileTitle,
                text.invalidMobileMessage
            );
            return;
        }

        try {
            setSaving(true);

            const setupData = {
                mandalName: mandalName.trim(),
                adminName: adminName.trim(),
                mobile: mobile.trim(),
                email: email.trim().toLowerCase(),
                pin,
                createdAt: new Date().toISOString(),
            };

            await AsyncStorage.setItem(
                "mandal_setup",
                JSON.stringify(setupData)
            );

            await AsyncStorage.setItem(
                BIOMETRIC_ENABLED_KEY,
                "false"
            );

            Alert.alert(
                text.setupCompleteTitle,
                text.setupCompleteMessage,
                [
                    {
                        text: text.continue,
                        onPress: async () => {
                            await askToEnableBiometric();
                        },
                    },
                ]
            );
        } catch (error) {
            console.error(
                "Setup save error:",
                error
            );

            Alert.alert(
                text.errorTitle,
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
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.title}>
                    My Mandal
                </Text>

                <Text style={styles.subtitle}>
                    Set up your Mandal
                </Text>

                <TextInput
                    style={styles.input}
                    placeholder={text.mandalName}
                    value={mandalName}
                    onChangeText={setMandalName}
                    autoCapitalize="words"
                />

                <TextInput
                    style={styles.input}
                    placeholder={text.adminName}
                    value={adminName}
                    onChangeText={setAdminName}
                    autoCapitalize="words"
                />

                <TextInput
                    style={styles.input}
                    placeholder={text.mobile}
                    value={mobile}
                    onChangeText={setMobile}
                    keyboardType="phone-pad"
                />

                <TextInput
                    style={styles.input}
                    placeholder={text.recoveryEmail}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                <TextInput
                    style={styles.input}
                    placeholder={text.createPin}
                    value={pin}
                    onChangeText={setPin}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                />

                <TextInput
                    style={styles.input}
                    placeholder={text.confirmPin}
                    value={confirmPin}
                    onChangeText={setConfirmPin}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                />

                <TouchableOpacity
                    style={[
                        styles.button,
                        saving &&
                        styles.buttonDisabled,
                    ]}
                    onPress={saveSetup}
                    disabled={saving}
                >
                    <Text style={styles.buttonText}>
                        {saving
                            ? text.saving
                            : text.completeSetup}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },

    content: {
        flexGrow: 1,
        justifyContent: "center",
        padding: 24,
    },

    title: {
        fontSize: 32,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 8,
    },

    subtitle: {
        fontSize: 17,
        textAlign: "center",
        marginBottom: 28,
        color: "#666666",
    },

    input: {
        height: 52,
        borderWidth: 1,
        borderColor: "#D1D5DB",
        borderRadius: 10,
        paddingHorizontal: 14,
        fontSize: 16,
        marginBottom: 14,
        backgroundColor: "#FFFFFF",
    },

    button: {
        height: 52,
        borderRadius: 10,
        backgroundColor: "#2563EB",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 8,
    },

    buttonDisabled: {
        opacity: 0.6,
    },

    buttonText: {
        color: "#FFFFFF",
        fontSize: 17,
        fontWeight: "600",
    },
});