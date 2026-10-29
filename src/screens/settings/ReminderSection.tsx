import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Alert, Linking, Switch, View } from "react-native";

import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from "../../services/reminderPlan";
import {
    notificationPermission,
    readReminderSettings,
    requestNotificationPermission,
    saveReminderSettings,
} from "../../services/reminders";
import { Button, Card, Field, Note, Row } from "../../ui/components";

export function ReminderSection() {
    const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
    const [permission, setPermission] = useState<string>("undetermined");
    const [time, setTime] = useState("10:00");

    const load = useCallback(() => {
        readReminderSettings().then((value) => {
            setSettings(value);
            setTime(`${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`);
        });
        notificationPermission().then(setPermission).catch(() => setPermission("unavailable"));
    }, []);
    useFocusEffect(load);

    const toggle = async (enabled: boolean) => {
        if (enabled && !(await requestNotificationPermission())) {
            Alert.alert("Notifications are blocked", "Allow notifications for My Mandal in Android settings to receive reminders.", [
                { text: "Cancel", style: "cancel" },
                { text: "Open settings", onPress: () => void Linking.openSettings() },
            ]);
            load();
            return;
        }
        await saveReminderSettings({ ...settings, enabled });
        load();
    };

    const saveTime = async () => {
        const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
        const hour = match ? Number(match[1]) : NaN;
        const minute = match ? Number(match[2]) : NaN;
        if (!match || hour > 23 || minute > 59) {
            Alert.alert("Invalid time", "Use HH:MM, for example 10:00.");
            return;
        }
        await saveReminderSettings({ ...settings, hour, minute });
        load();
    };

    return (
        <Card title="Month-end reminder">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Note>Remind me on the 1st when last month is unpaid</Note>
                <Switch value={settings.enabled} onValueChange={(v) => void toggle(v)} />
            </View>
            <Row label="Notification permission" value={permission} />
            <Field label="Reminder time (India, HH:MM)" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
            <Button size="small" variant="secondary" label="Save time" onPress={() => void saveTime()} />
            <Note>
                This is a phone notification only. The app cannot run while closed: the unpaid count is calculated when you last opened the app or
                recorded a payment, and Android may deliver it a few minutes late. Open the app for the latest figures.
            </Note>
        </Card>
    );
}
