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
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import { useLanguage } from "../localization/LanguageContext";

import { getCloudData } from "../services/cloudSync";

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

const REMINDER_SETTINGS_KEY = "mandal_reminder_settings";

type ReminderSettings = {
    monthlyEnabled: boolean;
    monthlyDay: number;
    monthlyHour: number;
    monthlyMinute: number;
    overdueEnabled: boolean;
    overdueHour: number;
    overdueMinute: number;
};

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
    monthlyEnabled: true,
    monthlyDay: 15,
    monthlyHour: 10,
    monthlyMinute: 0,
    overdueEnabled: false,
    overdueHour: 10,
    overdueMinute: 0,
};

export default function SettingsScreen({
                                           onBack,
                                       }: Props) {
    const { language: appLanguage, changeLanguage } = useLanguage();

    const ui = appLanguage === "Gujarati"
        ? {
            settings: "સેટિંગ્સ",
            managePreferences: "તમારા મંડળની પસંદગીઓ મેનેજ કરો",
            mandalInformation: "મંડળની માહિતી",
            mandalName: "મંડળનું નામ",
            adminName: "એડમિનનું નામ",
            adminMobile: "એડમિન મોબાઇલ",
            recoveryEmail: "રિકવરી ઈમેલ",
            security: "સુરક્ષા",
            changePin: "PIN બદલો",
            changePinSubtitle: "તમારો 4 અંકનો સુરક્ષા PIN બદલો",
            biometricUnlock: "બાયોમેટ્રિક અનલોક",
            language: "ભાષા",
            appLanguage: "એપની ભાષા",
            notifications: "નોટિફિકેશન્સ",
            reminderSettings: "રિમાઇન્ડર સેટિંગ્સ",
            remindersConfigured: "રિમાઇન્ડર્સ સેટ છે",
            remindersDisabled: "રિમાઇન્ડર્સ બંધ છે",
            data: "ડેટા",
            exportData: "ડેટા એક્સપોર્ટ કરો",
            exportSubtitle: "તમારા મંડળના રેકોર્ડ્સ એક્સપોર્ટ કરો",
            export: "એક્સપોર્ટ",
            restoreData: "ડેટા રિસ્ટોર કરો",
            restoreSubtitle: "ક્લાઉડ બેકઅપમાંથી તમારો મંડળનો ડેટા રિસ્ટોર કરો",
            about: "વિશે",
            aboutMyMandal: "My Mandal વિશે",
            aboutSubtitle: "એપની માહિતી અને વર્ઝન",
            notAvailable: "ઉપલબ્ધ નથી",
            loadingSettings: "સેટિંગ્સ લોડ થઈ રહી છે...",
            languageSaved: "ભાષા સેવ થઈ",
            languageSavedMessage: "તમારી એપની ભાષાની પસંદગી સેવ થઈ ગઈ છે.",
            error: "ભૂલ",
            unableSaveLanguage: "ભાષાની પસંદગી સેવ કરી શકાઈ નથી.",
            reminderSaved: "રિમાઇન્ડર સેટિંગ્સ સેવ થઈ",
            reminderSavedMessage: "તમારી રિમાઇન્ડર પસંદગીઓ સેવ થઈ ગઈ છે.",
            saveReminderError: "રિમાઇન્ડર સેવ કરી શકાયું નથી",
            tryAgain: "કૃપા કરીને ફરી પ્રયાસ કરો.",
            saveReminder: "રિમાઇન્ડર સેટિંગ્સ સેવ કરો",
            cancel: "રદ કરો",
            close: "બંધ કરો",
            chooseLanguage: "તમારી પસંદગીની ભાષા પસંદ કરો.",
            reminderDescription: "મફત ડિવાઇસ પરના માસિક અને ઓવરડ્યુ રિમાઇન્ડર્સ મેનેજ કરો.",
            monthlyReminder: "માસિક રિમાઇન્ડર",
            monthlyReminderDescription: "દર મહિને પસંદ કરેલા દિવસે રિમાઇન્ડ કરો.",
            monthlyDay: "માસિક દિવસ (1–28)",
            monthlyTime: "માસિક સમય (HH:MM)",
            overdueReminder: "ઓવરડ્યુ રિમાઇન્ડર",
            overdueDescription: "ડ્યુ તારીખ પછી દૈનિક રિમાઇન્ડર.",
            overdueTime: "ઓવરડ્યુ સમય (HH:MM)",
            restoreReview: "રિસ્ટોર કરતા પહેલાં તમારો ક્લાઉડ બેકઅપ તપાસો.",
            restoreCloud: "ક્લાઉડ ડેટા રિસ્ટોર કરો",
            restoreWarning: "આ ત્રણ લોકલ ડેટા કલેક્શન રિપ્લેસ થશે. તમારો PIN અને રિકવરી ઈમેલ બદલાશે નહીં.",
            aboutInformation: "એપની માહિતી",
            changePinSubtitleModal: "તમારો 4 અંકનો સુરક્ષા PIN અપડેટ કરો",
            disableBiometric: "બાયોમેટ્રિક બંધ કરો",
            disableBiometricDescription: "બાયોમેટ્રિક અનલોક બંધ કરવા તમારો વર્તમાન PIN દાખલ કરો.",
            currentPin: "વર્તમાન PIN",
            newPin: "નવો PIN",
            confirmNewPin: "નવો PIN ફરી દાખલ કરો",
            disableBiometricAction: "બાયોમેટ્રિક બંધ કરો",
            recoveryDescription: "તમારી વેરિફાઇડ રિકવરી ઈમેલ મેનેજ કરો.",
            recoveryVerified: "વેરિફાઇડ રિકવરી ઈમેલ",
            verificationRequiredText: "ઈમેલ વેરિફિકેશન જરૂરી છે",
            recoveryManage: "તમારી રિકવરી ઈમેલ મેનેજ કરો.",
            noBiometric: "કોઈ બાયોમેટ્રિક સેટ નથી",
            currentRecoveryEmail: "વર્તમાન રિકવરી ઈમેલ",
            verified: "✓ વેરિફાઇડ",
            verificationRequired: "⚠ વેરિફિકેશન જરૂરી",
            firebasePassword: "Firebase પાસવર્ડ",
            firebasePasswordDescription: "આ Firebase એકાઉન્ટનો પાસવર્ડ છે, તમારો 4 અંકનો My Mandal PIN નહીં.",
            connectVerifyEmail: "ઈમેલ કનેક્ટ અને વેરિફાઇ કરો",
            checkVerification: "વેરિફિકેશન તપાસો",
            newRecoveryEmail: "નવી રિકવરી ઈમેલ",
            sendVerification: "વેરિફિકેશન મોકલો",
            verificationPending: "વેરિફિકેશન પેન્ડિંગ",
            verifyThisAddress: "આ સરનામું વેરિફાઇ કરો:",
            checkSaveEmail: "નવી ઈમેલ તપાસો અને સેવ કરો",
            members: "સભ્યો",
            monthlyObligations: "માસિક બાકી રકમ",
            payments: "ચુકવણીઓ",
            appName: "એપનું નામ",
            version: "વર્ઝન",
            currency: "ચલણ",
            storage: "સ્ટોરેજ",
            offlineStorage: "ક્લાઉડ સિંક સાથે ઓફલાઇન-ફર્સ્ટ",
        }
        : {
            settings: "Settings",
            managePreferences: "Manage your Mandal preferences",
            mandalInformation: "Mandal Information",
            mandalName: "Mandal Name",
            adminName: "Admin Name",
            adminMobile: "Admin Mobile",
            recoveryEmail: "Recovery Email",
            security: "Security",
            changePin: "Change PIN",
            changePinSubtitle: "Change your 4-digit security PIN",
            biometricUnlock: "Biometric Unlock",
            language: "Language",
            appLanguage: "App Language",
            notifications: "Notifications",
            reminderSettings: "Reminder Settings",
            remindersConfigured: "Reminders are configured",
            remindersDisabled: "Reminders are disabled",
            data: "Data",
            exportData: "Export Data",
            exportSubtitle: "Export your Mandal records",
            export: "Export",
            restoreData: "Restore Data",
            restoreSubtitle: "Restore your Mandal data from cloud backup",
            about: "About",
            aboutMyMandal: "About My Mandal",
            aboutSubtitle: "App information and version",
            notAvailable: "Not available",
            loadingSettings: "Loading settings...",
            languageSaved: "Language Saved",
            languageSavedMessage: "Your app language preference has been saved.",
            error: "Error",
            unableSaveLanguage: "Unable to save language preference.",
            reminderSaved: "Reminder Settings Saved",
            reminderSavedMessage: "Your reminder preferences and device notifications have been saved.",
            saveReminderError: "Unable to Save Reminders",
            tryAgain: "Please try again.",
            saveReminder: "Save Reminder Settings",
            cancel: "Cancel",
            close: "Close",
            chooseLanguage: "Choose your preferred language.",
            reminderDescription: "Manage free on-device monthly and overdue reminders.",
            monthlyReminder: "Monthly Reminder",
            monthlyReminderDescription: "Remind you on the selected day each month.",
            monthlyDay: "Monthly Day (1–28)",
            monthlyTime: "Monthly Time (HH:MM)",
            overdueReminder: "Overdue Reminder",
            overdueDescription: "Daily reminder after the due date.",
            overdueTime: "Overdue Time (HH:MM)",
            restoreReview: "Review your cloud backup before restoring it.",
            restoreCloud: "Restore Cloud Data",
            restoreWarning: "Restoring will replace these three local data collections. Your PIN and recovery email will remain unchanged.",
            aboutInformation: "App information",
            changePinSubtitleModal: "Update your 4-digit security PIN",
            disableBiometric: "Disable Biometric",
            disableBiometricDescription: "Enter your current PIN to disable biometric unlock.",
            currentPin: "Current PIN",
            newPin: "New PIN",
            confirmNewPin: "Confirm New PIN",
            disableBiometricAction: "Disable Biometric",
            recoveryDescription: "Manage your verified recovery email.",
            recoveryVerified: "Verified recovery email",
            verificationRequiredText: "Email verification required",
            recoveryManage: "Manage your recovery email",
            noBiometric: "No enrolled biometric found",
            currentRecoveryEmail: "Current Recovery Email",
            verified: "✓ Verified",
            verificationRequired: "⚠ Verification required",
            firebasePassword: "Firebase Password",
            firebasePasswordDescription: "This is the Firebase account password, not your 4-digit My Mandal PIN.",
            connectVerifyEmail: "Connect & Verify Email",
            checkVerification: "Check Verification",
            newRecoveryEmail: "New Recovery Email",
            sendVerification: "Send Verification",
            verificationPending: "Verification Pending",
            verifyThisAddress: "Verify this address:",
            checkSaveEmail: "Check & Save New Email",
            members: "Members",
            monthlyObligations: "Monthly Obligations",
            payments: "Payments",
            appName: "App Name",
            version: "Version",
            currency: "Currency",
            storage: "Storage",
            offlineStorage: "Offline-first with cloud sync",
        };

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

    const navigation = useNavigation<any>();

    const [languageModalVisible, setLanguageModalVisible] =
        useState(false);

    const [reminderModalVisible, setReminderModalVisible] =
        useState(false);

    const [reminderSettings, setReminderSettings] =
        useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);

    const [savingReminders, setSavingReminders] =
        useState(false);

    const [restoreModalVisible, setRestoreModalVisible] =
        useState(false);

    const [restoreLoading, setRestoreLoading] =
        useState(false);

    const [restoreData, setRestoreData] =
        useState<{ members: any[]; obligations: any[]; payments: any[] } | null>(null);

    const [aboutModalVisible, setAboutModalVisible] =
        useState(false);

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
            await loadAppPreferences();
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
    // APP LANGUAGE / REMINDERS / DATA / ABOUT
    // --------------------------------------------------

    const loadAppPreferences = async () => {
        try {
            const storedReminders = await AsyncStorage.getItem(REMINDER_SETTINGS_KEY);
            if (storedReminders) {
                const parsed = JSON.parse(storedReminders);
                setReminderSettings({ ...DEFAULT_REMINDER_SETTINGS, ...parsed });
            }
        } catch (error) {
            console.error("Load app preferences error:", error);
        }
    };

    const selectLanguage = async (language: "English" | "Gujarati") => {
        try {
            await changeLanguage(language);
            setLanguageModalVisible(false);
            Alert.alert(
                ui.languageSaved,
                `${language} is now selected as your app language preference.`
            );
        } catch (error) {
            console.error("Change language error:", error);
            Alert.alert("Error", ui.unableSaveLanguage);
        }
    };

    const parseTime = (value: string) => {
        const parts = value.split(":");
        const hour = Number(parts[0]);
        const minute = Number(parts[1]);
        if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return null;
        }
        return { hour, minute };
    };

    const saveReminderSettings = async () => {
        try {
            setSavingReminders(true);
            const next: ReminderSettings = {
                ...reminderSettings,
                monthlyDay: Math.min(Math.max(Number(reminderSettings.monthlyDay) || 15, 1), 28),
                monthlyHour: Math.min(Math.max(Number(reminderSettings.monthlyHour) || 0, 0), 23),
                monthlyMinute: Math.min(Math.max(Number(reminderSettings.monthlyMinute) || 0, 0), 59),
                overdueHour: Math.min(Math.max(Number(reminderSettings.overdueHour) || 0, 0), 23),
                overdueMinute: Math.min(Math.max(Number(reminderSettings.overdueMinute) || 0, 0), 59),
            };
            await AsyncStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(next));
            setReminderSettings(next);
            setReminderModalVisible(false);
            Alert.alert(
                ui.reminderSaved,
                Constants.appOwnership === "expo"
                    ? "Your reminder preferences have been saved. Notification scheduling will be active in the installed production/development build."
                    : ui.reminderSavedMessage
            );
        } catch (error: any) {
            console.error("Save reminder settings error:", error);
            Alert.alert(ui.saveReminderError, error?.message || ui.tryAgain);
        } finally {
            setSavingReminders(false);
        }
    };

    const openRestoreData = async () => {
        if (!auth.currentUser?.emailVerified) {
            Alert.alert("Recovery Email Verification Required", "Please connect and verify your recovery email before restoring cloud data.");
            return;
        }
        try {
            setRestoreLoading(true);
            const data = await getCloudData();
            setRestoreData(data);
            setRestoreModalVisible(true);
        } catch (error: any) {
            console.error("Load cloud restore data error:", error);
            Alert.alert("Restore Unavailable", error?.message || "Unable to load your cloud backup.");
        } finally {
            setRestoreLoading(false);
        }
    };

    const confirmRestoreData = async () => {
        if (!restoreData) return;
        Alert.alert(
            "Confirm Restore",
            "This will replace the current local Members, Obligations and Payments with the cloud backup. Your local PIN will not be changed.",
            [
                { text: ui.cancel, style: "cancel" },
                {
                    text: "Restore",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setRestoreLoading(true);
                            await AsyncStorage.setItem("mandal_members", JSON.stringify(restoreData.members || []));
                            await AsyncStorage.setItem("mandal_monthly_obligations", JSON.stringify(restoreData.obligations || []));
                            await AsyncStorage.setItem("mandal_payments", JSON.stringify(restoreData.payments || []));
                            // The cloud snapshot becomes the new local source of truth.
                            // Clear old deletion tombstones so a later sync does not
                            // immediately delete records that were just restored.
                            await AsyncStorage.removeItem("mandal_cloud_deleted_records");
                            setRestoreModalVisible(false);
                            Alert.alert("Restore Complete", "Your Mandal data has been restored successfully. Your PIN was kept unchanged.");
                        } catch (error) {
                            console.error("Restore data error:", error);
                            Alert.alert("Restore Failed", "Unable to restore cloud data. Your existing local data was not intentionally deleted.");
                        } finally {
                            setRestoreLoading(false);
                        }
                    },
                },
            ]
        );
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
                        ui.cancel,
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
                    `A verification email has been sent to ${setupData.email}. Open that email and verify your address, then return here and tap ${ui.checkVerification}.`
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
                    ? ui.recoveryVerified
                    : ui.verificationRequiredText
                : ui.recoveryManage;

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
                            {ui.settings}
                        </Text>

                        <Text
                            style={
                                styles.subtitle
                            }
                        >
                            {ui.managePreferences}
                        </Text>
                    </View>
                </View>

                {/* Mandal Information */}
                <SettingsSection
                    title={ui.mandalInformation}
                >
                    <InformationRow
                        title={ui.mandalName}
                        value={
                            setupData?.mandalName ||
                            ui.notAvailable
                        }
                    />

                    <InformationRow
                        title={ui.adminName}
                        value={
                            setupData?.adminName ||
                            ui.notAvailable
                        }
                    />

                    <InformationRow
                        title={ui.adminMobile}
                        value={
                            setupData?.mobile ||
                            ui.notAvailable
                        }
                    />

                    <InformationRow
                        title={ui.recoveryEmail}
                        value={
                            setupData?.email ||
                            ui.notAvailable
                        }
                    />
                </SettingsSection>

                {/* Security */}
                <SettingsSection title={ui.security}>
                    <SettingsRow
                        title={ui.changePin}
                        subtitle={ui.changePinSubtitle}
                        onPress={() =>
                            setChangePinVisible(
                                true
                            )
                        }
                    />

                    <SettingsRow
                        title={ui.biometricUnlock}
                        subtitle={
                            biometricAvailable
                                ? biometricEnabled
                                    ? appLanguage === "Gujarati" ? `${biometricType} સક્રિય છે` : `${biometricType} is enabled`
                                    : appLanguage === "Gujarati" ? `${biometricType} ઉપલબ્ધ છે` : `${biometricType} is available`
                                : ui.noBiometric
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
                        title={ui.recoveryEmail}
                        subtitle={
                            recoverySubtitle
                        }
                        onPress={
                            openRecoveryEmail
                        }
                    />
                </SettingsSection>

                {/* Language */}
                <SettingsSection title={ui.language}>
                    <SettingsRow
                        title={ui.appLanguage}
                        subtitle={appLanguage === "Gujarati" ? "Gujarati" : "English"}
                        onPress={() => setLanguageModalVisible(true)}
                    />
                </SettingsSection>

                {/* Notifications */}
                <SettingsSection
                    title={ui.notifications}
                >
                    <SettingsRow
                        title={ui.reminderSettings}
                        subtitle={reminderSettings.monthlyEnabled || reminderSettings.overdueEnabled ? ui.remindersConfigured : ui.remindersDisabled}
                        onPress={() => setReminderModalVisible(true)}
                    />
                </SettingsSection>

                {/* Data */}
                <SettingsSection title={ui.data}>
                    <SettingsRow
                        title={ui.exportData}
                        subtitle={ui.exportSubtitle}
                        onPress={() => navigation.navigate("Export")}
                    />

                    <SettingsRow
                        title={ui.restoreData}
                        subtitle={ui.restoreSubtitle}
                        onPress={openRestoreData}
                    />
                </SettingsSection>

                {/* About */}
                <SettingsSection title={ui.about}>
                    <SettingsRow
                        title={ui.aboutMyMandal}
                        subtitle={ui.aboutSubtitle}
                        onPress={() => setAboutModalVisible(true)}
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
                    {ui.version} 1.0.0
                </Text>
            </ScrollView>

            {/* Language Modal */}
            <Modal visible={languageModalVisible} transparent animationType="slide" onRequestClose={() => setLanguageModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.smallModalCard}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>{ui.appLanguage}</Text>
                                <Text style={styles.modalSubtitle}>{ui.chooseLanguage}</Text>
                            </View>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setLanguageModalVisible(false)}>
                                <Text style={styles.closeButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        {(["English", "Gujarati"] as ("English" | "Gujarati")[]).map((language) => (
                            <TouchableOpacity key={language} style={[styles.optionRow, appLanguage === language && styles.optionRowSelected]} onPress={() => selectLanguage(language)}>
                                <Text style={[styles.optionText, appLanguage === language && styles.optionTextSelected]}>{language}</Text>
                                {appLanguage === language && <Text style={styles.optionCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>

            {/* Reminder Settings Modal */}
            <Modal visible={reminderModalVisible} transparent animationType="slide" onRequestClose={() => setReminderModalVisible(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>{ui.reminderSettings}</Text>
                                <Text style={styles.modalSubtitle}>{ui.reminderDescription}</Text>
                            </View>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setReminderModalVisible(false)} disabled={savingReminders}>
                                <Text style={styles.closeButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.settingLine}>
                            <View style={styles.settingLineText}>
                                <Text style={styles.rowTitle}>{ui.monthlyReminder}</Text>
                                <Text style={styles.rowSubtitle}>{ui.monthlyReminderDescription}</Text>
                            </View>
                            <Switch value={reminderSettings.monthlyEnabled} onValueChange={(value) => setReminderSettings((prev) => ({ ...prev, monthlyEnabled: value }))} />
                        </View>

                        <Text style={styles.inputLabel}>{ui.monthlyDay}</Text>
                        <TextInput style={styles.textInput} value={String(reminderSettings.monthlyDay)} onChangeText={(value) => setReminderSettings((prev) => ({ ...prev, monthlyDay: Number(value.replace(/[^0-9]/g, "")) || 1 }))} keyboardType="number-pad" maxLength={2} editable={!savingReminders} />

                        <Text style={styles.inputLabel}>{ui.monthlyTime}</Text>
                        <TextInput style={styles.textInput} value={`${String(reminderSettings.monthlyHour).padStart(2, "0")}:${String(reminderSettings.monthlyMinute).padStart(2, "0")}`} onChangeText={(value) => { const parsed = parseTime(value); if (parsed) setReminderSettings((prev) => ({ ...prev, monthlyHour: parsed.hour, monthlyMinute: parsed.minute })); }} placeholder="10:00" editable={!savingReminders} />

                        <View style={styles.settingLine}>
                            <View style={styles.settingLineText}>
                                <Text style={styles.rowTitle}>{ui.overdueReminder}</Text>
                                <Text style={styles.rowSubtitle}>{ui.overdueDescription}</Text>
                            </View>
                            <Switch value={reminderSettings.overdueEnabled} onValueChange={(value) => setReminderSettings((prev) => ({ ...prev, overdueEnabled: value }))} />
                        </View>

                        <Text style={styles.inputLabel}>{ui.overdueTime}</Text>
                        <TextInput style={styles.textInput} value={`${String(reminderSettings.overdueHour).padStart(2, "0")}:${String(reminderSettings.overdueMinute).padStart(2, "0")}`} onChangeText={(value) => { const parsed = parseTime(value); if (parsed) setReminderSettings((prev) => ({ ...prev, overdueHour: parsed.hour, overdueMinute: parsed.minute })); }} placeholder="10:00" editable={!savingReminders} />

                        <TouchableOpacity style={[styles.saveButton, savingReminders && styles.buttonDisabled]} onPress={saveReminderSettings} disabled={savingReminders}>
                            {savingReminders ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>{ui.saveReminder}</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setReminderModalVisible(false)} disabled={savingReminders}>
                            <Text style={styles.cancelButtonText}>{ui.cancel}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Restore Data Modal */}
            <Modal visible={restoreModalVisible} transparent animationType="slide" onRequestClose={() => !restoreLoading && setRestoreModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.smallModalCard}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>{ui.restoreData}</Text>
                                <Text style={styles.modalSubtitle}>{ui.restoreReview}</Text>
                            </View>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setRestoreModalVisible(false)} disabled={restoreLoading}>
                                <Text style={styles.closeButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        {restoreData ? (
                            <>
                                <InformationRow title={ui.members} value={String(restoreData.members.length)} />
                                <InformationRow title={ui.monthlyObligations} value={String(restoreData.obligations.length)} />
                                <InformationRow title={ui.payments} value={String(restoreData.payments.length)} />
                                <Text style={styles.restoreWarning}>{ui.restoreWarning}</Text>
                                <TouchableOpacity style={[styles.saveButton, restoreLoading && styles.buttonDisabled]} onPress={confirmRestoreData} disabled={restoreLoading}>
                                    {restoreLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>{ui.restoreCloud}</Text>}
                                </TouchableOpacity>
                            </>
                        ) : <ActivityIndicator size="large" />}
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setRestoreModalVisible(false)} disabled={restoreLoading}>
                            <Text style={styles.cancelButtonText}>{ui.cancel}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* About Modal */}
            <Modal visible={aboutModalVisible} transparent animationType="slide" onRequestClose={() => setAboutModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.smallModalCard}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>{ui.aboutMyMandal}</Text>
                                <Text style={styles.modalSubtitle}>{ui.aboutInformation}</Text>
                            </View>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setAboutModalVisible(false)}>
                                <Text style={styles.closeButtonText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <InformationRow title={ui.appName} value="My Mandal" />
                        <InformationRow title={ui.version} value="1.0.0" />
                        <InformationRow title={ui.currency} value="INR" />
                        <InformationRow title={ui.storage} value={ui.offlineStorage} />
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setAboutModalVisible(false)}>
                            <Text style={styles.cancelButtonText}>{ui.close}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

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
                            label={ui.currentPin}
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
                                {ui.currentRecoveryEmail}
                            </Text>

                            <Text
                                style={
                                    styles.currentEmailValue
                                }
                            >
                                {setupData?.email ||
                                    ui.notAvailable}
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
                                    ? ui.verified
                                    : ui.verificationRequired}
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

    optionRow: {
        minHeight: 56,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        paddingHorizontal: 16,
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#FFFFFF",
    },

    optionRowSelected: {
        borderColor: "#2563EB",
        backgroundColor: "#EFF6FF",
    },

    optionText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1A2639",
    },

    optionTextSelected: {
        color: "#2563EB",
    },

    optionCheck: {
        fontSize: 20,
        fontWeight: "700",
        color: "#2563EB",
    },

    settingLine: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
    },

    settingLineText: {
        flex: 1,
        paddingRight: 12,
    },

    restoreWarning: {
        marginTop: 14,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#FFF7ED",
        color: "#9A3412",
        fontSize: 13,
        lineHeight: 19,
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