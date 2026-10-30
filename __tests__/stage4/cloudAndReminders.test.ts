import AsyncStorage from "@react-native-async-storage/async-storage";

import { assembleChunks, assessRecoveryIdentity, splitIntoChunks } from "../../src/backup/cloudChunks";
import { sha256Hex } from "../../src/domain/checksum";
import { recordPayment } from "../../src/domain/operations";
import { DEFAULT_REMINDER_SETTINGS, normalizeReminderSettings, planMonthEndReminder } from "../../src/services/reminderPlan";
import { KEYS } from "../../src/storage/keys";
import { ist, member, obligation, state } from "../fixtures/builders";
import { resetStores } from "../helpers";

const mockScheduled: { identifier: string; date: Date; body: string }[] = [];
const mockCancelled: string[] = [];
let mockPermission = "granted";

jest.mock("expo-notifications", () => ({
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: "date" },
    setNotificationHandler: () => undefined,
    setNotificationChannelAsync: async () => null,
    getPermissionsAsync: async () => ({ status: mockPermission }),
    requestPermissionsAsync: async () => ({ status: mockPermission }),
    cancelScheduledNotificationAsync: async (id: string) => {
        mockCancelled.push(id);
    },
    scheduleNotificationAsync: async (req: { identifier: string; content: { body: string }; trigger: { date: Date } }) => {
        mockScheduled.push({ identifier: req.identifier, date: req.trigger.date, body: req.content.body });
        return req.identifier;
    },
}));

describe("cloud backup chunks", () => {
    test("split and reassemble round-trips large text in any order", () => {
        const text = "x".repeat(250) + "ભાવિન" + "y".repeat(777);
        const chunks = splitIntoChunks(text, 100).map((data, index) => ({ index, data }));
        expect(chunks.length).toBe(11);
        const shuffled = [...chunks].reverse();
        expect(assembleChunks(shuffled, chunks.length, sha256Hex(text))).toBe(text);
    });

    test("missing parts or tampered content are rejected", () => {
        const text = "a".repeat(500);
        const chunks = splitIntoChunks(text, 100).map((data, index) => ({ index, data }));
        expect(() => assembleChunks(chunks.slice(0, 4), 5, sha256Hex(text))).toThrow(/incomplete/);
        const tampered = chunks.map((c) => (c.index === 2 ? { ...c, data: "b".repeat(100) } : c));
        expect(() => assembleChunks(tampered, 5, sha256Hex(text))).toThrow(/integrity/);
    });

    test("empty text still produces one chunk", () => {
        expect(splitIntoChunks("")).toEqual([""]);
    });
});

describe("recovery identity", () => {
    const good = { uid: "u1", email: "Admin@Example.com", emailVerified: true };
    test("verified matching email is accepted, case-insensitive", () => {
        expect(assessRecoveryIdentity(good, "admin@example.com", undefined)).toEqual({ ok: true });
        expect(assessRecoveryIdentity(good, "admin@example.com", "u1")).toEqual({ ok: true });
    });
    test("unverified, mismatched email, missing setup email or other owner are rejected", () => {
        expect(assessRecoveryIdentity({ ...good, emailVerified: false }, "admin@example.com", undefined).ok).toBe(false);
        expect(assessRecoveryIdentity(good, "other@example.com", undefined).ok).toBe(false);
        expect(assessRecoveryIdentity(good, undefined, undefined).ok).toBe(false);
        expect(assessRecoveryIdentity(good, "admin@example.com", "someone-else").ok).toBe(false);
    });
});

describe("month-end reminder plan", () => {
    const enabled = { ...DEFAULT_REMINDER_SETTINGS, enabled: true };
    const build = () =>
        state({
            members: [member("m1", 1000), member("m2", 500)],
            obligations: [obligation("m1", 2026, 10, 1000), obligation("m2", 2026, 10, 500)],
        });

    test("defaults: disabled, 10:00; malformed or legacy settings fall back safely", () => {
        expect(DEFAULT_REMINDER_SETTINGS).toEqual({ v: 2, enabled: false, hour: 10, minute: 0 });
        expect(normalizeReminderSettings({ enabled: true })).toEqual(DEFAULT_REMINDER_SETTINGS);
        expect(normalizeReminderSettings({ v: 2, enabled: true, hour: 99, minute: -1 })).toEqual({ v: 2, enabled: true, hour: 10, minute: 0 });
    });

    test("disabled reminders never schedule", () => {
        expect(planMonthEndReminder(build(), ist(2026, 10, 20), DEFAULT_REMINDER_SETTINGS)).toBeNull();
    });

    test("fires at 10:00 IST on the 1st of next month with unpaid count and installment total", () => {
        const plan = planMonthEndReminder(build(), ist(2026, 10, 20), enabled)!;
        expect(plan.month).toEqual({ year: 2026, month: 10 });
        expect(plan.triggerAt).toBe(ist(2026, 11, 1, 10, 0));
        expect(new Date(plan.triggerAt).toISOString()).toBe("2026-11-01T04:30:00.000Z");
        expect(plan.unpaidMembers).toBe(2);
        expect(plan.installmentOutstandingPaise).toBe(150000);
    });

    test("only members with installment still outstanding are counted; none unpaid cancels", () => {
        const now = ist(2026, 10, 10);
        let st = build();
        st = recordPayment(st, { idempotencyKey: "a", memberId: "m1", year: 2026, month: 10, receivedAt: now, amountPaise: 100000, principalPaise: 100000, penaltyPaise: 0, mode: "simple" }, now).state;
        expect(planMonthEndReminder(st, now, enabled)!.unpaidMembers).toBe(1);
        st = recordPayment(st, { idempotencyKey: "b", memberId: "m2", year: 2026, month: 10, receivedAt: now, amountPaise: 50000, principalPaise: 50000, penaltyPaise: 0, mode: "simple" }, now).state;
        expect(planMonthEndReminder(st, now, enabled)).toBeNull();
    });

    test("on the 1st before the reminder time, the previous month's reminder is still today", () => {
        const st = state({ members: [member("m1", 1000)], obligations: [obligation("m1", 2026, 9, 1000)] });
        const plan = planMonthEndReminder(st, ist(2026, 10, 1, 8, 0), { ...enabled, hour: 10, minute: 0 })!;
        expect(plan.month).toEqual({ year: 2026, month: 9 });
        expect(plan.triggerAt).toBe(ist(2026, 10, 1, 10, 0));
    });

    test("custom time is respected", () => {
        const plan = planMonthEndReminder(build(), ist(2026, 10, 20), { ...enabled, hour: 19, minute: 45 })!;
        expect(plan.triggerAt).toBe(ist(2026, 11, 1, 19, 45));
    });
});

describe("reminder scheduling service", () => {
    beforeEach(() => {
        resetStores();
        mockScheduled.length = 0;
        mockCancelled.length = 0;
        mockPermission = "granted";
        jest.useFakeTimers({ now: ist(2026, 10, 20, 12), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    });
    afterEach(() => jest.useRealTimers());

    const seed = async () => {
        const st = state({ members: [member("m1", 1000)], obligations: [obligation("m1", 2026, 10, 1000)] });
        await AsyncStorage.multiSet([
            [KEYS.members, JSON.stringify(st.members)],
            [KEYS.obligations, JSON.stringify(st.obligations)],
            [KEYS.payments, "[]"],
        ]);
    };

    test("old reminder settings are not overwritten and keep reminders off", async () => {
        const { refreshReminders } = require("../../src/services/reminders");
        await seed();
        await AsyncStorage.setItem(KEYS.reminderSettings, JSON.stringify({ enabled: true }));
        await refreshReminders();
        expect(mockScheduled).toHaveLength(0);
        expect(await AsyncStorage.getItem(KEYS.reminderSettings)).toBe(JSON.stringify({ enabled: true }));
    });

    test("enabling schedules exactly one reminder, refresh replaces rather than duplicates", async () => {
        const { saveReminderSettings, refreshReminders, REMINDER_ID } = require("../../src/services/reminders");
        await seed();
        await saveReminderSettings({ v: 2, enabled: true, hour: 10, minute: 0 });
        await refreshReminders();
        expect(mockScheduled).toHaveLength(2);
        expect(mockCancelled.filter((id) => id === REMINDER_ID)).toHaveLength(2);
        expect(new Set(mockScheduled.map((s) => s.identifier))).toEqual(new Set([REMINDER_ID]));
        expect(mockScheduled[1].date.toISOString()).toBe("2026-11-01T04:30:00.000Z");
        expect(mockScheduled[1].body).toContain("1 member(s)");
    });

    test("denied permission schedules nothing", async () => {
        const { saveReminderSettings } = require("../../src/services/reminders");
        await seed();
        mockPermission = "denied";
        await saveReminderSettings({ v: 2, enabled: true, hour: 10, minute: 0 });
        expect(mockScheduled).toHaveLength(0);
    });
});
