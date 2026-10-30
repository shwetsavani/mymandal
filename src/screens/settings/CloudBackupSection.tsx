import React, { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

import type { BackupValidation } from "../../backup/backupFormat";
import { formatIstDateTime } from "../../domain/calendar";
import {
    currentCloudAccount,
    downloadCloudBackup,
    listCloudBackups,
    readLegacyCloudMirror,
    signInForCloud,
    uploadCloudBackup,
    type CloudBackupMeta,
} from "../../services/cloudBackup";
import { Button, Card, Field, Note, Row } from "../../ui/components";
import { money } from "../../ui/selectors";

/**
 * Manual cloud backup. Nothing is uploaded automatically; an upload is
 * reported as complete only after every part was written and read back.
 */
export function CloudBackupSection(props: { onRestore: (validation: BackupValidation) => void; onStatusChanged: () => void }) {
    const [account, setAccount] = useState(currentCloudAccount());
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    const [backups, setBackups] = useState<CloudBackupMeta[] | null>(null);

    const refresh = useCallback(() => setAccount(currentCloudAccount()), []);
    useEffect(refresh, [refresh]);

    const run = async (key: string, task: () => Promise<void>) => {
        setBusy(key);
        try {
            await task();
        } catch (e) {
            Alert.alert("Cloud backup", e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
            refresh();
            props.onStatusChanged();
        }
    };

    return (
        <Card title="Cloud backup (Firebase)">
            <Note>
                Backups are uploaded only when you tap the button below. Each backup is a separate copy; older copies are never overwritten.
                Firebase usage may have limits or costs depending on your Firebase plan.
            </Note>
            {account ? (
                <Row label="Signed in" value={`${account.email ?? ""}${account.verified ? "" : " (not verified)"}`} />
            ) : (
                <>
                    <Field label="Recovery account password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
                    <Button
                        size="small"
                        variant="secondary"
                        label="Sign in"
                        busy={busy === "signin"}
                        onPress={() =>
                            run("signin", async () => {
                                await signInForCloud(password);
                                setPassword("");
                            })
                        }
                    />
                </>
            )}
            <Button
                label="Back up now"
                disabled={!account}
                busy={busy === "upload"}
                onPress={() =>
                    run("upload", async () => {
                        const meta = await uploadCloudBackup();
                        Alert.alert(
                            "Cloud backup complete",
                            `${meta.counts.members} members, ${meta.counts.payments} payments, ${money(meta.totalReceivedPaise)} received.\nSaved ${formatIstDateTime(meta.createdAt)}.`
                        );
                    })
                }
            />
            <Button
                variant="secondary"
                label="Restore from a cloud backup"
                disabled={!account}
                busy={busy === "list"}
                onPress={() => run("list", async () => setBackups(await listCloudBackups()))}
            />
            {backups?.length === 0 ? <Note>No completed cloud backups found.</Note> : null}
            {backups?.slice(0, 10).map((b) => (
                <Button
                    key={b.id}
                    size="small"
                    variant="secondary"
                    label={`${formatIstDateTime(b.createdAt)} · ${b.counts.payments} payments · ${money(b.totalReceivedPaise)}`}
                    busy={busy === b.id}
                    onPress={() => run(b.id, async () => props.onRestore(await downloadCloudBackup(b.id)))}
                />
            ))}
            <Button
                size="small"
                variant="secondary"
                label="Restore from old cloud mirror (unverified)"
                disabled={!account}
                busy={busy === "legacy"}
                onPress={() => run("legacy", async () => props.onRestore(await readLegacyCloudMirror()))}
            />
        </Card>
    );
}
