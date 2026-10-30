import { sumSummaries } from "../../src/domain/financeEngine";
import {
    addMember,
    deleteMemberPermanently,
    findObligation,
    previewMemberDeletion,
    recordPayment,
    restoreDeletedMember,
    summarize,
    summarizeAll,
} from "../../src/domain/operations";
import type { FinancialState } from "../../src/domain/types";
import { listDeletedMembers, submitDeletedMemberRestore, submitMemberDeletion, submitNewMember } from "../../src/services/financeService";
import { KEYS } from "../../src/storage/keys";
import { loadFinancialState } from "../../src/storage/repository";
import { recoverJournal } from "../../src/storage/safeStorage";
import { ist, state } from "../fixtures/builders";
import { crashAfterWrites, dumpStorage, resetStores } from "../helpers";

const NOW = ist(2026, 10, 30, 15);
const SEPT = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };

/** The 8 members and payments from the September and October 2026 PDF reports. */
const PDF_MEMBERS: [string, string, number][] = [
    ["Shwet", "9974983244", 1000],
    ["Tarul", "8320959570", 1000],
    ["Bhimo", "7046813307", 1000],
    ["Deepo", "8160884833", 1000],
    ["Premo", "9737853000", 1000],
    ["JP", "6351353846", 500],
    ["BD", "9898127442", 500],
    ["Vedo", "7778951688", 500],
];

let key = 0;
const pay = (st: FinancialState, name: string, ym: { year: number; month: number }, at: number, principal: number, penalty: number) => {
    const member = st.members.find((m) => m.name === name)!;
    key += 1;
    return recordPayment(
        st,
        {
            idempotencyKey: `k${key}`,
            memberId: member.id,
            ...ym,
            receivedAt: at,
            amountPaise: (principal + penalty) * 100,
            principalPaise: principal * 100,
            penaltyPaise: penalty * 100,
            mode: "manual",
        },
        NOW
    ).state;
};

const buildPdfState = (): FinancialState => {
    let st = state({ settings: {} });
    for (const [name, mobile, amount] of PDF_MEMBERS) {
        st = addMember(st, { name, mobile, installmentRupees: amount, start: SEPT }, NOW).state;
    }
    for (const [name, , amount] of PDF_MEMBERS) {
        st = pay(st, name, SEPT, ist(2026, 9, 14, 16, 49), amount, 0);
    }
    st = pay(st, "Shwet", OCT, ist(2026, 10, 15, 13, 56), 1000, 0);
    st = pay(st, "JP", OCT, ist(2026, 10, 15, 13, 56), 500, 0);
    st = pay(st, "BD", OCT, ist(2026, 10, 15, 13, 56), 500, 0);
    st = pay(st, "Vedo", OCT, ist(2026, 10, 16, 12, 4), 500, 0);
    st = pay(st, "Vedo", OCT, ist(2026, 10, 16, 12, 5), 0, 100);
    st = pay(st, "Bhimo", OCT, ist(2026, 10, 23, 10, 1), 1000, 400);
    st = pay(st, "Premo", OCT, ist(2026, 10, 24, 11, 43), 1000, 400);
    st = pay(st, "Tarul", OCT, ist(2026, 10, 24, 11, 43), 0, 400);
    return st;
};

const monthOf = (st: FinancialState, name: string, ym: { year: number; month: number }) => {
    const member = st.members.find((m) => m.name === name)!;
    return summarize(st, findObligation(st, member.id, ym)!, NOW);
};

describe("add member", () => {
    test("the first member on a fresh install sets the Mandal start and gets every month up to now", () => {
        const { state: st, member } = addMember(state({ settings: {} }), { name: " Shwet ", mobile: "9974983244", installmentRupees: 1000, start: SEPT }, NOW);
        expect(member.name).toBe("Shwet");
        expect(st.settings).toMatchObject({ mandalStartYear: 2026, mandalStartMonth: 9 });
        expect(st.obligations.map((o) => `${o.year}-${o.month}:${o.originalInstallment}`)).toEqual(["2026-9:1000", "2026-10:1000"]);
        expect(st.auditLog.at(-1)?.action).toBe("member_added");
    });

    test("rejects duplicates, bad input, and start months outside the allowed range", () => {
        const base = addMember(state({}), { name: "Bhimo", mobile: "7046813307", installmentRupees: 1000, start: SEPT }, NOW).state;
        const add = (name: string, mobile: string, amount: number, start = SEPT) => () => addMember(base, { name, mobile, installmentRupees: amount, start }, NOW);
        expect(add("bhimo", "7046813360", 1000)).toThrow(/already exists/);
        expect(add("Other", "7046813307", 1000)).toThrow(/mobile/);
        expect(add("Other", "123", 1000)).toThrow(/10 digits/);
        expect(add("X", "", 1000)).toThrow(/name/);
        expect(add("Other", "", 0)).toThrow(/whole rupee/);
        expect(add("Other", "", 1000, { year: 2026, month: 8 })).toThrow(/Mandal start/);
        expect(add("Other", "", 1000, { year: 2027, month: 1 })).toThrow(/next month/);
    });

    test("rebuilding the September/October PDFs gives the PDF cash totals and the correct penalties", () => {
        const st = buildPdfState();
        expect(st.members).toHaveLength(8);
        const sept = sumSummaries(summarizeAll(st, NOW).filter((x) => x.month === 9));
        const oct = sumSummaries(summarizeAll(st, NOW).filter((x) => x.month === 10));
        expect(sept.cashCollectedPaise).toBe(650000);
        expect(sept.penaltyChargedPaise).toBe(0);
        expect(oct.cashCollectedPaise).toBe(580000);

        expect(monthOf(st, "Bhimo", OCT)).toMatchObject({ status: "settled", penaltyChargedPaise: 40000 });
        expect(monthOf(st, "Premo", OCT)).toMatchObject({ status: "settled", penaltyChargedPaise: 40000 });
        expect(monthOf(st, "Vedo", OCT)).toMatchObject({ status: "settled", penaltyChargedPaise: 10000 });
        expect(monthOf(st, "Shwet", OCT)).toMatchObject({ status: "settled", penaltyChargedPaise: 0 });
        // Unpaid since the 1st: ₹200 on 16, 21 and 26 October (the old app showed ₹0).
        expect(monthOf(st, "Deepo", OCT)).toMatchObject({ penaltyChargedPaise: 60000, totalOutstandingPaise: 160000 });
        // ₹400 recorded as penalty on 24 Oct; installment still ₹1,000, so 26 Oct adds ₹200.
        expect(monthOf(st, "Tarul", OCT)).toMatchObject({ principalOutstandingPaise: 100000, penaltyOutstandingPaise: 20000 });
    });
});

describe("delete member permanently", () => {
    test("removes the member with every obligation, payment and waiver, and totals drop by exactly that member", () => {
        const st = buildPdfState();
        const bhimo = st.members.find((m) => m.name === "Bhimo")!;
        expect(previewMemberDeletion(st, bhimo.id)).toMatchObject({ obligationCount: 2, paymentCount: 2, receivedPaise: 240000 });

        const before = sumSummaries(summarizeAll(st, NOW));
        const { state: next, removed } = deleteMemberPermanently(st, bhimo.id, NOW);
        expect(next.members.map((m) => m.name)).not.toContain("Bhimo");
        expect(next.obligations.some((o) => o.memberId === bhimo.id)).toBe(false);
        expect(next.payments.some((p) => p.memberId === bhimo.id)).toBe(false);
        expect(removed.payments).toHaveLength(2);
        expect(sumSummaries(summarizeAll(next, NOW)).cashCollectedPaise).toBe(before.cashCollectedPaise - 240000);
        expect(next.auditLog.at(-1)).toMatchObject({ action: "member_deleted", memberId: bhimo.id });

        const others = st.payments.filter((p) => p.memberId !== bhimo.id);
        expect(next.payments).toEqual(others);
    });

    test("restoring puts back the identical records", () => {
        const st = buildPdfState();
        const deepo = st.members.find((m) => m.name === "Deepo")!;
        const { state: deletedState, removed } = deleteMemberPermanently(st, deepo.id, NOW);
        const restored = restoreDeletedMember(deletedState, removed, NOW);
        expect(restored.members.find((m) => m.id === deepo.id)).toEqual(deepo);
        expect(restored.obligations.filter((o) => o.memberId === deepo.id)).toEqual(st.obligations.filter((o) => o.memberId === deepo.id));
        expect(restored.payments).toHaveLength(st.payments.length);
        expect(() => restoreDeletedMember(restored, removed, NOW)).toThrow(/already exist/);
    });
});

describe("member service with storage", () => {
    beforeEach(async () => {
        await resetStores();
        jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    });
    afterEach(() => jest.useRealTimers());

    test("delete keeps the records in Recently deleted, and restore brings them back", async () => {
        const member = await submitNewMember({ name: "Kunal", mobile: "", installmentRupees: 500, start: SEPT });
        const removed = await submitMemberDeletion(member.id);
        expect((await loadFinancialState()).members).toHaveLength(0);
        expect((await listDeletedMembers()).map((r) => r.id)).toEqual([removed.id]);

        await submitDeletedMemberRestore(removed.id);
        const st = await loadFinancialState();
        expect(st.members.map((m) => m.id)).toEqual([member.id]);
        expect(st.obligations).toHaveLength(2);
        expect(await listDeletedMembers()).toHaveLength(0);
    });

    test("a crash during delete never loses the records: the journal completes it on restart", async () => {
        const member = await submitNewMember({ name: "Kunal", mobile: "", installmentRupees: 500, start: SEPT });
        const restore = crashAfterWrites(2);
        await expect(submitMemberDeletion(member.id)).rejects.toThrow();
        restore();
        await recoverJournal();
        const st = await loadFinancialState();
        const bin = await listDeletedMembers();
        expect(st.members).toHaveLength(0);
        expect(bin).toHaveLength(1);
        expect(bin[0].member.id).toBe(member.id);
        expect(bin[0].obligations).toHaveLength(2);
        expect(Object.keys(await dumpStorage())).toContain(KEYS.deletedMembers);
    });
});
