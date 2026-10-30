import AsyncStorage from "@react-native-async-storage/async-storage";

import { KEYS } from "../storage/keys";

/**
 * Local PIN attempt throttling.
 *
 * Limitations (by design, documented to the user): this is a local deterrent,
 * not tamper-proof. Someone who can clear app data, restore an old copy of
 * app storage, or move the clock forward can shorten a lockout. Clock moves
 * backwards are detected and do not shorten an active lockout, and within a
 * running app session lockouts are also measured with a monotonic clock.
 */
export type ThrottleState = {
    v: 2;
    /** Failures since the last successful unlock (never reset by time). */
    failures: number;
    /** Number of lockouts imposed since the last successful unlock. */
    lockouts: number;
    lockUntil: number;
    /** Highest wall-clock time seen; used to detect the clock moving backwards. */
    lastSeenAt: number;
};

export const FAILURES_PER_LOCKOUT = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

export const initialThrottle = (): ThrottleState => ({ v: 2, failures: 0, lockouts: 0, lockUntil: 0, lastSeenAt: 0 });

export const lockDurationFor = (lockouts: number): number =>
    Math.min(MAX_LOCK_MS, BASE_LOCK_MS * Math.pow(4, Math.max(0, lockouts - 1)));

/** Normalizes state for the current clock reading. */
export const observeClock = (state: ThrottleState, now: number): ThrottleState => {
    if (state.lastSeenAt > 0 && now < state.lastSeenAt - 60_000 && state.lockUntil > state.lastSeenAt) {
        // Clock moved backwards during a lockout: keep the remaining duration
        // measured from the latest trusted time instead of shortening it.
        const remaining = state.lockUntil - state.lastSeenAt;
        return { ...state, lockUntil: now + remaining, lastSeenAt: now };
    }
    return { ...state, lastSeenAt: Math.max(state.lastSeenAt, now) };
};

export const remainingLockMs = (state: ThrottleState, now: number): number => Math.max(0, state.lockUntil - now);

export const registerFailure = (state: ThrottleState, now: number): ThrottleState => {
    const observed = observeClock(state, now);
    const failures = observed.failures + 1;
    if (failures % FAILURES_PER_LOCKOUT === 0) {
        const lockouts = observed.lockouts + 1;
        return { ...observed, failures, lockouts, lockUntil: now + lockDurationFor(lockouts) };
    }
    return { ...observed, failures };
};

export const registerSuccess = (now: number): ThrottleState => ({ ...initialThrottle(), lastSeenAt: now });

/** Converts the original app's stored login security record if present. */
const fromLegacy = (value: any): ThrottleState => {
    if (value && value.v === 2) {
        return value as ThrottleState;
    }
    const state = initialThrottle();
    if (value && typeof value === "object") {
        const failures = Number(value.failedAttempts ?? 0);
        const lockUntil = Number(value.lockUntil ?? 0);
        state.failures = Number.isFinite(failures) && failures > 0 ? failures : 0;
        state.lockUntil = Number.isFinite(lockUntil) && lockUntil > 0 ? lockUntil : 0;
    }
    return state;
};

export const loadThrottle = async (): Promise<ThrottleState> => {
    try {
        const raw = await AsyncStorage.getItem(KEYS.loginSecurity);
        return raw ? fromLegacy(JSON.parse(raw)) : initialThrottle();
    } catch {
        // A corrupt throttle record must not lock the owner out permanently,
        // but should not silently clear an active lockout either.
        return { ...initialThrottle(), failures: FAILURES_PER_LOCKOUT - 1 };
    }
};

export const saveThrottle = async (state: ThrottleState): Promise<void> => {
    await AsyncStorage.setItem(KEYS.loginSecurity, JSON.stringify(state));
};

/** In-session monotonic guard so changing the clock mid-session does not bypass a lockout. */
let sessionLock: { monoUntil: number } | null = null;
const monotonicNow = (): number =>
    typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

export const noteSessionLock = (durationMs: number): void => {
    sessionLock = durationMs > 0 ? { monoUntil: monotonicNow() + durationMs } : null;
};

export const sessionLockRemainingMs = (): number =>
    sessionLock ? Math.max(0, sessionLock.monoUntil - monotonicNow()) : 0;
