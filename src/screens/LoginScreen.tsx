import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useStrings } from "../localization/strings";
import {
    FAILURES_PER_LOCKOUT,
    loadThrottle,
    noteSessionLock,
    observeClock,
    registerFailure,
    registerSuccess,
    remainingLockMs,
    saveThrottle,
    sessionLockRemainingMs,
} from "../security/loginThrottle";
import { checkPin, migratePlaintextPin } from "../security/pinVerifier";
import { KEYS } from "../storage/keys";
import { colors } from "../ui/components";

type Props = {
    onLoginSuccess: () => void;
    onForgotPin?: () => void;
};

const formatDuration = (ms: number) => {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export default function LoginScreen({ onLoginSuccess, onForgotPin }: Props) {
    const s = useStrings();
    const [pin, setPin] = useState("");
    const [checking, setChecking] = useState(false);
    const [lockMs, setLockMs] = useState(0);
    const [message, setMessage] = useState<string | null>(null);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const biometricRunning = useRef(false);

    const refreshLock = useCallback(async () => {
        const now = Date.now();
        const state = observeClock(await loadThrottle(), now);
        await saveThrottle(state);
        const remaining = Math.max(remainingLockMs(state, now), sessionLockRemainingMs());
        setLockMs(remaining);
        return remaining;
    }, []);

    const succeed = useCallback(async () => {
        await saveThrottle(registerSuccess(Date.now()));
        noteSessionLock(0);
        setPin("");
        // Complete the PIN migration if it was deferred earlier; failure keeps the old PIN working.
        void migratePlaintextPin();
        onLoginSuccess();
    }, [onLoginSuccess]);

    const tryBiometric = useCallback(async () => {
        if (biometricRunning.current) return;
        biometricRunning.current = true;
        try {
            if ((await AsyncStorage.getItem(KEYS.biometricEnabled)) !== "true") return;
            if ((await refreshLock()) > 0) return;
            const available = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
            if (!available) return;
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: s.login.biometricPrompt,
                cancelLabel: s.login.usePin,
                disableDeviceFallback: true,
            });
            if (result.success) await succeed();
        } catch (error) {
            console.error("Biometric unlock failed:", error);
        } finally {
            biometricRunning.current = false;
        }
    }, [refreshLock, s, succeed]);

    useEffect(() => {
        AsyncStorage.getItem(KEYS.biometricEnabled).then((v) => setBiometricEnabled(v === "true"));
        void refreshLock().then(() => tryBiometric());
        const sub = AppState.addEventListener("change", (next) => {
            if (next === "active") void refreshLock();
        });
        return () => sub.remove();
    }, [refreshLock, tryBiometric]);

    useEffect(() => {
        if (lockMs <= 0) return;
        const timer = setInterval(() => void refreshLock(), 1000);
        return () => clearInterval(timer);
    }, [lockMs, refreshLock]);

    const submit = async () => {
        if (checking || pin.length !== 4) return;
        setChecking(true);
        setMessage(null);
        try {
            if ((await refreshLock()) > 0) return;
            if (await checkPin(pin)) {
                await succeed();
                return;
            }
            const now = Date.now();
            const next = registerFailure(observeClock(await loadThrottle(), now), now);
            await saveThrottle(next);
            const remaining = remainingLockMs(next, now);
            noteSessionLock(remaining);
            setLockMs(remaining);
            setMessage(remaining > 0 ? null : s.login.incorrect(FAILURES_PER_LOCKOUT - (next.failures % FAILURES_PER_LOCKOUT)));
            setPin("");
        } finally {
            setChecking(false);
        }
    };

    const locked = lockMs > 0;

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.title}>My Mandal</Text>
            {locked ? (
                <>
                    <Text style={styles.lockTitle}>{s.login.locked}</Text>
                    <Text style={styles.timer}>{formatDuration(lockMs)}</Text>
                    <Text style={styles.hint}>{s.login.tryAgainIn(formatDuration(lockMs))}</Text>
                </>
            ) : (
                <>
                    <Text style={styles.subtitle}>{s.login.enterPin}</Text>
                    <TextInput
                        style={styles.pinInput}
                        value={pin}
                        onChangeText={(v) => setPin(v.replace(/\D/g, ""))}
                        keyboardType="number-pad"
                        maxLength={4}
                        secureTextEntry
                        placeholder="••••"
                        placeholderTextColor="#98A2B3"
                        textAlign="center"
                        onSubmitEditing={() => void submit()}
                    />
                    {message ? <Text style={styles.error}>{message}</Text> : null}
                    <TouchableOpacity style={[styles.button, (checking || pin.length !== 4) && styles.disabled]} onPress={() => void submit()} disabled={checking || pin.length !== 4}>
                        {checking ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{s.login.unlock}</Text>}
                    </TouchableOpacity>
                    {biometricEnabled ? (
                        <TouchableOpacity style={styles.link} onPress={() => void tryBiometric()}>
                            <Text style={styles.linkText}>{s.login.useBiometric}</Text>
                        </TouchableOpacity>
                    ) : null}
                </>
            )}
            {onForgotPin ? (
                <TouchableOpacity style={styles.link} onPress={onForgotPin}>
                    <Text style={styles.linkText}>{s.login.forgotPin}</Text>
                </TouchableOpacity>
            ) : null}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: "#FFF" },
    title: { fontSize: 32, fontWeight: "700", textAlign: "center", marginBottom: 10, color: colors.text },
    subtitle: { fontSize: 16, textAlign: "center", marginBottom: 24, color: colors.text },
    pinInput: { alignSelf: "center", width: 180, height: 55, borderWidth: 1, borderColor: "#999", borderRadius: 10, fontSize: 24, marginBottom: 12, color: colors.text, backgroundColor: "#FFF" },
    error: { color: colors.danger, textAlign: "center", marginBottom: 12 },
    button: { height: 50, borderRadius: 10, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
    disabled: { opacity: 0.5 },
    buttonText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
    lockTitle: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 10, color: colors.danger },
    timer: { fontSize: 42, fontWeight: "700", textAlign: "center", marginBottom: 12 },
    hint: { fontSize: 14, textAlign: "center", color: colors.muted },
    link: { marginTop: 18, alignItems: "center" },
    linkText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
});
