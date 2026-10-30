/* eslint-disable @typescript-eslint/no-require-imports */
// Plain-function in-memory mocks (not jest.fn) so tests can spy on and
// restore individual methods without wiping the mock implementation.
jest.mock("@react-native-async-storage/async-storage", () => {
    const store = new Map<string, string>();
    const api = {
        __store: store,
        getItem: async (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: async (key: string, value: string) => {
            store.set(key, String(value));
        },
        removeItem: async (key: string) => {
            store.delete(key);
        },
        clear: async () => {
            store.clear();
        },
        getAllKeys: async () => [...store.keys()],
        multiGet: async (keys: string[]) => keys.map((k) => [k, store.has(k) ? store.get(k)! : null]),
        multiSet: async (pairs: [string, string][]) => {
            pairs.forEach(([k, v]) => store.set(k, String(v)));
        },
        multiRemove: async (keys: string[]) => {
            keys.forEach((k) => store.delete(k));
        },
    };
    return { __esModule: true, default: api, ...api };
});

jest.mock("expo-secure-store", () => {
    const store = new Map<string, string>();
    return {
        __store: store,
        getItemAsync: async (key: string) => (store.has(key) ? store.get(key)! : null),
        setItemAsync: async (key: string, value: string) => {
            store.set(key, value);
        },
        deleteItemAsync: async (key: string) => {
            store.delete(key);
        },
        isAvailableAsync: async () => true,
    };
});

jest.mock("expo-crypto", () => {
    const nodeCrypto = require("crypto");
    return {
        getRandomBytes: (count: number) => new Uint8Array(nodeCrypto.randomBytes(count)),
        randomUUID: () => nodeCrypto.randomUUID(),
    };
});
