import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useStrings } from "../localization/strings";
import { createInitialSetup, SetupExistsError } from "../security/pinVerifier";
import { KEYS } from "../storage/keys";
import { Button, Field, colors } from "../ui/components";

type Props = {
    onSetupComplete: () => void;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function SetupScreen({ onSetupComplete }: Props) {
    const s = useStrings();
    const t = s.setup;

    const [mandalName, setMandalName] = useState("");
    const [adminName, setAdminName] = useState("");
    const [mobile, setMobile] = useState("");
    const [email, setEmail] = useState("");
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [saving, setSaving] = useState(false);

    const setBiometric = (enabled: boolean) => AsyncStorage.setItem(KEYS.biometricEnabled, enabled ? "true" : "false");

    const finishSetup = async () => {
        await setBiometric(false);
        onSetupComplete();
    };

    const askToEnableBiometric = async () => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!hasHardware || !isEnrolled) {
                await finishSetup();
                return;
            }
            Alert.alert(t.enableBiometricTitle, t.enableBiometricMessage, [
                { text: t.notNow, style: "cancel", onPress: () => void finishSetup() },
                {
                    text: t.enable,
                    onPress: async () => {
                        try {
                            const result = await LocalAuthentication.authenticateAsync({
                                promptMessage: t.confirmBiometric,
                                cancelLabel: s.login.usePin,
                                disableDeviceFallback: true,
                            });
                            if (result.success) {
                                await setBiometric(true);
                                onSetupComplete();
                            } else {
                                await setBiometric(false);
                                Alert.alert(t.biometricNotEnabledTitle, t.biometricNotEnabledMessage, [{ text: t.continue, onPress: () => void finishSetup() }]);
                            }
                        } catch (error) {
                            console.error("Biometric setup error:", error);
                            await finishSetup();
                        }
                    },
                },
            ]);
        } catch (error) {
            console.error("Biometric availability error:", error);
            await finishSetup();
        }
    };

    const saveSetup = async () => {
        if (!mandalName.trim() || !adminName.trim() || !mobile.trim() || !email.trim() || !pin || !confirmPin) {
            Alert.alert(t.missingTitle, t.missingMessage);
            return;
        }
        if (!/^\d{4}$/.test(pin)) {
            Alert.alert(t.invalidPinTitle, t.invalidPinMessage);
            return;
        }
        if (pin !== confirmPin) {
            Alert.alert(t.pinMismatchTitle, t.pinMismatchMessage);
            return;
        }
        if (!isValidEmail(email.trim())) {
            Alert.alert(t.invalidEmailTitle, t.invalidEmailMessage);
            return;
        }
        if (!/^\d+$/.test(mobile.trim())) {
            Alert.alert(t.invalidMobileTitle, t.invalidMobileMessage);
            return;
        }

        setSaving(true);
        try {
            await createInitialSetup(
                {
                    mandalName: mandalName.trim(),
                    adminName: adminName.trim(),
                    mobile: mobile.trim(),
                    email: email.trim().toLowerCase(),
                    createdAt: new Date().toISOString(),
                },
                pin
            );
            Alert.alert(t.setupCompleteTitle, t.setupCompleteMessage, [{ text: t.continue, onPress: () => void askToEnableBiometric() }]);
        } catch (error) {
            console.error("Setup save error:", error);
            Alert.alert(s.common.error, error instanceof SetupExistsError ? t.setupExists : t.saveError);
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <KeyboardAvoidingView style={styles.container} behavior="padding">
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                    <Text style={styles.title}>{t.title}</Text>
                    <Text style={styles.subtitle}>{t.subtitle}</Text>

                    <Field
                        label={t.mandalName}
                        placeholder={t.mandalNamePlaceholder}
                        value={mandalName}
                        onChangeText={setMandalName}
                        autoCapitalize="words"
                    />
                    <Field
                        label={t.adminName}
                        placeholder={t.adminNamePlaceholder}
                        value={adminName}
                        onChangeText={setAdminName}
                        autoCapitalize="words"
                    />
                    <Field label={t.mobile} placeholder={t.mobilePlaceholder} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
                    <Field
                        label={t.recoveryEmail}
                        placeholder={t.recoveryEmailPlaceholder}
                        hint={t.recoveryEmailHint}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <Field
                        label={t.createPin}
                        placeholder={t.createPinPlaceholder}
                        value={pin}
                        onChangeText={setPin}
                        keyboardType="number-pad"
                        maxLength={4}
                        secureTextEntry
                    />
                    <Field
                        label={t.confirmPin}
                        placeholder={t.confirmPinPlaceholder}
                        value={confirmPin}
                        onChangeText={setConfirmPin}
                        keyboardType="number-pad"
                        maxLength={4}
                        secureTextEntry
                    />

                    <Button label={saving ? t.saving : t.completeSetup} onPress={() => void saveSetup()} busy={saving} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#FFFFFF" },
    content: { flexGrow: 1, padding: 24, paddingBottom: 48, gap: 4 },
    title: { fontSize: 32, fontWeight: "700", textAlign: "center", color: colors.text, marginTop: 8 },
    subtitle: { fontSize: 17, textAlign: "center", color: colors.muted, marginBottom: 8 },
});
