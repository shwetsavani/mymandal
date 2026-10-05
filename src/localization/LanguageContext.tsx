import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    AppLanguage,
    getAppLanguage,
    getTranslations,
    setAppLanguage,
} from "./i18n";

type LanguageContextValue = {
    language: AppLanguage;
    t: ReturnType<typeof getTranslations>;
    changeLanguage: (language: AppLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(
    undefined
);

export function LanguageProvider({
                                     children,
                                 }: {
    children: React.ReactNode;
}) {
    const [language, setLanguage] = useState<AppLanguage>("English");

    useEffect(() => {
        let mounted = true;

        getAppLanguage().then((savedLanguage) => {
            if (mounted) {
                setLanguage(savedLanguage);
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    const changeLanguage = async (newLanguage: AppLanguage) => {
        await setAppLanguage(newLanguage);
        setLanguage(newLanguage);
    };

    const value = useMemo(
        () => ({
            language,
            t: getTranslations(language),
            changeLanguage,
        }),
        [language]
    );

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);

    if (!context) {
        throw new Error(
            "useLanguage must be used inside LanguageProvider"
        );
    }

    return context;
}