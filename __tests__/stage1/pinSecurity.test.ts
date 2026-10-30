import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
    initialThrottle,
    lockDurationFor,
    observeClock,
    registerFailure,
    registerSuccess,
    remainingLockMs,
} from "../../src/security/loginThrottle";
import { checkPin, migratePlaintextPin, PIN_VERIFIER_KEY, readPinVerifier, setNewPin } from "../../src/security/pinVerifier";
import { KEYS } from "../../src/storage/keys";
import { runMigrations } from "../../src/storage/migrations";
import { LEGACY_PIN, seedLegacyStorage } from "../fixtures/legacyDataset";
import { resetStores } from "../helpers";

beforeEach(resetStores);

const setupJson = async () => JSON.parse((await AsyncStorage.getItem(KEYS.setup))!);

describe("PIN migration", () => {
    test("the current PIN works before, during and after migration", async () => {
        await seedLegacyStorage();
        await runMigrations();
        expect(await checkPin(LEGACY_PIN)).toBe(true);
        expect(await migratePlaintextPin()).toBe("migrated");
        expect(await checkPin(LEGACY_PIN)).toBe(true);
        expect(await checkPin("0000")).toBe(false);
        const setup = await setupJson();
        expect(setup.pin).toBeUndefined();
        expect(setup.mandalName).toBe("Test Mandal");
        const verifier = await readPinVerifier();
        expect(verifier).toMatchObject({ algo: "pbkdf2-sha256", iterations: 25000 });
        expect(verifier!.salt).toHaveLength(32);
        expect(JSON.stringify(verifier)).not.toContain(LEGACY_PIN);
        expect(await migratePlaintextPin()).toBe("already_migrated");
    });

    test("keeps the plaintext PIN when SecureStore fails, so login still works", async () => {
        await seedLegacyStorage();
        jest.spyOn(SecureStore, "setItemAsync").mockRejectedValueOnce(new Error("keystore unavailable"));
        expect(await migratePlaintextPin()).toBe("kept_plaintext");
        expect((await setupJson()).pin).toBe(LEGACY_PIN);
        expect(await checkPin(LEGACY_PIN)).toBe(true);
        expect(await migratePlaintextPin()).toBe("migrated");
        expect(await checkPin(LEGACY_PIN)).toBe(true);
    });

    test("keeps the plaintext PIN when the stored verifier does not read back", async () => {
        await seedLegacyStorage();
        jest.spyOn(SecureStore, "getItemAsync").mockImplementation(async (key: string) =>
            key === PIN_VERIFIER_KEY ? "{\"algo\":\"pbkdf2-sha256\",\"hash\":\"00\",\"salt\":\"00\",\"iterations\":1}" : null
        );
        expect(await migratePlaintextPin()).toBe("kept_plaintext");
        expect((await setupJson()).pin).toBe(LEGACY_PIN);
    });

    test("an interrupted migration (verifier stored, plaintext not yet removed) still accepts the PIN and completes", async () => {
        await seedLegacyStorage();
        const original = AsyncStorage.setItem.bind(AsyncStorage);
        const spy = jest.spyOn(AsyncStorage, "setItem").mockImplementation(async (key, value) => {
            if (key === KEYS.journal) throw new Error("crash");
            return original(key, value);
        });
        expect(await migratePlaintextPin()).toBe("kept_plaintext");
        spy.mockRestore();
        expect(await readPinVerifier()).not.toBeNull();
        expect(await checkPin(LEGACY_PIN)).toBe(true);
        expect(await migratePlaintextPin()).toBe("migrated");
        expect((await setupJson()).pin).toBeUndefined();
    });

    test("setting a new PIN replaces the old one", async () => {
        await seedLegacyStorage();
        await migratePlaintextPin();
        await setNewPin("135790");
        expect(await checkPin("135790")).toBe(true);
        expect(await checkPin(LEGACY_PIN)).toBe(false);
    });

    test("rejects invalid PIN formats", async () => {
        await expect(setNewPin("12a4")).rejects.toThrow();
        await expect(setNewPin("123")).rejects.toThrow();
    });
});

describe("login throttling", () => {
    test("locks after 5 failures and escalates", () => {
        let state = initialThrottle();
        const now = 1_000_000;
        for (let i = 0; i < 4; i++) state = registerFailure(state, now);
        expect(remainingLockMs(state, now)).toBe(0);
        state = registerFailure(state, now);
        expect(remainingLockMs(state, now)).toBe(lockDurationFor(1));
        const later = now + lockDurationFor(1) + 1;
        for (let i = 0; i < 5; i++) state = registerFailure(state, later);
        expect(remainingLockMs(state, later)).toBe(lockDurationFor(2));
        expect(lockDurationFor(2)).toBeGreaterThan(lockDurationFor(1));
    });

    test("moving the clock backwards does not shorten a lockout", () => {
        let state = initialThrottle();
        const now = 10_000_000;
        for (let i = 0; i < 5; i++) state = registerFailure(state, now);
        const remaining = remainingLockMs(state, now);
        const rewound = now - 3_600_000;
        state = observeClock(state, rewound);
        expect(remainingLockMs(state, rewound)).toBe(remaining);
    });

    test("success resets counters", () => {
        let state = registerFailure(initialThrottle(), 1);
        state = registerSuccess(2);
        expect(state.failures).toBe(0);
        expect(state.lockUntil).toBe(0);
    });
});
