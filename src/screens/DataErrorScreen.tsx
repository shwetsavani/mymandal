import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Alert } from "react-native";

import { useStrings } from "../localization/strings";
import { KEYS } from "../storage/keys";
import { Button, Card, Note, Screen } from "../ui/components";

const RAW_KEYS = [
    KEYS.members,
    KEYS.obligations,
    KEYS.payments,
    KEYS.waivers,
    KEYS.auditLog,
    KEYS.settings,
    KEYS.schemaVersion,
    KEYS.journal,
    KEYS.premigrationSnapshot,
    KEYS.restoreSnapshots,
    KEYS.deletedMembers,
];

/** Saves the raw stored strings (no PIN, no credentials) so data can be recovered manually. */
export const exportRawData = async (): Promise<void> => {
    const pairs = await AsyncStorage.multiGet(RAW_KEYS);
    const setupRaw = await AsyncStorage.getItem(KEYS.setup);
    let setup: unknown = null;
    try {
        const parsed = setupRaw ? JSON.parse(setupRaw) : null;
        if (parsed && typeof parsed === "object") {
            const { pin: _pin, ...rest } = parsed as Record<string, unknown>;
            setup = rest;
        }
    } catch {
        setup = "unparsable";
    }
    const payload = JSON.stringify({ kind: "my-mandal-raw-storage", exportedAt: new Date().toISOString(), setup, raw: Object.fromEntries(pairs) });
    const uri = `${FileSystem.cacheDirectory}my-mandal-raw-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(uri, payload, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "My Mandal raw data" });
};

export function DataErrorView(props: { error: Error; onRetry: () => void }) {
    const s = useStrings();
    const [busy, setBusy] = useState(false);
    return (
        <Screen title={s.recovery.title}>
            <Card tone="danger">
                <Note tone="danger">{s.recovery.message}</Note>
                <Note>{props.error.message}</Note>
            </Card>
            <Button label={s.common.retry} onPress={props.onRetry} />
            <Button
                variant="secondary"
                busy={busy}
                label={s.recovery.exportRaw}
                onPress={async () => {
                    setBusy(true);
                    try {
                        await exportRawData();
                    } catch (e) {
                        Alert.alert(s.common.error, String(e));
                    } finally {
                        setBusy(false);
                    }
                }}
            />
        </Screen>
    );
}

export default DataErrorView;
