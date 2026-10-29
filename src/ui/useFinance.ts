import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { istDateKey } from "../domain/calendar";
import type { FinancialState } from "../domain/types";
import { loadCurrentState } from "../services/financeService";
import { subscribeFinancialChanges } from "../storage/repository";

/**
 * Loads financial state (generating missing obligations first) and refreshes
 * on screen focus, financial changes, return to foreground, and when the India
 * date changes while the screen is open.
 */
export const useFinance = () => {
    const [state, setState] = useState<FinancialState | null>(null);
    const [asOf, setAsOf] = useState(() => Date.now());
    const [error, setError] = useState<Error | null>(null);
    const loadingRef = useRef(false);
    const pendingRef = useRef(false);
    const dateKeyRef = useRef(istDateKey(Date.now()));

    const reload = useCallback(async () => {
        if (loadingRef.current) {
            pendingRef.current = true;
            return;
        }
        loadingRef.current = true;
        try {
            do {
                pendingRef.current = false;
                const now = Date.now();
                const next = await loadCurrentState(now);
                setState(next);
                setAsOf(now);
                setError(null);
                dateKeyRef.current = istDateKey(now);
            } while (pendingRef.current);
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            loadingRef.current = false;
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void reload();
        }, [reload])
    );

    useEffect(() => {
        const unsubscribe = subscribeFinancialChanges(() => void reload());
        const appStateSub = AppState.addEventListener("change", (next) => {
            if (next === "active") void reload();
        });
        const timer = setInterval(() => {
            if (istDateKey(Date.now()) !== dateKeyRef.current) void reload();
            else setAsOf(Date.now());
        }, 60_000);
        return () => {
            unsubscribe();
            appStateSub.remove();
            clearInterval(timer);
        };
    }, [reload]);

    return { state, asOf, error, reload };
};
