import React, { useEffect, useState } from "react";
import { Alert } from "react-native";

import { assessRecoveryIdentity } from "../backup/cloudChunks";
import { useStrings } from "../localization/strings";
import { registerSuccess, saveThrottle } from "../security/loginThrottle";
import { isValidPinFormat, setNewPin } from "../security/pinVerifier";
import { signInRecoveryAccount } from "../services/firebaseAuth";
import { loadFinancialState, readSetup } from "../storage/repository";
import { Button, Card, Field, Note, Row, Screen } from "../ui/components";

/**
 * PIN reset requires a FRESH Firebase sign-in with the recovery account's
 * password. A persisted session or a typed email address alone is never
 * accepted. The account must be email-verified, match the recovery email
 * saved on this phone, and match the cloud owner if one is recorded.
 */
export default function ForgotPinScreen(props: { onDone: () => void }) {
    const s = useStrings();
    const [email, setEmail] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [verified, setVerified] = useState(false);
    const [pin, setPin] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        readSetup().then((setup) => setEmail(setup?.email ?? null)).catch(() => setEmail(null));
    }, []);

    const verify = async () => {
        if (!email) return;
        setBusy(true);
        try {
            const user = await signInRecoveryAccount(email, password);
            await user.reload();
            const state = await loadFinancialState();
            const verdict = assessRecoveryIdentity(
                { uid: user.uid, email: user.email, emailVerified: user.emailVerified },
                email,
                state.settings.cloudOwnerUid
            );
            if (!verdict.ok) throw new Error(verdict.reason);
            setPassword("");
            setVerified(true);
        } catch (e) {
            const code = (e as { code?: string })?.code;
            Alert.alert(
                s.common.error,
                code === "auth/invalid-credential" || code === "auth/wrong-password"
                    ? "The password is incorrect."
                    : code === "auth/too-many-requests"
                      ? "Too many attempts. Please wait and try again."
                      : code === "auth/network-request-failed"
                        ? "No internet connection. Recovery needs internet."
                        : e instanceof Error
                          ? e.message
                          : String(e)
            );
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (!isValidPinFormat(pin) || pin.length !== 4) return Alert.alert(s.common.error, s.settings.newPin);
        if (pin !== confirm) return Alert.alert(s.common.error, s.settings.pinMismatch);
        setBusy(true);
        try {
            await setNewPin(pin);
            await saveThrottle(registerSuccess(Date.now()));
            Alert.alert(s.settings.pinChanged);
            props.onDone();
        } catch (e) {
            Alert.alert(s.common.error, e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Screen title={s.login.forgotPin} onBack={props.onDone}>
            {!email ? (
                <Card tone="warning">
                    <Note tone="warning">No recovery email is saved on this phone, so the PIN cannot be reset from the app.</Note>
                </Card>
            ) : !verified ? (
                <Card>
                    <Note>Sign in with the recovery account password. This needs internet.</Note>
                    <Row label="Recovery email" value={email} />
                    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
                    <Button label="Verify" onPress={() => void verify()} busy={busy} disabled={!password} />
                </Card>
            ) : (
                <Card>
                    <Field label={s.settings.newPin} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={4} />
                    <Field label={s.settings.confirmPin} value={confirm} onChangeText={setConfirm} keyboardType="number-pad" secureTextEntry maxLength={4} />
                    <Button label={s.common.save} onPress={() => void save()} busy={busy} />
                </Card>
            )}
        </Screen>
    );
}
