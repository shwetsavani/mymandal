import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { MandalSetup } from "../domain/types";
import { KEYS } from "../storage/keys";
import { readSetup } from "../storage/repository";
import { commitJournaled, withStorageLock } from "../storage/safeStorage";

export const PIN_VERIFIER_KEY = "mandal_pin_verifier_v1";

/**
 * PBKDF2-HMAC-SHA256 with a random 16-byte salt. The iteration count is stored
 * with each verifier so it can be raised later without breaking old PINs.
 * A 4–6 digit PIN has a small keyspace; key stretching slows offline guessing
 * but cannot make a short PIN strong. Device protection is still required.
 */
export const DEFAULT_PIN_ITERATIONS = 25_000;

export type PinVerifier = {
    v: 1;
    algo: "pbkdf2-sha256";
    iterations: number;
    salt: string;
    hash: string;
    createdAt: string;
};

export const isValidPinFormat = (pin: string): boolean => /^\d{4,6}$/.test(pin);

const derive = async (pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> =>
    pbkdf2Async(sha256, utf8ToBytes(pin), salt, { c: iterations, dkLen: 32, asyncTick: 20 });

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
};

export const createPinVerifier = async (pin: string, iterations = DEFAULT_PIN_ITERATIONS): Promise<PinVerifier> => {
    if (!isValidPinFormat(pin)) {
        throw new Error("PIN must be 4 to 6 digits.");
    }
    const salt = Crypto.getRandomBytes(16);
    const hash = await derive(pin, salt, iterations);
    return {
        v: 1,
        algo: "pbkdf2-sha256",
        iterations,
        salt: bytesToHex(salt),
        hash: bytesToHex(hash),
        createdAt: new Date().toISOString(),
    };
};

export const verifyPinAgainst = async (pin: string, verifier: PinVerifier): Promise<boolean> => {
    if (verifier.algo !== "pbkdf2-sha256" || !verifier.salt || !verifier.hash) {
        return false;
    }
    const computed = await derive(pin, hexToBytes(verifier.salt), verifier.iterations);
    return constantTimeEqual(computed, hexToBytes(verifier.hash));
};

const parseVerifier = (raw: string | null): PinVerifier | null => {
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as PinVerifier;
        return parsed && parsed.algo === "pbkdf2-sha256" && typeof parsed.hash === "string" ? parsed : null;
    } catch {
        return null;
    }
};

export const readPinVerifier = async (): Promise<PinVerifier | null> =>
    parseVerifier(await SecureStore.getItemAsync(PIN_VERIFIER_KEY));

/** Stores a verifier and confirms it reads back identically. */
const storeVerifierVerified = async (verifier: PinVerifier, pin: string): Promise<void> => {
    const serialized = JSON.stringify(verifier);
    await SecureStore.setItemAsync(PIN_VERIFIER_KEY, serialized);
    const readBack = parseVerifier(await SecureStore.getItemAsync(PIN_VERIFIER_KEY));
    if (!readBack || JSON.stringify(readBack) !== serialized || !(await verifyPinAgainst(pin, readBack))) {
        throw new Error("Stored PIN verifier could not be confirmed.");
    }
};

const removePlaintextPin = async (setup: MandalSetup): Promise<void> => {
    const { pin: _pin, ...rest } = setup;
    const next: MandalSetup = { ...rest, pinMigratedAt: new Date().toISOString() };
    await commitJournaled("pin-migration", { [KEYS.setup]: JSON.stringify(next) });
};

export type PinMigrationResult = "no_setup" | "already_migrated" | "migrated" | "kept_plaintext";

/**
 * Moves the legacy plaintext PIN to a salted PBKDF2 verifier in SecureStore.
 * The plaintext PIN is removed only after the stored verifier is read back
 * and successfully verifies that same PIN. If anything fails, the plaintext
 * PIN is kept so the existing PIN continues to work, and migration retries on
 * the next start.
 */
export const migratePlaintextPin = async (): Promise<PinMigrationResult> =>
    withStorageLock(async () => {
        const setup = await readSetup();
        if (!setup) {
            return "no_setup";
        }
        if (!setup.pin) {
            return "already_migrated";
        }
        try {
            let verifier = await readPinVerifier();
            if (!verifier || !(await verifyPinAgainst(setup.pin, verifier))) {
                verifier = await createPinVerifier(setup.pin);
                await storeVerifierVerified(verifier, setup.pin);
            }
            await removePlaintextPin(setup);
            return "migrated";
        } catch (error) {
            console.error("PIN migration deferred:", error);
            return "kept_plaintext";
        }
    });

/**
 * Verifies a PIN. Uses the SecureStore verifier; only if the migration has not
 * completed yet does it fall back to the legacy plaintext PIN.
 */
export const checkPin = async (pin: string): Promise<boolean> => {
    const verifier = await readPinVerifier();
    if (verifier) {
        if (await verifyPinAgainst(pin, verifier)) {
            return true;
        }
    }
    const setup = await readSetup();
    if (setup?.pin) {
        return setup.pin === pin;
    }
    return false;
};

export const hasPinConfigured = async (): Promise<boolean> => {
    if (await readPinVerifier()) {
        return true;
    }
    const setup = await readSetup();
    return Boolean(setup?.pin);
};

/** Sets a new PIN (setup, change PIN, or verified recovery). */
export const setNewPin = async (pin: string): Promise<void> => {
    const verifier = await createPinVerifier(pin);
    await withStorageLock(async () => {
        await storeVerifierVerified(verifier, pin);
        const setup = await readSetup();
        if (setup?.pin) {
            await removePlaintextPin(setup);
        }
    });
};