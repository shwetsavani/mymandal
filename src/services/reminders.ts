import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { formatPaise } from "../domain/money";
import { getAppLanguage } from "../localization/i18n";
import { STRINGS } from "../localization/strings";
import { KEYS } from "../storage/keys";
import { loadFinancialState } from "../storage/repository";
import { normalizeReminderSettings, planMonthEndReminder, type ReminderSettings } from "./reminderPlan";

/**
 * Local month-end reminder (no SMS, WhatsApp or server).
 *
 * Platform limits: the app does not run in the background. The unpaid count
 * in a scheduled notification is calculated when the app last refreshed it
 * (app open, return to foreground, or any payment/obligation change), and the
 * OS may deliver it a little late, especially if exact alarms are not
 * permitted or battery optimisation applies. A reboot keeps the schedule.
 */
export const REMINDER_ID = "my-mandal-month-end";
export const REMINDER_CHANNEL = "monthly-dues";

let initialized = false;

export const initializeReminders = async (): Promise<void> => {
    if (initialized) return;
    initialized = true;
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });
        if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
                name: "Monthly dues",
                importance: Notifications.AndroidImportance.HIGH,
            });
        }
        await refreshReminders();
    } catch (error) {
        console.error("Reminder initialisation failed:", error);
    }
};

export const readReminderSettings = async (): Promise<ReminderSettings> => {
    try {
        const raw = await AsyncStorage.getItem(KEYS.reminderSettings);
        return normalizeReminderSettings(raw ? JSON.parse(raw) : null);
    } catch {
        return normalizeReminderSettings(null);
    }
};

export const saveReminderSettings = async (settings: ReminderSettings): Promise<void> => {
    await AsyncStorage.setItem(KEYS.reminderSettings, JSON.stringify(settings));
    await refreshReminders();
};

export const notificationPermission = async (): Promise<"granted" | "denied" | "undetermined"> => {
    const { status } = await Notifications.getPermissionsAsync();
    return status as "granted" | "denied" | "undetermined";
};

export const requestNotificationPermission = async (): Promise<boolean> => {
    if (Platform.OS === "android") {
        // The channel must exist before Android 13 shows the permission prompt.
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
            name: "Monthly dues",
            importance: Notifications.AndroidImportance.HIGH,
        });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    const result = await Notifications.requestPermissionsAsync();
    return result.status === "granted";
};

let refreshChain: Promise<void> = Promise.resolve();

/** Cancels and, if needed, reschedules the single month-end reminder. */
export const refreshReminders = (): Promise<void> => {
    refreshChain = refreshChain.then(async () => {
        try {
            const settings = await readReminderSettings();
            await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
            if (!settings.enabled || (await notificationPermission()) !== "granted") return;
            const state = await loadFinancialState();
            const plan = planMonthEndReminder(state, Date.now(), settings);
            if (!plan || plan.triggerAt <= Date.now()) return;
            const s = STRINGS[await getAppLanguage()];
            const monthText = s.monthLabel(plan.month.year, plan.month.month);
            await Notifications.scheduleNotificationAsync({
                identifier: REMINDER_ID,
                content: {
                    title: `My Mandal: ${monthText}`,
                    body: `${plan.unpaidMembers} member(s) have not paid ${monthText}. Installment outstanding: ${formatPaise(plan.installmentOutstandingPaise, { decimals: false })}. Open the app for current penalties.`,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: new Date(plan.triggerAt),
                    channelId: REMINDER_CHANNEL,
                },
            });
        } catch (error) {
            console.error("Reminder refresh failed:", error);
        }
    });
    return refreshChain;
};
