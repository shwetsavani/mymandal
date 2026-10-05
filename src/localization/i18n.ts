import AsyncStorage from "@react-native-async-storage/async-storage";
import { en } from "./en";
import { gu } from "./gu";

export type AppLanguage = "English" | "Gujarati";

export const APP_LANGUAGE_KEY = "mandal_app_language";

export const translations = {
    English: en,
    Gujarati: gu,
};

export async function getAppLanguage(): Promise<AppLanguage> {
    const saved = await AsyncStorage.getItem(APP_LANGUAGE_KEY);

    return saved === "Gujarati" ? "Gujarati" : "English";
}

export async function setAppLanguage(
    language: AppLanguage
): Promise<void> {
    await AsyncStorage.setItem(APP_LANGUAGE_KEY, language);
}

export function getTranslations(language: AppLanguage) {
    return translations[language];
}