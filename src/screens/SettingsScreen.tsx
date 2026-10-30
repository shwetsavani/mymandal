import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useCallback, useState } from "react";
import { Alert, Switch, View } from "react-native";

import type { BackupValidation } from "../backup/backupFormat";
import { readBackupStatus, type BackupStatus } from "../backup/backupStatus";
import { APP_VERSION, createAndShareLocalBackup, pickBackupFile } from "../backup/localBackup";
import { addMonths, currentIstMonth, formatIstDateTime, type YearMonth } from "../domain/calendar";
import type { MandalSetup } from "../domain/types";
import { useLanguage } from "../localization/LanguageContext";
import { useStrings } from "../localization/strings";
import type { Nav } from "../navigation/types";
import { checkPin, isValidPinFormat, setNewPin } from "../security/pinVerifier";
import { submitMandalStart, submitSetupInfo } from "../services/financeService";
import { KEYS } from "../storage/keys";
import { readSetup } from "../storage/repository";
import { Button, Card, Field, Loading, MonthSelector, Note, Row, Screen, Sheet } from "../ui/components";
import { RestoreDialog } from "../ui/RestoreDialog";
import { mandalStart, money } from "../ui/selectors";
import { useFinance } from "../ui/useFinance";
import { CloudBackupSection } from "./settings/CloudBackupSection";
import { ReminderSection } from "./settings/ReminderSection";
import { DataErrorView } from "./DataErrorScreen";

export default function SettingsScreen() {
    const s = useStrings();
    const { language, changeLanguage } = useLanguage();
    const navigation = useNavigation<Nav>();
    const { state, error, reload } = useFinance();
    const [setup, setSetup] = useState<MandalSetup | null>(null);
    const [info, setInfo] = useState({ mandalName: "", adminName: "", mobile: "" });
    const [biometric, setBiometric] = useState(false);
    const [backupStatus, setBackupStatus] = useState<BackupStatus>({});
    const [pinSheet, setPinSheet] = useState(false);
    const [pins, setPins] = useState({ current: "", next: "", confirm: "" });
    const [busy, setBusy] = useState<string | null>(null);
    const [restore, setRestore] = useState<BackupValidation | null>(null);
    const [startPick, setStartPick] = useState<YearMonth>(() => addMonths(currentIstMonth(), -1));

    const refreshLocal = useCallback(() => {
        readSetup().then((value) => {
            setSetup(value);
            if (value) setInfo({ mandalName: value.mandalName, adminName: value.adminName, mobile: value.mobile });
        });
        AsyncStorage.getItem(KEYS.biometricEnabled).then((v) => setBiometric(v === "true"));
        readBackupStatus().then(setBackupStatus);
    }, []);
    useFocusEffect(refreshLocal);

    if (error) return <DataErrorView error={error} onRetry={reload} />;
    if (!state) return <Loading />;

    const withBusy = async (key: string, task: () => Promise<void>) => {
        setBusy(key);
        try {
            await task();
        } catch (e) {
            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
            refreshLocal();
        }
    };

    const toggleBiometric = async (value: boolean) => {
        if (!value) {
            await AsyncStorage.setItem(KEYS.biometricEnabled, "false");
            setBiometric(false);
            return;
        }
        const available = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
        if (!available) {
            Alert.alert(s.settings.biometric, "Biometric unlock is not set up on this phone.");
            return;
        }
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: s.login.biometricPrompt, cancelLabel: s.login.usePin, disableDeviceFallback: true });
        if (result.success) {
            await AsyncStorage.setItem(KEYS.biometricEnabled, "true");
            setBiometric(true);
        }
    };

    const changePin = () =>
        withBusy("pin", async () => {
            if (!(await checkPin(pins.current))) throw new Error(s.settings.wrongPin);
            if (!isValidPinFormat(pins.next) || pins.next.length !== 4) throw new Error(s.settings.newPin);
            if (pins.next !== pins.confirm) throw new Error(s.settings.pinMismatch);
            await setNewPin(pins.next);
            setPins({ current: "", next: "", confirm: "" });
            setPinSheet(false);
            Alert.alert(s.settings.pinChanged);
        });

    const start = mandalStart(state);

    return (
        <Screen title={s.settings.title} onBack={() => navigation.goBack()}>
            <Card title={s.settings.mandal}>
                <Field label="Mandal name" value={info.mandalName} onChangeText={(v) => setInfo({ ...info, mandalName: v })} />
                <Field label="Admin name" value={info.adminName} onChangeText={(v) => setInfo({ ...info, adminName: v })} />
                <Field label="Mobile" value={info.mobile} onChangeText={(v) => setInfo({ ...info, mobile: v })} keyboardType="phone-pad" />
                <Row label="Recovery email" value={setup?.email ?? "-"} />
                <Button size="small" variant="secondary" label={s.common.save} busy={busy === "info"} onPress={() => withBusy("info", () => submitSetupInfo(info))} />
            </Card>

            <Card title={s.settings.startMonth}>
                {start ? (
                    <Row label={s.settings.startMonth} value={s.monthLabel(start.year, start.month)} />
                ) : (
                    <>
                        <Note tone="warning">{s.home.noStartMonth}</Note>
                        <MonthSelector
                            label={s.monthLabel(startPick.year, startPick.month)}
                            onPrev={() => setStartPick((m) => addMonths(m, -1))}
                            onNext={() => setStartPick((m) => addMonths(m, 1))}
                        />
                        <Button size="small" label={s.common.save} busy={busy === "start"} onPress={() => withBusy("start", async () => { await submitMandalStart(startPick); })} />
                    </>
                )}
            </Card>

            <Card title={s.settings.security}>
                <Button variant="secondary" label={s.settings.changePin} onPress={() => setPinSheet(true)} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Note>{s.settings.biometric}</Note>
                    <Switch value={biometric} onValueChange={(v) => void toggleBiometric(v)} />
                </View>
                <Note>{s.settings.securityNotes}</Note>
            </Card>

            <Card title={s.settings.language}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                        <Button size="small" variant={language === "English" ? "primary" : "secondary"} label="English" onPress={() => void changeLanguage("English")} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Button size="small" variant={language === "Gujarati" ? "primary" : "secondary"} label="ગુજરાતી" onPress={() => void changeLanguage("Gujarati")} />
                    </View>
                </View>
            </Card>

            <Card title={s.settings.backup}>
                {backupStatus.lastCompleted ? (
                    <Note>
                        {`Last completed: ${formatIstDateTime(backupStatus.lastCompleted.at)} (${backupStatus.lastCompleted.kind}), ${backupStatus.lastCompleted.payments} payments, ${money(backupStatus.lastCompleted.totalReceivedPaise)}`}
                    </Note>
                ) : (
                    <Note tone="warning">No completed backup yet.</Note>
                )}
                {backupStatus.lastAttempt && !backupStatus.lastAttempt.ok ? (
                    <Note tone="danger">{`Last attempt failed ${formatIstDateTime(backupStatus.lastAttempt.at)}: ${backupStatus.lastAttempt.error ?? ""}`}</Note>
                ) : null}
                <Button
                    label={s.settings.exportBackup}
                    busy={busy === "backup"}
                    onPress={() =>
                        withBusy("backup", async () => {
                            await createAndShareLocalBackup();
                            Alert.alert(s.settings.backupSaved);
                        })
                    }
                />
                <Button
                    variant="secondary"
                    label={s.settings.restoreBackup}
                    busy={busy === "restore"}
                    onPress={() =>
                        withBusy("restore", async () => {
                            const picked = await pickBackupFile();
                            if (picked) setRestore(picked);
                        })
                    }
                />
            </Card>

            <CloudBackupSection onRestore={setRestore} onStatusChanged={refreshLocal} />
            <ReminderSection />

            <Card title={s.settings.about}>
                <Row label="My Mandal" value={`v${APP_VERSION}`} />
            </Card>

            <RestoreDialog validation={restore} reason="Restore from Settings" onClose={() => setRestore(null)} />

            <Sheet visible={pinSheet} title={s.settings.changePin} onClose={() => setPinSheet(false)}>
                <Field label={s.settings.currentPin} value={pins.current} onChangeText={(v) => setPins({ ...pins, current: v })} keyboardType="number-pad" secureTextEntry maxLength={4} />
                <Field label={s.settings.newPin} value={pins.next} onChangeText={(v) => setPins({ ...pins, next: v })} keyboardType="number-pad" secureTextEntry maxLength={4} />
                <Field label={s.settings.confirmPin} value={pins.confirm} onChangeText={(v) => setPins({ ...pins, confirm: v })} keyboardType="number-pad" secureTextEntry maxLength={4} />
                <Button label={s.common.save} onPress={() => void changePin()} busy={busy === "pin"} />
            </Sheet>
        </Screen>
    );
}
