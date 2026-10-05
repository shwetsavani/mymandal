import React, {
    useEffect,
    useRef,
    useState,
} from "react";

import {
    ActivityIndicator,
    Alert,
    AppState,
    AppStateStatus,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    NavigationContainer,
} from "@react-navigation/native";

import {
    createNativeStackNavigator,
} from "@react-navigation/native-stack";

import SetupScreen from "./src/screens/SetupScreen";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import MembersScreen from "./src/screens/MembersScreen";
import AddMemberScreen from "./src/screens/AddMemberScreen";
import EditMemberScreen from "./src/screens/EditMemberScreen";
import MonthlyPaymentsScreen from "./src/screens/MonthlyPaymentsScreen";
import PaymentDetailsScreen from "./src/screens/PaymentDetailsScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import ExportScreen from "./src/screens/ExportScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

import { LanguageProvider } from "./src/localization/LanguageContext";
import { auth } from "./src/services/firebase";
import { signInRecoveryAccount } from "./src/services/firebaseAuth";

type RootStackParamList = {
    Home: undefined;
    Members: undefined;
    AddMember: undefined;
    EditMember: {
        memberId: string;
    };
    MonthlyPayments: undefined;
    History: undefined;
    Reports: undefined;
    Export: undefined;
    PaymentDetails: {
        obligationId: string;
        memberName: string;
        originalInstallment: number;
    };
    Settings: undefined;
};

const Stack =
    createNativeStackNavigator<RootStackParamList>();

type AppScreen =
    | "loading"
    | "setup"
    | "login"
    | "app";

const BACKGROUND_LOCK_TIME =
    5 * 60 * 1000;

const LAST_BACKGROUND_TIME_KEY =
    "mandal_last_background_time";

export default function App() {
    const [screen, setScreen] =
        useState<AppScreen>("loading");

    const [cloudPasswordModalVisible, setCloudPasswordModalVisible] =
        useState(false);

    const [cloudPassword, setCloudPassword] =
        useState("");

    const [cloudEmail, setCloudEmail] =
        useState("");

    const [cloudLoading, setCloudLoading] =
        useState(false);

    const appState = useRef<AppStateStatus>(
        AppState.currentState
    );

    const backgroundTimeRef =
        useRef<number | null>(null);

    useEffect(() => {
        checkSetup();

        const subscription =
            AppState.addEventListener(
                "change",
                handleAppStateChange
            );

        return () => {
            subscription.remove();
        };
    }, []);

    const checkSetup = async () => {
        try {
            const setupData =
                await AsyncStorage.getItem(
                    "mandal_setup"
                );

            if (setupData) {
                setScreen("login");
            } else {
                setScreen("setup");
            }
        } catch (error) {
            console.error(
                "Setup check error:",
                error
            );

            setScreen("setup");
        }
    };

    const handleAppStateChange = async (
        nextState: AppStateStatus
    ) => {
        const previousState =
            appState.current;

        appState.current = nextState;

        if (
            previousState === "active" &&
            (nextState === "background" ||
                nextState === "inactive")
        ) {
            if (screen === "app") {
                const timestamp = Date.now();

                backgroundTimeRef.current =
                    timestamp;

                await AsyncStorage.setItem(
                    LAST_BACKGROUND_TIME_KEY,
                    String(timestamp)
                );
            }

            return;
        }

        if (
            (previousState === "background" ||
                previousState === "inactive") &&
            nextState === "active"
        ) {
            if (screen !== "app") {
                return;
            }

            let backgroundTime =
                backgroundTimeRef.current;

            if (!backgroundTime) {
                const storedTime =
                    await AsyncStorage.getItem(
                        LAST_BACKGROUND_TIME_KEY
                    );

                if (storedTime) {
                    backgroundTime =
                        Number(storedTime);
                }
            }

            if (!backgroundTime) {
                return;
            }

            const elapsed =
                Date.now() - backgroundTime;

            backgroundTimeRef.current = null;

            await AsyncStorage.removeItem(
                LAST_BACKGROUND_TIME_KEY
            );

            if (
                elapsed >=
                BACKGROUND_LOCK_TIME
            ) {
                setScreen("login");
            }
        }
    };

    const startCloudSyncAfterLogin = async () => {
        try {
            /*
             * If Firebase Auth already has a persisted
             * authenticated user, use it directly.
             */
            if (auth.currentUser) {
                await auth.currentUser.reload();

                const user =
                    auth.currentUser;

                if (
                    user &&
                    user.emailVerified
                ) {
                    const {
                        syncLocalDataToCloud,
                    } = await import(
                        "./src/services/cloudSync"
                        );

                    await syncLocalDataToCloud();

                    console.log(
                        "My Mandal cloud sync completed."
                    );

                    return;
                }
            }

            /*
             * No Firebase session exists yet.
             * Read the recovery email from local setup.
             */
            const setupJson =
                await AsyncStorage.getItem(
                    "mandal_setup"
                );

            if (!setupJson) {
                return;
            }

            const setupData =
                JSON.parse(setupJson);

            const recoveryEmail =
                String(
                    setupData.email || ""
                ).trim();

            if (!recoveryEmail) {
                Alert.alert(
                    "Cloud Backup",
                    "Your recovery email is not configured yet."
                );

                return;
            }

            setCloudEmail(
                recoveryEmail
            );

            setCloudPassword("");

            setCloudPasswordModalVisible(
                true
            );
        } catch (error) {
            console.error(
                "Cloud sync initialization error:",
                error
            );
        }
    };

    const handleCloudConnection = async () => {
        if (cloudLoading) {
            return;
        }

        if (!cloudEmail) {
            Alert.alert(
                "Cloud Backup",
                "Recovery email was not found."
            );

            return;
        }

        if (!cloudPassword) {
            Alert.alert(
                "Password Required",
                "Please enter your Firebase password."
            );

            return;
        }

        try {
            setCloudLoading(true);

            const user =
                await signInRecoveryAccount(
                    cloudEmail,
                    cloudPassword
                );

            await user.reload();

            if (!user.emailVerified) {
                Alert.alert(
                    "Email Not Verified",
                    "Please verify your recovery email first, then try connecting cloud backup again."
                );

                return;
            }

            const {
                syncLocalDataToCloud,
            } = await import(
                "./src/services/cloudSync"
                );

            await syncLocalDataToCloud();

            console.log(
                "My Mandal cloud sync completed."
            );

            setCloudPassword("");

            setCloudPasswordModalVisible(
                false
            );

            Alert.alert(
                "Cloud Backup Connected",
                "Your My Mandal data has been backed up to the cloud."
            );
        } catch (error: any) {
            console.error(
                "Firebase cloud connection error:",
                error
            );

            let message =
                "Unable to connect to cloud backup.";

            if (
                error?.code ===
                "auth/invalid-credential"
            ) {
                message =
                    "The Firebase email or password is incorrect.";
            } else if (
                error?.code ===
                "auth/user-not-found"
            ) {
                message =
                    "No Firebase account was found for this recovery email.";
            } else if (
                error?.code ===
                "auth/wrong-password"
            ) {
                message =
                    "The Firebase password is incorrect.";
            } else if (
                error?.code ===
                "auth/too-many-requests"
            ) {
                message =
                    "Too many login attempts. Please wait and try again.";
            }

            Alert.alert(
                "Cloud Backup",
                message
            );
        } finally {
            setCloudLoading(false);
        }
    };

    const closeCloudPasswordModal = () => {
        if (cloudLoading) {
            return;
        }

        setCloudPassword("");

        setCloudPasswordModalVisible(
            false
        );
    };

    if (screen === "loading") {
        return (
            <View
                style={
                    styles.loadingContainer
                }
            >
                <ActivityIndicator
                    size="large"
                />
            </View>
        );
    }

    if (screen === "setup") {
        return (
            <SetupScreen
                onSetupComplete={() =>
                    setScreen("login")
                }
            />
        );
    }

    return (
        <LanguageProvider>
            <>
                {screen === "login" ? (
                <LoginScreen
                    onLoginSuccess={async () => {
                        setScreen("app");

                        /*
                         * PIN/biometric unlock succeeds first.
                         * Cloud authentication is handled separately.
                         */
                        await startCloudSyncAfterLogin();
                    }}
                />
            ) : (
                <NavigationContainer>
                    <Stack.Navigator
                        initialRouteName="Home"
                        screenOptions={{
                            headerShown: false,
                        }}
                    >
                        <Stack.Screen name="Home">
                            {() => (
                                <HomeScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="Members">
                            {() => (
                                <MembersScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="AddMember">
                            {() => (
                                <AddMemberScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="EditMember">
                            {() => (
                                <EditMemberScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="MonthlyPayments">
                            {() => (
                                <MonthlyPaymentsScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="PaymentDetails">
                            {() => (
                                <PaymentDetailsScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="History">
                            {() => (
                                <HistoryScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="Reports">
                            {() => (
                                <ReportsScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="Export">
                            {() => (
                                <ExportScreen />
                            )}
                        </Stack.Screen>

                        <Stack.Screen name="Settings">
                            {({ navigation }) => (
                                <SettingsScreen
                                    onBack={() =>
                                        navigation.goBack()
                                    }
                                />
                            )}
                        </Stack.Screen>
                    </Stack.Navigator>
                </NavigationContainer>
            )}

            <Modal
                visible={
                    cloudPasswordModalVisible
                }
                transparent
                animationType="fade"
                onRequestClose={
                    closeCloudPasswordModal
                }
            >
                <View
                    style={
                        styles.modalOverlay
                    }
                >
                    <View
                        style={
                            styles.modalCard
                        }
                    >
                        <Text
                            style={
                                styles.modalTitle
                            }
                        >
                            Connect Cloud Backup
                        </Text>

                        <Text
                            style={
                                styles.modalDescription
                            }
                        >
                            Connect your Firebase
                            account to enable
                            secure cloud backup
                            and restore.
                        </Text>

                        <Text
                            style={
                                styles.emailLabel
                            }
                        >
                            Recovery Email
                        </Text>

                        <Text
                            style={
                                styles.emailText
                            }
                        >
                            {cloudEmail}
                        </Text>

                        <Text
                            style={
                                styles.passwordLabel
                            }
                        >
                            Firebase Password
                        </Text>

                        <TextInput
                            style={
                                styles.passwordInput
                            }
                            value={
                                cloudPassword
                            }
                            onChangeText={
                                setCloudPassword
                            }
                            placeholder="Enter Firebase password"
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={
                                !cloudLoading
                            }
                        />

                        <Text
                            style={
                                styles.securityNote
                            }
                        >
                            Your Firebase password
                            is used only to sign
                            in and is never stored
                            by My Mandal.
                        </Text>

                        <View
                            style={
                                styles.modalActions
                            }
                        >
                            <TouchableOpacity
                                style={
                                    styles.cancelButton
                                }
                                onPress={
                                    closeCloudPasswordModal
                                }
                                disabled={
                                    cloudLoading
                                }
                            >
                                <Text
                                    style={
                                        styles.cancelButtonText
                                    }
                                >
                                    Not Now
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={
                                    styles.connectButton
                                }
                                onPress={
                                    handleCloudConnection
                                }
                                disabled={
                                    cloudLoading
                                }
                            >
                                {cloudLoading ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#FFFFFF"
                                    />
                                ) : (
                                    <Text
                                        style={
                                            styles.connectButtonText
                                        }
                                    >
                                        Connect
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            </>
        </LanguageProvider>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },

    modalOverlay: {
        flex: 1,
        backgroundColor:
            "rgba(0,0,0,0.5)",
        justifyContent: "center",
        paddingHorizontal: 24,
    },

    modalCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        padding: 24,
    },

    modalTitle: {
        fontSize: 22,
        fontWeight: "700",
        color: "#1A2639",
        marginBottom: 10,
    },

    modalDescription: {
        fontSize: 15,
        lineHeight: 22,
        color: "#667085",
        marginBottom: 20,
    },

    emailLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: "#667085",
        marginBottom: 5,
    },

    emailText: {
        fontSize: 15,
        color: "#1A2639",
        marginBottom: 18,
    },

    passwordLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: "#667085",
        marginBottom: 7,
    },

    passwordInput: {
        height: 50,
        borderWidth: 1,
        borderColor: "#D0D5DD",
        borderRadius: 10,
        paddingHorizontal: 14,
        fontSize: 16,
        color: "#1A2639",
    },

    securityNote: {
        fontSize: 12,
        lineHeight: 18,
        color: "#667085",
        marginTop: 10,
    },

    modalActions: {
        flexDirection: "row",
        gap: 10,
        marginTop: 22,
    },

    cancelButton: {
        flex: 1,
        height: 48,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#D0D5DD",
        justifyContent: "center",
        alignItems: "center",
    },

    cancelButtonText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#344054",
    },

    connectButton: {
        flex: 1,
        height: 48,
        borderRadius: 10,
        backgroundColor: "#2563EB",
        justifyContent: "center",
        alignItems: "center",
    },

    connectButtonText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#FFFFFF",
    },
});