import Constants from "expo-constants";

export const isDevelopmentVariant = Constants.expoConfig?.extra?.appVariant === "development";

/**
 * Development builds, Expo Go and any JavaScript served by a dev server must
 * never write to the production Firebase project.
 */
export const cloudWritesAllowed = (): boolean => !__DEV__ && !isDevelopmentVariant;
