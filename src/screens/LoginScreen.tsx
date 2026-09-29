import React, { useEffect, useRef, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    AppState,
    AppStateStatus,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

type Props = {
    onLoginSuccess: () => void;
};

type LoginSecurity = {
    failedAttempts: number;
    lockUntil: number | null;
};

const LOGIN_SECURITY_KEY = "mandal_login_security";
const BIOMETRIC_ENABLED_KEY = "mandal_biometric_enabled";

const MAX_FAILED_ATTEMPTS = 5;

export default function LoginScreen({
                                        onLoginSuccess,
                                    }: Props) {
    const [pin, setPin] = useState("");
    const [isLocked, setIsLocked] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [checkingBiometric, setCheckingBiometric] = useState(true);

    const biometricAttemptedRef = useRef(false);
    const isAuthenticatingRef = useRef(false);

    const formatRemainingTime = () => {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;

        return `${String(minutes).padStart(2, "0")}:${String(
            seconds
        ).padStart(2, "0")}`;
    };

    const resetSecurityState = async () => {
        const defaultSecurity: LoginSecurity = {
            failedAttempts: 0,
            lockUntil: null,
        };

        await AsyncStorage.setItem(
            LOGIN_SECURITY_KEY,
            JSON.stringify(defaultSecurity)
        );
    };

    const getSecurityState = async (): Promise<LoginSecurity> => {
        const storedSecurity = await AsyncStorage.getItem(
            LOGIN_SECURITY_KEY
        );

        if (!storedSecurity) {
            return {
                failedAttempts: 0,
                lockUntil: null,
            };
        }

        try {
            return JSON.parse(storedSecurity);
        } catch {
            return {
                failedAttempts: 0,
                lockUntil: null,
            };
        }
    };

    const checkLockState = async (): Promise<boolean> => {
        const security = await getSecurityState();

        if (
            security.lockUntil &&
            security.lockUntil > Date.now()
        ) {
            const seconds = Math.ceil(
                (security.lockUntil - Date.now()) / 1000
            );

            setIsLocked(true);
            setRemainingSeconds(seconds);

            return true;
        }

        if (security.lockUntil) {
            await resetSecurityState();
        }

        setIsLocked(false);
        setRemainingSeconds(0);

        return false;
    };

    /**
     * Check whether this device supports biometric authentication.
     */
    const isBiometricAvailable = async (): Promise<boolean> => {
        try {
            const hasHardware =
                await LocalAuthentication.hasHardwareAsync();

            if (!hasHardware) {
                return false;
            }

            const isEnrolled =
                await LocalAuthentication.isEnrolledAsync();

            return isEnrolled;
        } catch (error) {
            console.error(
                "Biometric availability check failed:",
                error
            );

            return false;
        }
    };

    /**
     * Automatically enable biometric authentication for existing
     * installations if the device supports it and biometrics are enrolled.
     *
     * This fixes installations created before biometric support was added,
     * where mandal_biometric_enabled does not exist yet.
     */
    const ensureBiometricEnabled = async (): Promise<boolean> => {
        try {
            const available = await isBiometricAvailable();

            if (!available) {
                return false;
            }

            const existingSetting = await AsyncStorage.getItem(
                BIOMETRIC_ENABLED_KEY
            );

            if (existingSetting !== "true") {
                await AsyncStorage.setItem(
                    BIOMETRIC_ENABLED_KEY,
                    "true"
                );
            }

            return true;
        } catch (error) {
            console.error(
                "Unable to enable biometric authentication:",
                error
            );

            return false;
        }
    };

    const authenticateWithBiometric =
        async (): Promise<boolean> => {
            if (isAuthenticatingRef.current) {
                return false;
            }

            try {
                isAuthenticatingRef.current = true;

                // Never allow biometric authentication to bypass
                // the 5-attempt PIN lockout.
                const locked = await checkLockState();

                if (locked) {
                    return false;
                }

                /*
                 * IMPORTANT:
                 * Automatically enable biometric if the device
                 * supports it and the user has enrolled biometrics.
                 *
                 * This handles existing installations where the
                 * biometric setting does not exist yet.
                 */
                const biometricAvailable =
                    await ensureBiometricEnabled();

                if (!biometricAvailable) {
                    return false;
                }

                // Give the Login screen time to mount before showing
                // the native Android/iOS biometric dialog.
                await new Promise((resolve) =>
                    setTimeout(resolve, 350)
                );

                const result =
                    await LocalAuthentication.authenticateAsync({
                        promptMessage: "Unlock My Mandal",
                        cancelLabel: "Use PIN",
                        disableDeviceFallback: true,
                    });

                if (result.success) {
                    await resetSecurityState();

                    setPin("");
                    setIsLocked(false);
                    setRemainingSeconds(0);

                    onLoginSuccess();

                    return true;
                }

                return false;
            } catch (error) {
                console.error(
                    "Biometric authentication error:",
                    error
                );

                return false;
            } finally {
                isAuthenticatingRef.current = false;
            }
        };

    const tryAutomaticBiometric = async () => {
        if (biometricAttemptedRef.current) {
            return;
        }

        biometricAttemptedRef.current = true;

        const locked = await checkLockState();

        if (locked) {
            setCheckingBiometric(false);
            return;
        }

        await authenticateWithBiometric();

        setCheckingBiometric(false);
    };

    /**
     * Initial login screen setup.
     */
    useEffect(() => {
        let mounted = true;

        const initializeLogin = async () => {
            try {
                const locked = await checkLockState();

                if (!mounted) {
                    return;
                }

                if (locked) {
                    setCheckingBiometric(false);
                    return;
                }

                await tryAutomaticBiometric();
            } catch (error) {
                console.error(
                    "Login initialization error:",
                    error
                );

                if (mounted) {
                    setCheckingBiometric(false);
                }
            }
        };

        initializeLogin();

        return () => {
            mounted = false;
        };
    }, []);

    /**
     * If the app comes back to the foreground while the Login
     * screen is still visible, allow biometric authentication
     * again.
     */
    useEffect(() => {
        const subscription = AppState.addEventListener(
            "change",
            async (nextState: AppStateStatus) => {
                if (nextState !== "active") {
                    return;
                }

                if (isLocked || isAuthenticatingRef.current) {
                    return;
                }

                /*
                 * Reset the attempt flag when returning from background.
                 * This allows biometric authentication again.
                 */
                biometricAttemptedRef.current = false;

                await tryAutomaticBiometric();
            }
        );

        return () => {
            subscription.remove();
        };
    }, [isLocked]);

    /**
     * 5-minute lock countdown.
     */
    useEffect(() => {
        if (!isLocked) {
            return;
        }

        const interval = setInterval(async () => {
            try {
                const security = await getSecurityState();

                if (
                    security.lockUntil &&
                    security.lockUntil > Date.now()
                ) {
                    const seconds = Math.ceil(
                        (security.lockUntil - Date.now()) / 1000
                    );

                    setRemainingSeconds(seconds);
                } else {
                    await resetSecurityState();

                    setIsLocked(false);
                    setRemainingSeconds(0);
                    setPin("");

                    // Allow biometric to be attempted again
                    // after the lock expires.
                    biometricAttemptedRef.current = false;
                }
            } catch (error) {
                console.error(
                    "Lock timer error:",
                    error
                );
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isLocked]);

    const handleLogin = async () => {
        if (isLocked) {
            Alert.alert(
                "App Locked",
                `Too many incorrect PIN attempts.\n\nPlease try again in ${formatRemainingTime()}.`
            );

            return;
        }

        if (pin.length !== 4) {
            Alert.alert(
                "Invalid PIN",
                "Please enter your 4-digit PIN."
            );

            return;
        }

        try {
            const locked = await checkLockState();

            if (locked) {
                setPin("");

                Alert.alert(
                    "App Locked",
                    `Please try again in ${formatRemainingTime()}.`
                );

                return;
            }

            const storedSetup = await AsyncStorage.getItem(
                "mandal_setup"
            );

            if (!storedSetup) {
                Alert.alert(
                    "Error",
                    "Setup data not found."
                );

                return;
            }

            const setupData = JSON.parse(storedSetup);

            const security = await getSecurityState();

            if (pin === setupData.pin) {
                await resetSecurityState();

                setPin("");
                setIsLocked(false);
                setRemainingSeconds(0);

                onLoginSuccess();

                return;
            }

            const failedAttempts =
                security.failedAttempts + 1;

            setPin("");

            if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                const lockUntil =
                    Date.now() + 5 * 60 * 1000;

                await AsyncStorage.setItem(
                    LOGIN_SECURITY_KEY,
                    JSON.stringify({
                        failedAttempts: MAX_FAILED_ATTEMPTS,
                        lockUntil,
                    })
                );

                setIsLocked(true);
                setRemainingSeconds(5 * 60);

                Alert.alert(
                    "App Locked",
                    "You entered the wrong PIN 5 times.\n\nThe app is locked for 5 minutes."
                );

                return;
            }

            await AsyncStorage.setItem(
                LOGIN_SECURITY_KEY,
                JSON.stringify({
                    failedAttempts,
                    lockUntil: null,
                })
            );

            const attemptsLeft =
                MAX_FAILED_ATTEMPTS - failedAttempts;

            Alert.alert(
                "Incorrect PIN",
                `Please enter the correct PIN.\n\n${attemptsLeft} attempt${
                    attemptsLeft === 1 ? "" : "s"
                } remaining.`
            );
        } catch (error) {
            console.error(
                "Login error:",
                error
            );

            Alert.alert(
                "Error",
                "Something went wrong while checking the PIN."
            );
        }
    };

    if (checkingBiometric) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator
                    size="large"
                    color="#2563EB"
                />

                <Text style={styles.loadingText}>
                    Checking unlock options...
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>
                My Mandal
            </Text>

            {isLocked ? (
                <>
                    <Text style={styles.lockTitle}>
                        App Locked
                    </Text>

                    <Text style={styles.lockMessage}>
                        Too many incorrect PIN attempts.
                    </Text>

                    <Text style={styles.timer}>
                        {formatRemainingTime()}
                    </Text>

                    <Text style={styles.lockHint}>
                        Please wait before trying again.
                    </Text>
                </>
            ) : (
                <>
                    <Text style={styles.subtitle}>
                        Enter your 4-digit PIN
                    </Text>

                    <TextInput
                        style={styles.pinInput}
                        value={pin}
                        onChangeText={setPin}
                        keyboardType="number-pad"
                        maxLength={4}
                        secureTextEntry
                        placeholder="••••"
                        textAlign="center"
                        editable={!isLocked}
                    />

                    <TouchableOpacity
                        style={[
                            styles.button,
                            isLocked &&
                            styles.buttonDisabled,
                        ]}
                        onPress={handleLogin}
                        disabled={isLocked}
                    >
                        <Text style={styles.buttonText}>
                            Unlock
                        </Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 24,
    },

    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
    },

    loadingText: {
        marginTop: 12,
        fontSize: 15,
        color: "#666",
    },

    title: {
        fontSize: 32,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 10,
    },

    subtitle: {
        fontSize: 16,
        textAlign: "center",
        marginBottom: 24,
    },

    pinInput: {
        alignSelf: "center",
        width: 180,
        height: 55,
        borderWidth: 1,
        borderColor: "#999",
        borderRadius: 10,
        fontSize: 24,
        marginBottom: 20,
    },

    button: {
        height: 50,
        borderRadius: 10,
        backgroundColor: "#2563EB",
        justifyContent: "center",
        alignItems: "center",
    },

    buttonDisabled: {
        opacity: 0.5,
    },

    buttonText: {
        color: "#FFFFFF",
        fontSize: 17,
        fontWeight: "600",
    },

    lockTitle: {
        fontSize: 24,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 10,
    },

    lockMessage: {
        fontSize: 16,
        textAlign: "center",
        color: "#666",
        marginBottom: 20,
    },

    timer: {
        fontSize: 42,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 12,
    },

    lockHint: {
        fontSize: 14,
        textAlign: "center",
        color: "#777",
    },
});