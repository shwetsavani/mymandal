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

type Props = {
    onSetupComplete: () => void;
};

const BIOMETRIC_ENABLED_KEY = "mandal_biometric_enabled";

export default function SetupScreen({
                                        onSetupComplete,
                                    }: Props) {
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
                "Enable Biometric Unlock?",
                "Use your fingerprint or face to unlock My Mandal faster. Your 4-digit PIN will remain available as a backup.",
                [
                    {
                        text: "Not Now",
                        style: "cancel",
                        onPress: async () => {
                            await finishSetup();
                        },
                    },
                    {
                        text: "Enable",
                        onPress: async () => {
                            try {
                                const result =
                                    await LocalAuthentication.authenticateAsync(
                                        {
                                            promptMessage:
                                                "Confirm biometric unlock",
                                            cancelLabel:
                                                "Use PIN",
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
                                        "Biometric Not Enabled",
                                        "Biometric authentication was not completed. You can continue using your 4-digit PIN.",
                                        [
                                            {
                                                text: "Continue",
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
                "Missing information",
                "Please fill in all fields."
            );
            return;
        }

        if (
            pin.length !== 4 ||
            !/^\d{4}$/.test(pin)
        ) {
            Alert.alert(
                "Invalid PIN",
                "PIN must contain exactly 4 digits."
            );
            return;
        }

        if (pin !== confirmPin) {
            Alert.alert(
                "PIN mismatch",
                "PIN and Confirm PIN do not match."
            );
            return;
        }

        if (!validateEmail(email.trim())) {
            Alert.alert(
                "Invalid email",
                "Please enter a valid recovery email."
            );
            return;
        }

        if (!/^\d+$/.test(mobile.trim())) {
            Alert.alert(
                "Invalid mobile number",
                "Please enter a valid mobile number."
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
                "Setup Complete",
                "Your Mandal setup has been saved successfully.",
                [
                    {
                        text: "Continue",
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
                "Error",
                "Unable to save setup information."
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
                    placeholder="Mandal Name"
                    value={mandalName}
                    onChangeText={setMandalName}
                    autoCapitalize="words"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Admin Name"
                    value={adminName}
                    onChangeText={setAdminName}
                    autoCapitalize="words"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Mobile Number"
                    value={mobile}
                    onChangeText={setMobile}
                    keyboardType="phone-pad"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Recovery Email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                <TextInput
                    style={styles.input}
                    placeholder="Create 4 Digit PIN"
                    value={pin}
                    onChangeText={setPin}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                />

                <TextInput
                    style={styles.input}
                    placeholder="Confirm 4 Digit PIN"
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
                            ? "Saving..."
                            : "Complete Setup"}
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