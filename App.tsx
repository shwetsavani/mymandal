import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, type AppStateStatus, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LanguageProvider } from "./src/localization/LanguageContext";
import type { RootStackParamList } from "./src/navigation/types";
import EditMemberScreen from "./src/screens/EditMemberScreen";
import ExportScreen from "./src/screens/ExportScreen";
import ForgotPinScreen from "./src/screens/ForgotPinScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import MembersScreen from "./src/screens/MembersScreen";
import MemberMonthScreen from "./src/screens/MemberMonthScreen";
import MonthlyPaymentsScreen from "./src/screens/MonthlyPaymentsScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SetupScreen from "./src/screens/SetupScreen";
import { DataErrorView } from "./src/screens/DataErrorScreen";
import { migratePlaintextPin } from "./src/security/pinVerifier";
import { initializeReminders, refreshReminders } from "./src/services/reminders";
import { KEYS } from "./src/storage/keys";
import { runMigrations } from "./src/storage/migrations";
import { readSetup, subscribeFinancialChanges } from "./src/storage/repository";

const Stack = createNativeStackNavigator<RootStackParamList>();

type AppScreen = "loading" | "error" | "setup" | "login" | "forgotPin" | "app";

const BACKGROUND_LOCK_MS = 5 * 60 * 1000;

export default function App() {
    const [screen, setScreen] = useState<AppScreen>("loading");
    const [startupError, setStartupError] = useState<Error | null>(null);
    const screenRef = useRef<AppScreen>("loading");
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    const go = useCallback((next: AppScreen) => {
        screenRef.current = next;
        setScreen(next);
    }, []);

    const start = useCallback(async () => {
        go("loading");
        try {
            await runMigrations();
            await migratePlaintextPin();
            const setup = await readSetup();
            go(setup ? "login" : "setup");
        } catch (error) {
            setStartupError(error instanceof Error ? error : new Error(String(error)));
            go("error");
        }
    }, [go]);

    useEffect(() => {
        void start();
        void initializeReminders();
        const unsubscribe = subscribeFinancialChanges(() => void refreshReminders());

        const subscription = AppState.addEventListener("change", async (next) => {
            const previous = appStateRef.current;
            appStateRef.current = next;
            if (previous === "active" && next !== "active") {
                if (screenRef.current === "app") {
                    await AsyncStorage.setItem(KEYS.lastBackgroundTime, String(Date.now()));
                }
                return;
            }
            if (previous !== "active" && next === "active") {
                void refreshReminders();
                if (screenRef.current !== "app") return;
                const stored = Number(await AsyncStorage.getItem(KEYS.lastBackgroundTime));
                await AsyncStorage.removeItem(KEYS.lastBackgroundTime);
                // A missing, invalid or backwards timestamp also locks: fail closed.
                const elapsed = Number.isFinite(stored) && stored > 0 ? Date.now() - stored : BACKGROUND_LOCK_MS;
                if (elapsed >= BACKGROUND_LOCK_MS || elapsed < 0) go("login");
            }
        });
        return () => {
            subscription.remove();
            unsubscribe();
        };
    }, [go, start]);

    return (
        <SafeAreaProvider>
            <LanguageProvider>
                {screen === "loading" ? (
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                        <ActivityIndicator size="large" />
                    </View>
                ) : screen === "error" && startupError ? (
                    <DataErrorView error={startupError} onRetry={() => void start()} />
                ) : screen === "setup" ? (
                    <SetupScreen onSetupComplete={() => go("login")} />
                ) : screen === "login" ? (
                    <LoginScreen onLoginSuccess={() => go("app")} onForgotPin={() => go("forgotPin")} />
                ) : screen === "forgotPin" ? (
                    <ForgotPinScreen onDone={() => go("login")} />
                ) : (
                    <NavigationContainer>
                        <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="Home" component={HomeScreen} />
                            <Stack.Screen name="MonthlyPayments" component={MonthlyPaymentsScreen} />
                            <Stack.Screen name="MemberMonth" component={MemberMonthScreen} />
                            <Stack.Screen name="Members" component={MembersScreen} />
                            <Stack.Screen name="EditMember" component={EditMemberScreen} />
                            <Stack.Screen name="History" component={HistoryScreen} />
                            <Stack.Screen name="Reports" component={ReportsScreen} />
                            <Stack.Screen name="Export" component={ExportScreen} />
                            <Stack.Screen name="Settings" component={SettingsScreen} />
                        </Stack.Navigator>
                    </NavigationContainer>
                )}
            </LanguageProvider>
        </SafeAreaProvider>
    );
}
