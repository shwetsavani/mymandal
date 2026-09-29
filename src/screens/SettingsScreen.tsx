import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";

import { auth } from "../services/firebase";
import {
    signInRecoveryAccount,
    sendRecoveryEmailVerification,
    refreshRecoveryVerificationStatus,
    requestRecoveryEmailChange,
} from "../services/firebaseAuth";

type Props = {
    onBack?: () => void;
};

type MandalSetup = {
    mandalName: string;
    adminName: string;
    mobile: string;
    email: string;
    pin: string;
    createdAt: string;
};

const LOGIN_SECURITY_KEY =
    "mandal_login_security";

const BIOMETRIC_ENABLED_KEY =
    "mandal_biometric_enabled";

const PENDING_RECOVERY_EMAIL_KEY =
    "mandal_pending_recovery_email";

export default function SettingsScreen({
                                           onBack,
                                       }: Props) {
    const [setupData, setSetupData] =
        useState<MandalSetup | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [changePinVisible, setChangePinVisible] =
        useState(false);

    const [currentPin, setCurrentPin] =
        useState("");

    const [newPin, setNewPin] =
        useState("");

    const [confirmPin, setConfirmPin] =
        useState("");

    const [savingPin, setSavingPin] =
        useState(false);

    const [biometricEnabled, setBiometricEnabled] =
        useState(false);

    const [biometricAvailable, setBiometricAvailable] =
        useState(false);

    const [biometricType, setBiometricType] =
        useState<string>("Biometric");

    const [biometricPinVisible, setBiometricPinVisible] =
        useState(false);

    const [biometricPin, setBiometricPin] =
        useState("");

    const [changingBiometric, setChangingBiometric] =
        useState(false);

    // Recovery email state
    const [recoveryModalVisible, setRecoveryModalVisible] =
        useState(false);

    const [recoveryPassword, setRecoveryPassword] =
        useState("");

    const [recoveryPin, setRecoveryPin] =
        useState("");

    const [newRecoveryEmail, setNewRecoveryEmail] =
        useState("");

    const [recoveryLoading, setRecoveryLoading] =
        useState(false);

    const [firebaseEmailVerified, setFirebaseEmailVerified] =
        useState(false);

    const [pendingRecoveryEmail, setPendingRecoveryEmail] =
        useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const storedSetup =
                await AsyncStorage.getItem(
                    "mandal_setup"
                );

            if (storedSetup) {
                setSetupData(
                    JSON.parse(storedSetup)
                );
            }

            await loadBiometricSettings();
            await loadRecoveryStatus();
        } catch (error) {
            console.error(
                "Load settings error:",
                error
            );

            Alert.alert(
                "Error",
                "Unable to load settings."
            );
        } finally {
            setLoading(false);
        }
    };

    const loadRecoveryStatus = async () => {
        try {
            const pending =
                await AsyncStorage.getItem(
                    PENDING_RECOVERY_EMAIL_KEY
                );

            setPendingRecoveryEmail(
                pending
            );

            const user = auth.currentUser;

            if (user) {
                await user.reload();

                const refreshedUser =
                    auth.currentUser;

                if (
                    refreshedUser &&
                    refreshedUser.email
                ) {
                    setFirebaseEmailVerified(
                        refreshedUser.emailVerified
                    );
                }
            }
        } catch (error) {
            console.error(
                "Recovery status error:",
                error
            );
        }
    };

    const loadBiometricSettings = async () => {
        try {
            const hasHardware =
                await LocalAuthentication.hasHardwareAsync();

            const isEnrolled =
                await LocalAuthentication.isEnrolledAsync();

            const available =
                hasHardware && isEnrolled;

            setBiometricAvailable(
                available
            );

            if (available) {
                const supportedTypes =
                    await LocalAuthentication.supportedAuthenticationTypesAsync();

                if (
                    supportedTypes.includes(
                        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
                    )
                ) {
                    setBiometricType(
                        "Face Unlock"
                    );
                } else if (
                    supportedTypes.includes(
                        LocalAuthentication.AuthenticationType.FINGERPRINT
                    )
                ) {
                    setBiometricType(
                        "Fingerprint"
                    );
                } else {
                    setBiometricType(
                        "Biometric"
                    );
                }
            }

            const storedSetting =
                await AsyncStorage.getItem(
                    BIOMETRIC_ENABLED_KEY
                );

            setBiometricEnabled(
                available &&
                storedSetting === "true"
            );
        } catch (error) {
            console.error(
                "Load biometric settings error:",
                error
            );

            setBiometricAvailable(false);
            setBiometricEnabled(false);
        }
    };

    // --------------------------------------------------
    // CHANGE PIN
    // --------------------------------------------------

    const resetChangePinForm = () => {
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
        setSavingPin(false);
    };

    const closeChangePin = () => {
        if (savingPin) {
            return;
        }

        resetChangePinForm();
        setChangePinVisible(false);
    };

    const handleChangePin = async () => {
        if (savingPin) {
            return;
        }

        if (!setupData) {
            Alert.alert(
                "Error",
                "Mandal setup information could not be found."
            );

            return;
        }

        if (currentPin.length !== 4) {
            Alert.alert(
                "Invalid PIN",
                "Please enter your current 4-digit PIN."
            );

            return;
        }

        if (newPin.length !== 4) {
            Alert.alert(
                "Invalid PIN",
                "Your new PIN must contain exactly 4 digits."
            );

            return;
        }

        if (confirmPin.length !== 4) {
            Alert.alert(
                "Invalid PIN",
                "Please confirm your new 4-digit PIN."
            );

            return;
        }

        if (currentPin !== setupData.pin) {
            Alert.alert(
                "Incorrect PIN",
                "The current PIN you entered is incorrect."
            );

            setCurrentPin("");
            return;
        }

        if (newPin !== confirmPin) {
            Alert.alert(
                "PIN Mismatch",
                "The new PIN and confirmation PIN do not match."
            );

            setConfirmPin("");
            return;
        }

        if (newPin === currentPin) {
            Alert.alert(
                "Same PIN",
                "Your new PIN must be different from your current PIN."
            );

            return;
        }

        try {
            setSavingPin(true);

            const updatedSetup: MandalSetup = {
                ...setupData,
                pin: newPin,
            };

            await AsyncStorage.setItem(
                "mandal_setup",
                JSON.stringify(updatedSetup)
            );

            await AsyncStorage.setItem(
                LOGIN_SECURITY_KEY,
                JSON.stringify({
                    failedAttempts: 0,
                    lockUntil: null,
                })
            );

            setSetupData(updatedSetup);

            resetChangePinForm();
            setChangePinVisible(false);

            Alert.alert(
                "PIN Changed",
                "Your 4-digit PIN has been changed successfully."
            );
        } catch (error) {
            console.error(
                "Change PIN error:",
                error
            );

            Alert.alert(
                "Error",
                "Unable to change your PIN. Please try again."
            );

            setSavingPin(false);
        }
    };

    // --------------------------------------------------
    // BIOMETRIC
    // --------------------------------------------------

    const enableBiometric = async () => {
        if (changingBiometric) {
            return;
        }

        try {
            setChangingBiometric(true);

            const hasHardware =
                await LocalAuthentication.hasHardwareAsync();

            const isEnrolled =
                await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled) {
                Alert.alert(
                    "Biometric Unavailable",
                    "Please set up fingerprint or face authentication in your device settings first."
                );

                return;
            }

            const result =
                await LocalAuthentication.authenticateAsync(
                    {
                        promptMessage:
                            "Enable Biometric Unlock",
                        cancelLabel:
                            "Cancel",
                        disableDeviceFallback:
                            true,
                    }
                );

            if (!result.success) {
                return;
            }

            await AsyncStorage.setItem(
                BIOMETRIC_ENABLED_KEY,
                "true"
            );

            setBiometricEnabled(true);

            Alert.alert(
                "Biometric Enabled",
                `${biometricType} unlock is now enabled for My Mandal.`
            );
        } catch (error) {
            console.error(
                "Enable biometric error:",
                error
            );

            Alert.alert(
                "Error",
                "Unable to enable biometric unlock."
            );
        } finally {
            setChangingBiometric(false);
        }
    };

    const closeBiometricPin = () => {
        if (changingBiometric) {
            return;
        }

        setBiometricPin("");
        setBiometricPinVisible(false);
    };

    const disableBiometric = async () => {
        if (changingBiometric) {
            return;
        }

        if (!setupData) {
            Alert.alert(
                "Error",
                "Mandal setup information could not be found."
            );

            return;
        }

        if (biometricPin.length !== 4) {
            Alert.alert(
                "Invalid PIN",
                "Please enter your current 4-digit PIN."
            );

            return;
        }

        if (biometricPin !== setupData.pin) {
            Alert.alert(
                "Incorrect PIN",
                "The current PIN you entered is incorrect."
            );

            setBiometricPin("");
            return;
        }

        try {
            setChangingBiometric(true);

            await AsyncStorage.setItem(
                BIOMETRIC_ENABLED_KEY,
                "false"
            );

            setBiometricEnabled(false);

            setBiometricPin("");
            setBiometricPinVisible(false);

            Alert.alert(
                "Biometric Disabled",
                "Biometric unlock has been disabled. You can still unlock My Mandal using your PIN."
            );
        } catch (error) {
            console.error(
                "Disable biometric error:",
                error
            );

            Alert.alert(
                "Error",
                "Unable to disable biometric unlock."
            );
        } finally {
            setChangingBiometric(false);
        }
    };

    const handleBiometricToggle = async (
        value: boolean
    ) => {
        if (!biometricAvailable) {
            Alert.alert(
                "Biometric Unavailable",
                "Please set up fingerprint or face authentication in your device settings first."
            );

            return;
        }

        if (value) {
            await enableBiometric();
        } else {
            setBiometricPin("");
            setBiometricPinVisible(true);
        }
    };

    // --------------------------------------------------
    // RECOVERY EMAIL
    // --------------------------------------------------

    const openRecoveryEmail = async () => {
        if (!setupData) {
            Alert.alert(
                "Error",
                "Mandal setup information could not be found."
            );

            return;
        }

        await loadRecoveryStatus();

        setRecoveryPassword("");
        setRecoveryPin("");
        setNewRecoveryEmail("");

        setRecoveryModalVisible(true);
    };

    const closeRecoveryModal = () => {
        if (recoveryLoading) {
            return;
        }

        setRecoveryPassword("");
        setRecoveryPin("");
        setNewRecoveryEmail("");

        setRecoveryModalVisible(false);
    };

    const connectRecoveryAccount = async () => {
        if (!setupData) {
            return;
        }

        if (!recoveryPassword.trim()) {
            Alert.alert(
                "Password Required",
                "Enter the Firebase password for your recovery email."
            );

            return;
        }

        try {
            setRecoveryLoading(true);

            const user =
                await signInRecoveryAccount(
                    setupData.email,
                    recoveryPassword
                );

            if (
                !user.email ||
                user.email.toLowerCase() !==
                setupData.email.toLowerCase()
            ) {
                Alert.alert(
                    "Account Mismatch",
                    "The Firebase account email does not match your My Mandal recovery email."
                );

                return;
            }

            await user.reload();

            const refreshedUser =
                auth.currentUser;

            if (!refreshedUser) {
                throw new Error(
                    "Firebase user could not be loaded."
                );
            }

            setFirebaseEmailVerified(
                refreshedUser.emailVerified
            );

            if (!refreshedUser.emailVerified) {
                await sendRecoveryEmailVerification();

                Alert.alert(
                    "Verification Email Sent",
                    `A verification email has been sent to ${setupData.email}. Open that email and verify your address, then return here and tap "Check Verification".`
                );
            } else {
                Alert.alert(
                    "Recovery Email Connected",
                    "Your recovery email is already verified and connected."
                );
            }
        } catch (error: any) {
            console.error(
                "Connect recovery account error:",
                error
            );

            Alert.alert(
                "Unable to Connect",
                getFirebaseErrorMessage(error)
            );
        } finally {
            setRecoveryLoading(false);
        }
    };

    const checkRecoveryVerification =
        async () => {
            if (recoveryLoading) {
                return;
            }

            try {
                setRecoveryLoading(true);

                const verified =
                    await refreshRecoveryVerificationStatus();

                setFirebaseEmailVerified(
                    verified
                );

                if (!verified) {
                    Alert.alert(
                        "Not Verified Yet",
                        "The recovery email has not been verified yet. Open the verification email and complete the verification first."
                    );

                    return;
                }

                Alert.alert(
                    "Email Verified",
                    "Your recovery email has been successfully verified."
                );
            } catch (error: any) {
                console.error(
                    "Check verification error:",
                    error
                );

                Alert.alert(
                    "Verification Check Failed",
                    getFirebaseErrorMessage(error)
                );
            } finally {
                setRecoveryLoading(false);
            }
        };

    const requestEmailChange =
        async () => {
            if (!setupData) {
                return;
            }

            const trimmedEmail =
                newRecoveryEmail
                    .trim()
                    .toLowerCase();

            if (recoveryPin.length !== 4) {
                Alert.alert(
                    "Invalid PIN",
                    "Enter your current 4-digit PIN."
                );

                return;
            }

            if (
                recoveryPin !==
                setupData.pin
            ) {
                Alert.alert(
                    "Incorrect PIN",
                    "The current PIN you entered is incorrect."
                );

                setRecoveryPin("");
                return;
            }

            if (!isValidEmail(trimmedEmail)) {
                Alert.alert(
                    "Invalid Email",
                    "Please enter a valid email address."
                );

                return;
            }

            if (
                trimmedEmail ===
                setupData.email.toLowerCase()
            ) {
                Alert.alert(
                    "Same Email",
                    "The new email is the same as your current recovery email."
                );

                return;
            }

            const user = auth.currentUser;

            if (!user) {
                Alert.alert(
                    "Recovery Account Not Connected",
                    "Please connect your current recovery email first."
                );

                return;
            }

            try {
                setRecoveryLoading(true);

                await requestRecoveryEmailChange(
                    trimmedEmail
                );

                await AsyncStorage.setItem(
                    PENDING_RECOVERY_EMAIL_KEY,
                    trimmedEmail
                );

                setPendingRecoveryEmail(
                    trimmedEmail
                );

                Alert.alert(
                    "Verification Email Sent",
                    `A verification email has been sent to ${trimmedEmail}. Your recovery email will change only after you verify the new address.`
                );
            } catch (error: any) {
                console.error(
                    "Request recovery email change error:",
                    error
                );

                Alert.alert(
                    "Unable to Change Email",
                    getFirebaseErrorMessage(error)
                );
            } finally {
                setRecoveryLoading(false);
            }
        };

    const completeRecoveryEmailChange =
        async () => {
            if (recoveryLoading) {
                return;
            }

            if (!setupData) {
                return;
            }

            if (!pendingRecoveryEmail) {
                Alert.alert(
                    "No Pending Change",
                    "There is no recovery email change waiting for verification."
                );

                return;
            }

            try {
                setRecoveryLoading(true);

                const user = auth.currentUser;

                if (!user) {
                    Alert.alert(
                        "Recovery Account Not Connected",
                        "Please connect your current recovery email first."
                    );

                    return;
                }

                await user.reload();

                const refreshedUser =
                    auth.currentUser;

                if (!refreshedUser) {
                    throw new Error(
                        "Firebase user could not be loaded."
                    );
                }

                const firebaseEmail =
                    refreshedUser.email
                        ?.trim()
                        .toLowerCase();

                if (
                    firebaseEmail !==
                    pendingRecoveryEmail
                ) {
                    Alert.alert(
                        "Not Verified Yet",
                        "The new email has not been verified yet. Please open the verification email and complete it first."
                    );

                    return;
                }

                if (
                    !refreshedUser.emailVerified
                ) {
                    Alert.alert(
                        "Email Not Verified",
                        "Firebase has not marked the new email as verified yet."
                    );

                    return;
                }

                const updatedSetup:
                    MandalSetup = {
                    ...setupData,
                    email:
                    pendingRecoveryEmail,
                };

                await AsyncStorage.setItem(
                    "mandal_setup",
                    JSON.stringify(
                        updatedSetup
                    )
                );

                await AsyncStorage.removeItem(
                    PENDING_RECOVERY_EMAIL_KEY
                );

                setSetupData(
                    updatedSetup
                );

                setPendingRecoveryEmail(
                    null
                );

                setNewRecoveryEmail("");

                Alert.alert(
                    "Recovery Email Updated",
                    "Your new recovery email has been verified and saved successfully."
                );
            } catch (error: any) {
                console.error(
                    "Complete recovery email change error:",
                    error
                );

                Alert.alert(
                    "Unable to Update Email",
                    getFirebaseErrorMessage(error)
                );
            } finally {
                setRecoveryLoading(false);
            }
        };

    // --------------------------------------------------
    // RENDER
    // --------------------------------------------------

    if (loading) {
        return (
            <SafeAreaView
                style={styles.container}
                edges={[
                    "top",
                    "left",
                    "right",
                ]}
            >
                <View
                    style={
                        styles.loadingContainer
                    }
                >
                    <ActivityIndicator
                        size="large"
                        color="#2563EB"
                    />

                    <Text
                        style={
                            styles.loadingText
                        }
                    >
                        Loading settings...
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const recoverySubtitle =
        pendingRecoveryEmail
            ? `Verification pending: ${pendingRecoveryEmail}`
            : auth.currentUser
                ? firebaseEmailVerified
                    ? "Verified recovery email"
                    : "Email verification required"
                : "Manage your recovery email";

    return (
        <SafeAreaView
            style={styles.container}
            edges={[
                "top",
                "left",
                "right",
            ]}
        >
            <ScrollView
                contentContainerStyle={
                    styles.content
                }
                showsVerticalScrollIndicator={
                    false
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    {onBack && (
                        <TouchableOpacity
                            style={
                                styles.backButton
                            }
                            onPress={onBack}
                            activeOpacity={0.7}
                        >
                            <Text
                                style={
                                    styles.backText
                                }
                            >
                                ‹
                            </Text>
                        </TouchableOpacity>
                    )}

                    <View>
                        <Text
                            style={styles.title}
                        >
                            Settings
                        </Text>

                        <Text
                            style={
                                styles.subtitle
                            }
                        >
                            Manage your Mandal
                            preferences
                        </Text>
                    </View>
                </View>

                {/* Mandal Information */}
                <SettingsSection
                    title="Mandal Information"
                >
                    <InformationRow
                        title="Mandal Name"
                        value={
                            setupData?.mandalName ||
                            "Not available"
                        }
                    />

                    <InformationRow
                        title="Admin Name"
                        value={
                            setupData?.adminName ||
                            "Not available"
                        }
                    />

                    <InformationRow
                        title="Admin Mobile"
                        value={
                            setupData?.mobile ||
                            "Not available"
                        }
                    />

                    <InformationRow
                        title="Recovery Email"
                        value={
                            setupData?.email ||
                            "Not available"
                        }
                    />
                </SettingsSection>

                {/* Security */}
                <SettingsSection title="Security">
                    <SettingsRow
                        title="Change PIN"
                        subtitle="Change your 4-digit security PIN"
                        onPress={() =>
                            setChangePinVisible(
                                true
                            )
                        }
                    />

                    <SettingsRow
                        title="Biometric Unlock"
                        subtitle={
                            biometricAvailable
                                ? biometricEnabled
                                    ? `${biometricType} is enabled`
                                    : `${biometricType} is available`
                                : "No enrolled biometric found"
                        }
                        rightComponent={
                            <Switch
                                value={
                                    biometricEnabled
                                }
                                onValueChange={
                                    handleBiometricToggle
                                }
                                disabled={
                                    !biometricAvailable ||
                                    changingBiometric
                                }
                                trackColor={{
                                    false: "#D1D5DB",
                                    true: "#93C5FD",
                                }}
                                thumbColor={
                                    biometricEnabled
                                        ? "#2563EB"
                                        : "#F9FAFB"
                                }
                            />
                        }
                    />

                    <SettingsRow
                        title="Recovery Email"
                        subtitle={
                            recoverySubtitle
                        }
                        onPress={
                            openRecoveryEmail
                        }
                    />
                </SettingsSection>

                {/* Language */}
                <SettingsSection title="Language">
                    <SettingsRow
                        title="App Language"
                        subtitle="English / Gujarati"
                    />
                </SettingsSection>

                {/* Notifications */}
                <SettingsSection
                    title="Notifications"
                >
                    <SettingsRow
                        title="Reminder Settings"
                        subtitle="Manage monthly and overdue reminders"
                    />
                </SettingsSection>

                {/* Data */}
                <SettingsSection title="Data">
                    <SettingsRow
                        title="Export Data"
                        subtitle="Export your Mandal records"
                    />

                    <SettingsRow
                        title="Restore Data"
                        subtitle="Restore your Mandal data from cloud backup"
                    />
                </SettingsSection>

                {/* About */}
                <SettingsSection title="About">
                    <SettingsRow
                        title="About My Mandal"
                        subtitle="App information and version"
                    />
                </SettingsSection>

                <Text style={styles.version}>
                    My Mandal
                </Text>

                <Text
                    style={
                        styles.versionNumber
                    }
                >
                    Version 1.0.0
                </Text>
            </ScrollView>

            {/* Change PIN Modal */}
            <Modal
                visible={changePinVisible}
                transparent
                animationType="slide"
                onRequestClose={
                    closeChangePin
                }
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={
                        Platform.OS === "ios"
                            ? "padding"
                            : undefined
                    }
                >
                    <View
                        style={
                            styles.modalCard
                        }
                    >
                        <View
                            style={
                                styles.modalHeader
                            }
                        >
                            <View>
                                <Text
                                    style={
                                        styles.modalTitle
                                    }
                                >
                                    Change PIN
                                </Text>

                                <Text
                                    style={
                                        styles.modalSubtitle
                                    }
                                >
                                    Update your 4-digit security PIN
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={
                                    styles.closeButton
                                }
                                onPress={
                                    closeChangePin
                                }
                                disabled={
                                    savingPin
                                }
                            >
                                <Text
                                    style={
                                        styles.closeButtonText
                                    }
                                >
                                    ×
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <PinInput
                            label="Current PIN"
                            value={currentPin}
                            onChangeText={
                                setCurrentPin
                            }
                            editable={!savingPin}
                        />

                        <PinInput
                            label="New PIN"
                            value={newPin}
                            onChangeText={
                                setNewPin
                            }
                            editable={!savingPin}
                        />

                        <PinInput
                            label="Confirm New PIN"
                            value={confirmPin}
                            onChangeText={
                                setConfirmPin
                            }
                            editable={!savingPin}
                        />

                        <TouchableOpacity
                            style={[
                                styles.saveButton,
                                savingPin &&
                                styles.buttonDisabled,
                            ]}
                            onPress={
                                handleChangePin
                            }
                            disabled={
                                savingPin
                            }
                            activeOpacity={0.8}
                        >
                            {savingPin ? (
                                <ActivityIndicator
                                    color="#FFFFFF"
                                />
                            ) : (
                                <Text
                                    style={
                                        styles.saveButtonText
                                    }
                                >
                                    Change PIN
                                </Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={
                                styles.cancelButton
                            }
                            onPress={
                                closeChangePin
                            }
                            disabled={
                                savingPin
                            }
                        >
                            <Text
                                style={
                                    styles.cancelButtonText
                                }
                            >
                                Cancel
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Disable Biometric PIN Modal */}
            <Modal
                visible={
                    biometricPinVisible
                }
                transparent
                animationType="slide"
                onRequestClose={
                    closeBiometricPin
                }
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={
                        Platform.OS === "ios"
                            ? "padding"
                            : undefined
                    }
                >
                    <View
                        style={
                            styles.smallModalCard
                        }
                    >
                        <Text
                            style={
                                styles.modalTitle
                            }
                        >
                            Disable Biometric
                        </Text>

                        <Text
                            style={
                                styles.modalSubtitle
                            }
                        >
                            Enter your current PIN to disable biometric unlock.
                        </Text>

                        <Text
                            style={
                                styles.inputLabel
                            }
                        >
                            Current PIN
                        </Text>

                        <TextInput
                            style={
                                styles.pinInput
                            }
                            value={
                                biometricPin
                            }
                            onChangeText={
                                setBiometricPin
                            }
                            keyboardType="number-pad"
                            maxLength={4}
                            secureTextEntry
                            placeholder="••••"
                            textAlign="center"
                            editable={
                                !changingBiometric
                            }
                        />

                        <TouchableOpacity
                            style={[
                                styles.saveButton,
                                changingBiometric &&
                                styles.buttonDisabled,
                            ]}
                            onPress={
                                disableBiometric
                            }
                            disabled={
                                changingBiometric
                            }
                        >
                            {changingBiometric ? (
                                <ActivityIndicator
                                    color="#FFFFFF"
                                />
                            ) : (
                                <Text
                                    style={
                                        styles.saveButtonText
                                    }
                                >
                                    Disable Biometric
                                </Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={
                                styles.cancelButton
                            }
                            onPress={
                                closeBiometricPin
                            }
                            disabled={
                                changingBiometric
                            }
                        >
                            <Text
                                style={
                                    styles.cancelButtonText
                                }
                            >
                                Cancel
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Recovery Email Modal */}
            <Modal
                visible={
                    recoveryModalVisible
                }
                transparent
                animationType="slide"
                onRequestClose={
                    closeRecoveryModal
                }
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={
                        Platform.OS === "ios"
                            ? "padding"
                            : undefined
                    }
                >
                    <View
                        style={
                            styles.modalCard
                        }
                    >
                        <View
                            style={
                                styles.modalHeader
                            }
                        >
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={
                                        styles.modalTitle
                                    }
                                >
                                    Recovery Email
                                </Text>

                                <Text
                                    style={
                                        styles.modalSubtitle
                                    }
                                >
                                    Manage your verified recovery email.
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={
                                    styles.closeButton
                                }
                                onPress={
                                    closeRecoveryModal
                                }
                                disabled={
                                    recoveryLoading
                                }
                            >
                                <Text
                                    style={
                                        styles.closeButtonText
                                    }
                                >
                                    ×
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View
                            style={
                                styles.currentEmailBox
                            }
                        >
                            <Text
                                style={
                                    styles.currentEmailLabel
                                }
                            >
                                Current Recovery Email
                            </Text>

                            <Text
                                style={
                                    styles.currentEmailValue
                                }
                            >
                                {setupData?.email ||
                                    "Not available"}
                            </Text>

                            <Text
                                style={[
                                    styles.verificationStatus,
                                    firebaseEmailVerified
                                        ? styles.verifiedText
                                        : styles.unverifiedText,
                                ]}
                            >
                                {firebaseEmailVerified
                                    ? "✓ Verified"
                                    : "⚠ Verification required"}
                            </Text>
                        </View>

                        {!auth.currentUser ? (
                            <>
                                <Text
                                    style={
                                        styles.inputLabel
                                    }
                                >
                                    Firebase Password
                                </Text>

                                <TextInput
                                    style={
                                        styles.textInput
                                    }
                                    value={
                                        recoveryPassword
                                    }
                                    onChangeText={
                                        setRecoveryPassword
                                    }
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    placeholder="Enter Firebase password"
                                    editable={
                                        !recoveryLoading
                                    }
                                />

                                <Text
                                    style={
                                        styles.helperText
                                    }
                                >
                                    This is the Firebase account password, not your 4-digit My Mandal PIN.
                                </Text>

                                <TouchableOpacity
                                    style={[
                                        styles.saveButton,
                                        recoveryLoading &&
                                        styles.buttonDisabled,
                                    ]}
                                    onPress={
                                        connectRecoveryAccount
                                    }
                                    disabled={
                                        recoveryLoading
                                    }
                                >
                                    {recoveryLoading ? (
                                        <ActivityIndicator
                                            color="#FFFFFF"
                                        />
                                    ) : (
                                        <Text
                                            style={
                                                styles.saveButtonText
                                            }
                                        >
                                            Connect & Verify Email
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                {!firebaseEmailVerified && (
                                    <TouchableOpacity
                                        style={
                                            styles.secondaryButton
                                        }
                                        onPress={
                                            checkRecoveryVerification
                                        }
                                        disabled={
                                            recoveryLoading
                                        }
                                    >
                                        {recoveryLoading ? (
                                            <ActivityIndicator
                                                color="#2563EB"
                                            />
                                        ) : (
                                            <Text
                                                style={
                                                    styles.secondaryButtonText
                                                }
                                            >
                                                Check Verification
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                )}

                                {firebaseEmailVerified && (
                                    <>
                                        <Text
                                            style={
                                                styles.inputLabel
                                            }
                                        >
                                            Current PIN
                                        </Text>

                                        <TextInput
                                            style={
                                                styles.pinInput
                                            }
                                            value={
                                                recoveryPin
                                            }
                                            onChangeText={
                                                setRecoveryPin
                                            }
                                            keyboardType="number-pad"
                                            maxLength={4}
                                            secureTextEntry
                                            placeholder="••••"
                                            textAlign="center"
                                            editable={
                                                !recoveryLoading
                                            }
                                        />

                                        <Text
                                            style={
                                                styles.inputLabel
                                            }
                                        >
                                            New Recovery Email
                                        </Text>

                                        <TextInput
                                            style={
                                                styles.textInput
                                            }
                                            value={
                                                newRecoveryEmail
                                            }
                                            onChangeText={
                                                setNewRecoveryEmail
                                            }
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            placeholder="Enter new email address"
                                            editable={
                                                !recoveryLoading
                                            }
                                        />

                                        <TouchableOpacity
                                            style={[
                                                styles.saveButton,
                                                recoveryLoading &&
                                                styles.buttonDisabled,
                                            ]}
                                            onPress={
                                                requestEmailChange
                                            }
                                            disabled={
                                                recoveryLoading
                                            }
                                        >
                                            {recoveryLoading ? (
                                                <ActivityIndicator
                                                    color="#FFFFFF"
                                                />
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.saveButtonText
                                                    }
                                                >
                                                    Send Verification
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </>
                                )}

                                {pendingRecoveryEmail && (
                                    <View
                                        style={
                                            styles.pendingBox
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.pendingTitle
                                            }
                                        >
                                            Verification Pending
                                        </Text>

                                        <Text
                                            style={
                                                styles.pendingText
                                            }
                                        >
                                            Verify this address:
                                        </Text>

                                        <Text
                                            style={
                                                styles.pendingEmail
                                            }
                                        >
                                            {pendingRecoveryEmail}
                                        </Text>

                                        <TouchableOpacity
                                            style={
                                                styles.secondaryButton
                                            }
                                            onPress={
                                                completeRecoveryEmailChange
                                            }
                                            disabled={
                                                recoveryLoading
                                            }
                                        >
                                            {recoveryLoading ? (
                                                <ActivityIndicator
                                                    color="#2563EB"
                                                />
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.secondaryButtonText
                                                    }
                                                >
                                                    Check & Save New Email
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </>
                        )}

                        <TouchableOpacity
                            style={
                                styles.cancelButton
                            }
                            onPress={
                                closeRecoveryModal
                            }
                            disabled={
                                recoveryLoading
                            }
                        >
                            <Text
                                style={
                                    styles.cancelButtonText
                                }
                            >
                                Close
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function isValidEmail(
    email: string
) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
    );
}

function getFirebaseErrorMessage(
    error: any
) {
    const code =
        error?.code || "";

    switch (code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/invalid-login-credentials":
            return "The Firebase password is incorrect.";

        case "auth/user-not-found":
            return "No Firebase account was found for this recovery email.";

        case "auth/invalid-email":
            return "The email address is invalid.";

        case "auth/email-already-in-use":
            return "That email address is already being used by another Firebase account.";

        case "auth/requires-recent-login":
            return "For security, please reconnect your recovery account and try again.";

        case "auth/too-many-requests":
            return "Too many attempts were made. Please wait a while and try again.";

        case "auth/network-request-failed":
            return "A network error occurred. Please check your internet connection.";

        default:
            return (
                error?.message ||
                "Something went wrong. Please try again."
            );
    }
}

// --------------------------------------------------
// COMPONENTS
// --------------------------------------------------

type PinInputProps = {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    editable: boolean;
};

function PinInput({
                      label,
                      value,
                      onChangeText,
                      editable,
                  }: PinInputProps) {
    return (
        <>
            <Text style={styles.inputLabel}>
                {label}
            </Text>

            <TextInput
                style={styles.pinInput}
                value={value}
                onChangeText={onChangeText}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                textAlign="center"
                editable={editable}
            />
        </>
    );
}

type SettingsSectionProps = {
    title: string;
    children: React.ReactNode;
};

function SettingsSection({
                             title,
                             children,
                         }: SettingsSectionProps) {
    return (
        <View style={styles.section}>
            <Text
                style={styles.sectionTitle}
            >
                {title}
            </Text>

            <View style={styles.card}>
                {children}
            </View>
        </View>
    );
}

type InformationRowProps = {
    title: string;
    value: string;
};

function InformationRow({
                            title,
                            value,
                        }: InformationRowProps) {
    return (
        <View
            style={
                styles.informationRow
            }
        >
            <Text
                style={
                    styles.informationTitle
                }
            >
                {title}
            </Text>

            <Text
                style={
                    styles.informationValue
                }
            >
                {value}
            </Text>
        </View>
    );
}

type SettingsRowProps = {
    title: string;
    subtitle: string;
    onPress?: () => void;
    rightComponent?: React.ReactNode;
};

function SettingsRow({
                         title,
                         subtitle,
                         onPress,
                         rightComponent,
                     }: SettingsRowProps) {
    return (
        <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={onPress}
            disabled={!onPress}
        >
            <View
                style={styles.rowContent}
            >
                <Text
                    style={styles.rowTitle}
                >
                    {title}
                </Text>

                <Text
                    style={
                        styles.rowSubtitle
                    }
                >
                    {subtitle}
                </Text>
            </View>

            {rightComponent || (
                <Text
                    style={styles.chevron}
                >
                    ›
                </Text>
            )}
        </TouchableOpacity>
    );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F7F8FA",
    },

    content: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40,
    },

    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },

    loadingText: {
        marginTop: 12,
        fontSize: 15,
        color: "#666",
    },

    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 28,
    },

    backButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#FFFFFF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 5,
        shadowOffset: {
            width: 0,
            height: 2,
        },
    },

    backText: {
        fontSize: 34,
        lineHeight: 36,
        color: "#1A2639",
        marginTop: -3,
    },

    title: {
        fontSize: 28,
        fontWeight: "700",
        color: "#1A2639",
    },

    subtitle: {
        fontSize: 14,
        color: "#6B7280",
        marginTop: 4,
    },

    section: {
        marginBottom: 22,
    },

    sectionTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: "#6B7280",
        marginBottom: 8,
        marginLeft: 4,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },

    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        overflow: "hidden",
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: {
            width: 0,
            height: 2,
        },
    },

    informationRow: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth:
        StyleSheet.hairlineWidth,
        borderBottomColor: "#E5E7EB",
    },

    informationTitle: {
        fontSize: 13,
        color: "#6B7280",
        marginBottom: 5,
    },

    informationValue: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1A2639",
    },

    row: {
        minHeight: 72,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth:
        StyleSheet.hairlineWidth,
        borderBottomColor: "#E5E7EB",
    },

    rowContent: {
        flex: 1,
    },

    rowTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1A2639",
    },

    rowSubtitle: {
        fontSize: 13,
        color: "#6B7280",
        marginTop: 4,
        lineHeight: 18,
    },

    chevron: {
        fontSize: 28,
        color: "#9CA3AF",
        marginLeft: 10,
    },

    version: {
        textAlign: "center",
        fontSize: 14,
        fontWeight: "600",
        color: "#6B7280",
        marginTop: 12,
    },

    versionNumber: {
        textAlign: "center",
        fontSize: 12,
        color: "#9CA3AF",
        marginTop: 4,
    },

    modalOverlay: {
        flex: 1,
        backgroundColor:
            "rgba(0, 0, 0, 0.45)",
        justifyContent: "flex-end",
    },

    modalCard: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 22,
        paddingTop: 22,
        paddingBottom: 30,
        maxHeight: "92%",
    },

    smallModalCard: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 22,
        paddingTop: 24,
        paddingBottom: 30,
    },

    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 22,
    },

    modalTitle: {
        fontSize: 24,
        fontWeight: "700",
        color: "#1A2639",
    },

    modalSubtitle: {
        fontSize: 13,
        color: "#6B7280",
        marginTop: 5,
        lineHeight: 19,
    },

    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#F3F4F6",
        justifyContent: "center",
        alignItems: "center",
        marginLeft: 12,
    },

    closeButtonText: {
        fontSize: 26,
        color: "#6B7280",
        lineHeight: 30,
    },

    inputLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 7,
        marginTop: 10,
    },

    pinInput: {
        height: 52,
        borderWidth: 1,
        borderColor: "#D1D5DB",
        borderRadius: 12,
        fontSize: 22,
        backgroundColor: "#F9FAFB",
        letterSpacing: 8,
        color: "#111827",
    },

    textInput: {
        height: 52,
        borderWidth: 1,
        borderColor: "#D1D5DB",
        borderRadius: 12,
        paddingHorizontal: 14,
        fontSize: 16,
        backgroundColor: "#F9FAFB",
        color: "#111827",
    },

    helperText: {
        fontSize: 12,
        lineHeight: 18,
        color: "#6B7280",
        marginTop: 7,
    },

    currentEmailBox: {
        backgroundColor: "#F3F6FA",
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
    },

    currentEmailLabel: {
        fontSize: 12,
        color: "#6B7280",
        marginBottom: 5,
    },

    currentEmailValue: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1A2639",
    },

    verificationStatus: {
        fontSize: 13,
        fontWeight: "600",
        marginTop: 7,
    },

    verifiedText: {
        color: "#15803D",
    },

    unverifiedText: {
        color: "#B45309",
    },

    pendingBox: {
        backgroundColor: "#FFF7ED",
        borderRadius: 14,
        padding: 14,
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#FED7AA",
    },

    pendingTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: "#9A3412",
    },

    pendingText: {
        fontSize: 13,
        color: "#7C2D12",
        marginTop: 5,
    },

    pendingEmail: {
        fontSize: 14,
        fontWeight: "700",
        color: "#7C2D12",
        marginTop: 3,
    },

    saveButton: {
        height: 52,
        borderRadius: 12,
        backgroundColor: "#2563EB",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 24,
    },

    secondaryButton: {
        minHeight: 50,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#2563EB",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 14,
        paddingHorizontal: 16,
    },

    secondaryButtonText: {
        color: "#2563EB",
        fontSize: 15,
        fontWeight: "700",
    },

    buttonDisabled: {
        opacity: 0.6,
    },

    saveButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "700",
    },

    cancelButton: {
        height: 48,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 6,
    },

    cancelButtonText: {
        color: "#6B7280",
        fontSize: 15,
        fontWeight: "600",
    },
});