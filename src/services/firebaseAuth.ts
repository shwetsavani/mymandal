import {
    signInWithEmailAndPassword,
    sendEmailVerification,
    signOut,
    verifyBeforeUpdateEmail,
} from "firebase/auth";

import { auth } from "./firebase";

export async function signInRecoveryAccount(
    email: string,
    password: string
) {
    if (!auth) {
        throw new Error(
            "Firebase Auth is not initialized."
        );
    }

    if (
        typeof signInWithEmailAndPassword !==
        "function"
    ) {
        throw new Error(
            "Firebase Auth signInWithEmailAndPassword is unavailable. Please restart Expo with a cleared cache."
        );
    }

    const credential =
        await signInWithEmailAndPassword(
            auth,
            email.trim(),
            password
        );

    return credential.user;
}

export async function sendRecoveryEmailVerification() {
    const user = auth.currentUser;

    if (!user) {
        throw new Error(
            "No Firebase recovery account is signed in."
        );
    }

    if (
        typeof sendEmailVerification !==
        "function"
    ) {
        throw new Error(
            "Firebase email verification is unavailable."
        );
    }

    await sendEmailVerification(user);

    return true;
}

export async function refreshRecoveryVerificationStatus() {
    const user = auth.currentUser;

    if (!user) {
        return false;
    }

    await user.reload();

    return auth.currentUser?.emailVerified === true;
}

export async function requestRecoveryEmailChange(
    newEmail: string
) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error(
            "No Firebase recovery account is signed in."
        );
    }

    if (
        typeof verifyBeforeUpdateEmail !==
        "function"
    ) {
        throw new Error(
            "Firebase email-change verification is unavailable."
        );
    }

    await verifyBeforeUpdateEmail(
        user,
        newEmail.trim()
    );

    return true;
}

export async function signOutRecoveryAccount() {
    await signOut(auth);
}