import React, { useEffect, useState } from "react";
import { Alert } from "react-native";

import type { BackupValidation } from "../backup/backupFormat";
import { applyRestore, previewRestore, type RestorePreview } from "../backup/restore";
import { useStrings } from "../localization/strings";
import { Button, Field, Note, Sheet } from "./components";
import { money } from "./selectors";

/**
 * Shows what a restore would change, requires typing RESTORE when the backup
 * has fewer records than the phone, and only then applies it. The restore
 * itself validates again and snapshots current data first.
 */
export function RestoreDialog(props: { validation: BackupValidation | null; onClose: () => void; reason: string }) {
    const s = useStrings();
    const [preview, setPreview] = useState<RestorePreview | null>(null);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const backup = props.validation?.backup ?? null;

    useEffect(() => {
        setPreview(null);
        setTyped("");
        if (!props.validation) return;
        if (!props.validation.ok || !backup) {
            Alert.alert(s.settings.invalidBackup, props.validation.errors.slice(0, 8).join("\n"));
            props.onClose();
            return;
        }
        previewRestore(backup)
            .then(setPreview)
            .catch((e) => {
                Alert.alert(s.settings.invalidBackup, e instanceof Error ? e.message : String(e));
                props.onClose();
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.validation]);

    if (!props.validation || !backup || !preview) return null;
    const describe = (x: RestorePreview["current"]) =>
        `${x.counts.members} members, ${x.counts.obligations} months, ${x.counts.payments} payments, ${money(x.totalReceivedPaise)}`;

    const apply = async () => {
        setBusy(true);
        try {
            await applyRestore(backup, { confirmedDestructive: preview.destructive && typed.trim() === "RESTORE", reason: props.reason });
            Alert.alert(s.settings.restored);
            props.onClose();
        } catch (e) {
            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet visible title={s.settings.restoreConfirmTitle} onClose={props.onClose}>
            <Note>{s.settings.restoreSummary(describe(preview.current), describe(preview.incoming))}</Note>
            <Note>{`${backup.source} · ${backup.createdAt}`}</Note>
            {[...props.validation.warnings, ...preview.warnings].map((w, i) => (
                <Note key={i} tone="warning">{w}</Note>
            ))}
            {preview.destructive ? (
                <>
                    <Note tone="danger">{s.settings.destructiveWarning}</Note>
                    <Field label={s.settings.typeRestore} value={typed} onChangeText={setTyped} autoCapitalize="characters" />
                </>
            ) : null}
            <Button variant="danger" label={s.common.confirm} onPress={apply} busy={busy} disabled={preview.destructive && typed.trim() !== "RESTORE"} />
        </Sheet>
    );
}
