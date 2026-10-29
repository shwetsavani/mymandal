import AsyncStorage from "@react-native-async-storage/async-storage";

import { KEYS } from "../../src/storage/keys";
import { loadFinancialState, mutateFinancialState } from "../../src/storage/repository";
import { commitJournaled, readArray, recoverJournal, StorageReadError } from "../../src/storage/safeStorage";
import { crashAfterWrites, dumpStorage, resetStores } from "../helpers";

beforeEach(resetStores);

describe("safe storage", () => {
    test("corrupt JSON raises a recoverable error instead of returning an empty list", async () => {
        await AsyncStorage.setItem(KEYS.payments, "{not json");
        await expect(readArray(KEYS.payments)).rejects.toBeInstanceOf(StorageReadError);
        await expect(loadFinancialState()).rejects.toBeInstanceOf(StorageReadError);
        // The corrupt value is left untouched for recovery.
        expect(await AsyncStorage.getItem(KEYS.payments)).toBe("{not json");
    });

    test("a non-array value is rejected", async () => {
        await AsyncStorage.setItem(KEYS.members, JSON.stringify({ a: 1 }));
        await expect(readArray(KEYS.members)).rejects.toMatchObject({ kind: "wrong_shape" });
    });

    test("a mutation on corrupt data fails without writing anything", async () => {
        await AsyncStorage.setItem(KEYS.payments, "[broken");
        await AsyncStorage.setItem(KEYS.members, JSON.stringify([{ id: "x" }]));
        const before = await dumpStorage();
        await expect(
            mutateFinancialState("test", (state) => ({ state: { ...state, members: [] }, result: null }))
        ).rejects.toBeInstanceOf(StorageReadError);
        expect(await dumpStorage()).toEqual(before);
    });

    test("concurrent mutations are serialized and none is lost", async () => {
        const add = (id: string) =>
            mutateFinancialState("add", (state) => ({
                state: { ...state, auditLog: [...state.auditLog, { id, at: "", action: "t" }] },
                result: id,
            }));
        await Promise.all(["a", "b", "c", "d", "e"].map(add));
        const state = await loadFinancialState();
        expect(state.auditLog.map((e) => e.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    });

    test("a failed mutation does not block later mutations", async () => {
        await expect(mutateFinancialState("boom", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
        await mutateFinancialState("ok", (state) => ({
            state: { ...state, auditLog: [{ id: "ok", at: "", action: "t" }] },
            result: null,
        }));
        expect((await loadFinancialState()).auditLog).toHaveLength(1);
    });

    test("an interrupted multi-key commit is completed by journal replay", async () => {
        await AsyncStorage.setItem("k1", "old1");
        await AsyncStorage.setItem("k2", "old2");
        // journal write succeeds, k1 succeeds, crash before k2
        const restore = crashAfterWrites(2);
        await expect(commitJournaled("pair", { k1: "new1", k2: "new2" })).rejects.toThrow("Simulated crash");
        restore();
        expect(await AsyncStorage.getItem("k1")).toBe("new1");
        expect(await AsyncStorage.getItem("k2")).toBe("old2");
        const result = await recoverJournal();
        expect(result.replayed).toBe(true);
        expect(await AsyncStorage.getItem("k1")).toBe("new1");
        expect(await AsyncStorage.getItem("k2")).toBe("new2");
        expect(await AsyncStorage.getItem(KEYS.journal)).toBeNull();
        // Replaying again is a no-op.
        expect((await recoverJournal()).replayed).toBe(false);
    });

    test("a crash before the journal is written leaves all keys unchanged", async () => {
        await AsyncStorage.setItem("k1", "old1");
        const restore = crashAfterWrites(0);
        await expect(commitJournaled("pair", { k1: "new1" })).rejects.toThrow();
        restore();
        await recoverJournal();
        expect(await AsyncStorage.getItem("k1")).toBe("old1");
    });

    test("journal removals are replayed", async () => {
        await AsyncStorage.setItem("gone", "x");
        await AsyncStorage.setItem(
            KEYS.journal,
            JSON.stringify({ id: "1", label: "t", createdAt: "", writes: { gone: null, kept: "y" } })
        );
        await recoverJournal();
        expect(await AsyncStorage.getItem("gone")).toBeNull();
        expect(await AsyncStorage.getItem("kept")).toBe("y");
    });
});
