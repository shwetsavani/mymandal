import { addMonths, currentIstMonth, istInstant, type YearMonth } from "../domain/calendar";
import { summarize } from "../domain/operations";
import type { FinancialState } from "../domain/types";

export type ReminderSettings = { v: 2; enabled: boolean; hour: number; minute: number };

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { v: 2, enabled: false, hour: 10, minute: 0 };

export const normalizeReminderSettings = (value: unknown): ReminderSettings => {
    const v = value as Partial<ReminderSettings> | null;
    if (!v || v.v !== 2) return DEFAULT_REMINDER_SETTINGS;
    const hour = Number.isInteger(v.hour) && v.hour! >= 0 && v.hour! <= 23 ? v.hour! : 10;
    const minute = Number.isInteger(v.minute) && v.minute! >= 0 && v.minute! <= 59 ? v.minute! : 0;
    return { v: 2, enabled: v.enabled === true, hour, minute };
};

export type ReminderPlan = {
    month: YearMonth;
    triggerAt: number;
    unpaidMembers: number;
    installmentOutstandingPaise: number;
};

/**
 * Reminder for the month that ends next: fires at the configured India time
 * on the 1st of the following month, but only if some member still owes
 * installment for that month (as of now). Returns null when there is nothing
 * to remind about, so any scheduled reminder should be cancelled.
 */
export const planMonthEndReminder = (state: FinancialState, now: number, settings: ReminderSettings): ReminderPlan | null => {
    if (!settings.enabled) return null;
    const current = currentIstMonth(now);
    const thisMonthTrigger = istInstant(current.year, current.month, 1, settings.hour, settings.minute);
    const month = now < thisMonthTrigger ? addMonths(current, -1) : current;
    const next = addMonths(month, 1);
    const triggerAt = istInstant(next.year, next.month, 1, settings.hour, settings.minute);
    let unpaidMembers = 0;
    let installmentOutstandingPaise = 0;
    for (const obligation of state.obligations) {
        if (obligation.year !== month.year || obligation.month !== month.month) continue;
        const summary = summarize(state, obligation, now);
        const owed = summary.reliable ? summary.principalOutstandingPaise : summary.installmentPaise;
        if (owed > 0) {
            unpaidMembers += 1;
            installmentOutstandingPaise += owed;
        }
    }
    if (unpaidMembers === 0) return null;
    return { month, triggerAt, unpaidMembers, installmentOutstandingPaise };
};
