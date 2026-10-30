import { sumSummaries } from "../../src/domain/financeEngine";
import { recordPayment, reversePayment, summarizeAll } from "../../src/domain/operations";
import { buildObligationCsv, buildReportHtml, buildTransactionCsv, csvText, escapeHtml, transactionRows } from "../../src/export/exportBuilders";
import { STRINGS } from "../../src/localization/strings";
import { monthRows, monthTotals, olderDues } from "../../src/ui/selectors";
import { ist, member, obligation, payment, state } from "../fixtures/builders";

const NOW = ist(2026, 10, 29, 12);
const s = STRINGS.English;

const build = () => {
    const members = [member("m1", 1000, { name: "=HYPERLINK(\"x\")" }), member("m2", 500, { name: "ભાવિન <b>" })];
    const obligations = [obligation("m1", 2026, 9, 1000), obligation("m1", 2026, 10, 1000), obligation("m2", 2026, 9, 500), obligation("m2", 2026, 10, 500)];
    let st = state({
        members,
        obligations,
        payments: [payment(obligations[0], 1000, ist(2026, 9, 5)), payment(obligations[2], 500, ist(2026, 9, 6))],
    });
    st = recordPayment(st, { idempotencyKey: "full", memberId: "m2", year: 2026, month: 10, receivedAt: NOW, amountPaise: 80000, principalPaise: 50000, penaltyPaise: 30000, mode: "full" }, NOW).state;
    const mistaken = payment(obligations[1], 400, ist(2026, 10, 8));
    st = { ...st, payments: [...st.payments, mistaken] };
    st = reversePayment(st, mistaken.id, "Entered by mistake", NOW);
    return st;
};

describe("one engine for screens and exports", () => {
    test("Home/Monthly totals equal the obligation CSV total row and transaction cash", () => {
        const st = build();
        const october = monthTotals(monthRows(st, { year: 2026, month: 10 }, NOW));
        const csv = buildObligationCsv(st, { kind: "month", year: 2026, month: 10 }, NOW, s);
        const totalRow = csv.split("\r\n").pop()!.split(",");
        expect(totalRow[11]).toBe((october.cashCollectedPaise / 100).toFixed(2));
        expect(totalRow[14]).toBe((october.totalOutstandingPaise / 100).toFixed(2));
        // m1 October 1,600 outstanding; m2 settled with one full payment of 800.
        expect(october.totalOutstandingPaise).toBe(160000);
        expect(october.cashCollectedPaise).toBe(80000);

        const tx = transactionRows(st, { kind: "month", year: 2026, month: 10 }, NOW);
        const validCash = tx.filter((r) => r.type === "payment" && r.status === "valid").reduce((sum, r) => sum + r.amountPaise, 0);
        expect(validCash).toBe(october.cashCollectedPaise);

        const all = sumSummaries(summarizeAll(st, NOW));
        const csvAll = buildObligationCsv(st, { kind: "all" }, NOW, s).split("\r\n");
        // header + 4 obligations + 1 total; totals are never repeated per payment
        expect(csvAll).toHaveLength(6);
        expect(csvAll[5].split(",")[11]).toBe((all.cashCollectedPaise / 100).toFixed(2));
    });

    test("a full payment is ONE transaction row with its breakdown", () => {
        const rows = transactionRows(build(), { kind: "all" }, NOW).filter((r) => r.member.startsWith("ભાવિન") && r.obligationMonth === "2026-10");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ amountPaise: 80000, principalPaise: 50000, penaltyPaise: 30000, allocation: "explicit" });
    });

    test("reversed payments are listed but not counted as cash", () => {
        const rows = transactionRows(build(), { kind: "all" }, NOW).filter((r) => r.status === "reversed");
        expect(rows).toHaveLength(1);
        expect(rows[0].reason).toBe("Entered by mistake");
    });

    test("older dues use the same engine", () => {
        const st = build();
        const older = olderDues(st, ist(2026, 11, 2));
        // Only m1 October is still due on Nov 2: ₹1,000 + Oct 16/21/26 + Nov 1 steps.
        expect(older.count).toBe(1);
        expect(older.totals.totalOutstandingPaise).toBe(180000);
    });
});

describe("escaping and encoding", () => {
    test("CSV formula injection is neutralised and Gujarati is kept with a BOM", () => {
        expect(csvText("=1+1")).toBe("\"'=1+1\"");
        expect(csvText("+91")).toBe("\"'+91\"");
        expect(csvText("-5")).toBe("\"'-5\"");
        expect(csvText("@x")).toBe("\"'@x\"");
        expect(csvText("a\"b")).toBe("\"a\"\"b\"");
        const csv = buildTransactionCsv(build(), { kind: "all" }, NOW, s);
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain("ભાવિન");
        expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    });

    test("PDF HTML escapes names and reasons", () => {
        expect(escapeHtml("<script>&'\"")).toBe("&lt;script&gt;&amp;&#39;&quot;");
        const html = buildReportHtml({ state: build(), scope: { kind: "all" }, asOf: NOW, s, mandalName: "<Mandal>", scopeLabel: "All" });
        expect(html).not.toContain("<b>\"");
        expect(html).toContain("ભાવિન &lt;b&gt;");
        expect(html).toContain("&lt;Mandal&gt;");
        expect(html).toContain("<meta charset=\"utf-8\"/>");
    });
});
