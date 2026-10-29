/**
 * Financial calendar helpers. All financial boundaries use Asia/Kolkata
 * (UTC+05:30, no daylight saving), independent of the phone's timezone.
 */
export const IST_OFFSET_MS = 330 * 60 * 1000;

export type YearMonth = { year: number; month: number };

export type IstParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
};

export const toMillis = (value: Date | number | string): number => {
    const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(ms)) {
        throw new Error(`Invalid date value: ${String(value)}`);
    }
    return ms;
};

export const istParts = (value: Date | number | string): IstParts => {
    const shifted = new Date(toMillis(value) + IST_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
    };
};

/** Instant (ms) of the given India wall-clock time. */
export const istInstant = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
    Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS;

export const daysInMonth = (year: number, month: number): number =>
    new Date(Date.UTC(year, month, 0)).getUTCDate();

export const monthIndex = (ym: YearMonth): number => ym.year * 12 + (ym.month - 1);

export const fromMonthIndex = (index: number): YearMonth => ({
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
});

export const addMonths = (ym: YearMonth, count: number): YearMonth => fromMonthIndex(monthIndex(ym) + count);

export const compareYearMonth = (a: YearMonth, b: YearMonth): number => monthIndex(a) - monthIndex(b);

export const currentIstMonth = (now: number = Date.now()): YearMonth => {
    const parts = istParts(now);
    return { year: parts.year, month: parts.month };
};

export const istDateKey = (value: Date | number | string): string => {
    const p = istParts(value);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

/**
 * Penalty boundaries for an obligation month, as instants (00:00 India time)
 * up to and including `until`.
 *
 * Original month: days 16, 21, 26.
 * Every later month: days 1, 6, 11, 16, 21, 26 (last band runs to month end;
 * no extra step on day 31; February simply ends earlier).
 */
export const penaltyBoundaries = (obligation: YearMonth, until: number): number[] => {
    const result: number[] = [];
    let cursor: YearMonth = obligation;
    let first = true;
    // Safety limit: 100 years of monthly boundaries.
    for (let guard = 0; guard < 1200; guard++) {
        const days = first ? [16, 21, 26] : [1, 6, 11, 16, 21, 26];
        for (const day of days) {
            const instant = istInstant(cursor.year, cursor.month, day);
            if (instant > until) {
                return result;
            }
            result.push(instant);
        }
        cursor = addMonths(cursor, 1);
        first = false;
    }
    return result;
};

/** First penalty boundary strictly after `after`, or null. */
export const nextPenaltyBoundary = (obligation: YearMonth, after: number): number | null => {
    const all = penaltyBoundaries(obligation, after + 40 * 24 * 60 * 60 * 1000);
    return all.find((instant) => instant > after) ?? null;
};

export const formatIstDate = (value: Date | number | string): string => {
    const p = istParts(value);
    return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
};

export const formatIstDateTime = (value: Date | number | string): string => {
    const p = istParts(value);
    return `${formatIstDate(value)} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

/** Parses DD/MM/YYYY and HH:MM entered as India time. Returns null if invalid. */
export const parseIstDateTime = (dateText: string, timeText: string): number | null => {
    const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateText.trim());
    const t = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
    if (!d || !t) {
        return null;
    }
    const day = Number(d[1]);
    const month = Number(d[2]);
    const year = Number(d[3]);
    const hour = Number(t[1]);
    const minute = Number(t[2]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || hour > 23 || minute > 59) {
        return null;
    }
    if (day < 1 || day > daysInMonth(year, month)) {
        return null;
    }
    return istInstant(year, month, day, hour, minute);
};
