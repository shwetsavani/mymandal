import AsyncStorage from "@react-native-async-storage/async-storage";

export const resetStores = async (): Promise<void> => {
    jest.restoreAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await AsyncStorage.clear();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("expo-secure-store").__store as Map<string, string>).clear();
};

export const dumpStorage = async (): Promise<Record<string, string | null>> => {
    const keys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(keys);
    return Object.fromEntries(pairs);
};

/**
 * Makes AsyncStorage.setItem fail (simulating the app being killed) after
 * `allowed` successful writes. Returns a function that restores normal writes.
 */
export const crashAfterWrites = (allowed: number): (() => void) => {
    const original = AsyncStorage.setItem.bind(AsyncStorage);
    let count = 0;
    const spy = jest.spyOn(AsyncStorage, "setItem").mockImplementation(async (key: string, value: string) => {
        count += 1;
        if (count > allowed) {
            throw new Error(`Simulated crash before write #${count} (${key})`);
        }
        return original(key, value);
    });
    return () => spy.mockRestore();
};
