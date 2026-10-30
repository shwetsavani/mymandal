import AsyncStorage from "@react-native-async-storage/async-storage";

import { STRINGS } from "../../src/localization/strings";
import { checkPin, createInitialSetup, migratePlaintextPin, readPinVerifier, setNewPin, SetupExistsError } from "../../src/security/pinVerifier";
import { submitSetupInfo } from "../../src/services/financeService";
import { KEYS } from "../../src/storage/keys";
import { readSetup } from "../../src/storage/repository";
import { StorageReadError } from "../../src/storage/safeStorage";
import { dumpStorage, resetStores } from "../helpers";

const LEGACY_SETUP = { mandalName: "My Mandal", adminName: "Shwet", mobile: "9974983244", email: "admin@example.com", pin: "4826", createdAt: "2026-09-01T00:00:00.000Z" };
const DETAILS = { mandalName: "Test Mandal", adminName: "Tester", mobile: "9999999999", email: "test@example.com", createdAt: "2026-10-30T00:00:00.000Z" };

beforeEach(resetStores);

describe("reading the setup record", () => {
    test("no record means a fresh install", async () => {
        expect(await readSetup()).toBeNull();
    });

    test("an existing legacy record is returned unchanged", async () => {
        await AsyncStorage.setItem(KEYS.setup, JSON.stringify(LEGACY_SETUP));
        expect(await readSetup()).toEqual(LEGACY_SETUP);
    });

    test.each([
        ["corrupt JSON", "{not json", "corrupt"],
        ["null", "null", "wrong_shape"],
        ["an array", "[]", "wrong_shape"],
        ["a number", "5", "wrong_shape"],
        ["an empty object", "{}", "wrong_shape"],
    ])("%s is a recovery error, not a fresh install", async (_label, raw, kind) => {
        await AsyncStorage.setItem(KEYS.setup, raw);
        await expect(readSetup()).rejects.toMatchObject({ name: "StorageReadError", kind });
        expect(await AsyncStorage.getItem(KEYS.setup)).toBe(raw);
    });

    test("startup PIN migration stops on an invalid record without writing anything", async () => {
        await AsyncStorage.setItem(KEYS.setup, "[]");
        const before = await dumpStorage();
        await expect(migratePlaintextPin()).rejects.toBeInstanceOf(StorageReadError);
        expect(await dumpStorage()).toEqual(before);
    });
});

describe("first-time setup write", () => {
    test("creates the setup and a working PIN on a fresh install", async () => {
        await createInitialSetup(DETAILS, "1357");
        expect(await readSetup()).toEqual(DETAILS);
        expect(await AsyncStorage.getItem(KEYS.biometricEnabled)).toBe("false");
        expect(await checkPin("1357")).toBe(true);
        expect(await checkPin("0000")).toBe(false);
    });

    test("never overwrites an existing setup or its current PIN", async () => {
        await AsyncStorage.setItem(KEYS.setup, JSON.stringify(LEGACY_SETUP));
        await expect(createInitialSetup(DETAILS, "1357")).rejects.toBeInstanceOf(SetupExistsError);
        expect(JSON.parse((await AsyncStorage.getItem(KEYS.setup))!)).toEqual(LEGACY_SETUP);
        expect(await readPinVerifier()).toBeNull();
        expect(await checkPin("4826")).toBe(true);
        expect(await checkPin("1357")).toBe(false);
    });

    test("also refuses when the existing record is invalid", async () => {
        await AsyncStorage.setItem(KEYS.setup, "{not json");
        await expect(createInitialSetup(DETAILS, "1357")).rejects.toBeInstanceOf(SetupExistsError);
        expect(await AsyncStorage.getItem(KEYS.setup)).toBe("{not json");
        expect(await readPinVerifier()).toBeNull();
    });

    test("rejects a PIN that is not exactly 4 digits", async () => {
        await expect(createInitialSetup(DETAILS, "12345")).rejects.toThrow(/4 digits/);
        await expect(createInitialSetup(DETAILS, "12a4")).rejects.toThrow(/4 digits/);
        expect(await AsyncStorage.getItem(KEYS.setup)).toBeNull();
    });

    test("legitimate updates of an existing setup still work", async () => {
        await createInitialSetup(DETAILS, "1357");
        await submitSetupInfo({ mandalName: "Renamed", adminName: "Tester", mobile: "9999999999" });
        await setNewPin("2468");
        expect(await readSetup()).toMatchObject({ mandalName: "Renamed", email: DETAILS.email });
        expect(await checkPin("2468")).toBe(true);
    });
});

describe("setup screen text", () => {
    test("every setup label, placeholder and message is real text in English and Gujarati", () => {
        const en = STRINGS.English.setup as Record<string, string>;
        const gu = STRINGS.Gujarati.setup as Record<string, string>;
        expect(Object.keys(gu).sort()).toEqual(Object.keys(en).sort());
        for (const strings of [en, gu]) {
            for (const [key, value] of Object.entries(strings)) {
                expect(typeof value).toBe("string");
                expect(value.trim().length).toBeGreaterThan(0);
                expect(value).not.toMatch(new RegExp(`^setup\\.|^${key}$`));
            }
        }
    });
});
