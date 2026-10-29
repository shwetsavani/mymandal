#!/usr/bin/env node
/**
 * READ-ONLY Firestore export for My Mandal.
 *
 * - Signs in with the recovery email/password you type (nothing is stored).
 * - Uses ONLY getDoc/getDocs. It never calls setDoc, updateDoc, deleteDoc,
 *   writeBatch or any other write API.
 * - Saves a local JSON snapshot and a summary (counts and totals per month)
 *   so the cloud copy can be compared with what the installed app shows.
 *
 * Usage:
 *   npm run firestore:export
 *   npm run firestore:export -- --compare path/to/my-mandal-backup.json
 *
 * The Firestore copy is an UNVERIFIED backup until the summary matches the
 * installed app's member count, payment records, dates and totals.
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore } from "firebase/firestore";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";

const firebaseConfig = {
    apiKey: "AIzaSyB-VwrH0vcMpZW_ekM_uaBboslI9PK87dM",
    authDomain: "my-mandal-e98cb.firebaseapp.com",
    projectId: "my-mandal-e98cb",
    storageBucket: "my-mandal-e98cb.firebasestorage.app",
    messagingSenderId: "554707933345",
    appId: "1:554707933345:web:cdd0eb47e9a06240e2b8e0",
};

const ask = (question, hidden = false) =>
    new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (hidden) {
            rl._writeToOutput = (text) => {
                if (text.includes(question)) rl.output.write(text);
                else rl.output.write("*");
            };
        }
        rl.question(question, (answer) => {
            rl.close();
            if (hidden) process.stdout.write("\n");
            resolve(answer.trim());
        });
    });

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const rupees = (paise) => (paise / 100).toFixed(2);

const summarize = (members, obligations, payments) => {
    const byMonth = {};
    for (const o of obligations) {
        const key = `${o.year}-${String(o.month).padStart(2, "0")}`;
        byMonth[key] ??= { obligations: 0, installmentPaise: 0, payments: 0, receivedPaise: 0 };
        byMonth[key].obligations += 1;
        byMonth[key].installmentPaise += toPaise(o.originalInstallment ?? 0);
    }
    for (const p of payments) {
        if (p.status === "reversed") continue;
        const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
        byMonth[key] ??= { obligations: 0, installmentPaise: 0, payments: 0, receivedPaise: 0 };
        byMonth[key].payments += 1;
        byMonth[key].receivedPaise += typeof p.amountPaise === "number" ? p.amountPaise : toPaise(p.actualCollectedAmount ?? 0);
    }
    return {
        members: members.length,
        memberNames: members.map((m) => `${m.name} (₹${m.monthlyInstallment})`).sort(),
        obligations: obligations.length,
        payments: payments.length,
        totalReceived: rupees(Object.values(byMonth).reduce((s, m) => s + m.receivedPaise, 0)),
        byMonth: Object.fromEntries(
            Object.entries(byMonth)
                .sort()
                .map(([k, v]) => [k, { ...v, installment: rupees(v.installmentPaise), received: rupees(v.receivedPaise) }])
        ),
        paymentList: payments
            .map((p) => ({ id: p.id, memberId: p.memberId, month: `${p.year}-${p.month}`, amount: p.actualCollectedAmount, paidAt: p.paidAt }))
            .sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt))),
    };
};

const compareWith = (cloud, localPath) => {
    const local = JSON.parse(readFileSync(localPath, "utf8"));
    const data = local.data ?? local;
    const localSummary = summarize(data.members ?? [], data.obligations ?? [], data.payments ?? []);
    const ids = (list) => new Set(list.map((x) => x.id));
    const diff = (a, b) => [...a].filter((x) => !b.has(x));
    const result = {
        localFile: localPath,
        counts: {
            members: { cloud: cloud.members.length, local: localSummary.members },
            obligations: { cloud: cloud.obligations.length, local: localSummary.obligations },
            payments: { cloud: cloud.payments.length, local: localSummary.payments },
        },
        totalReceived: { cloud: summarize(cloud.members, cloud.obligations, cloud.payments).totalReceived, local: localSummary.totalReceived },
        paymentsOnlyInCloud: diff(ids(cloud.payments), ids(data.payments ?? [])),
        paymentsOnlyLocal: diff(ids(data.payments ?? []), ids(cloud.payments)),
        membersOnlyInCloud: diff(ids(cloud.members), ids(data.members ?? [])),
        membersOnlyLocal: diff(ids(data.members ?? []), ids(cloud.members)),
    };
    result.matches =
        result.counts.members.cloud === result.counts.members.local &&
        result.counts.payments.cloud === result.counts.payments.local &&
        result.totalReceived.cloud === result.totalReceived.local &&
        result.paymentsOnlyInCloud.length === 0 &&
        result.paymentsOnlyLocal.length === 0;
    return result;
};

const main = async () => {
    const compareIndex = process.argv.indexOf("--compare");
    const comparePath = compareIndex > -1 ? process.argv[compareIndex + 1] : null;

    console.log("My Mandal READ-ONLY Firestore export. Nothing in the cloud will be changed.\n");
    const email = await ask("Recovery email: ");
    const password = await ask("Password: ", true);

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    console.log(`Signed in as ${user.email} (uid ${user.uid}). Reading...`);

    const read = async (name) => (await getDocs(collection(db, "mandals", user.uid, name))).docs.map((d) => d.data());
    const root = await getDoc(doc(db, "mandals", user.uid));
    const [members, obligations, payments] = await Promise.all([read("members"), read("obligations"), read("payments")]);
    let backups = [];
    try {
        backups = (await getDocs(collection(db, "mandals", user.uid, "backups"))).docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
        backups = [];
    }

    const exportedAt = new Date().toISOString();
    const mandal = root.exists() ? root.data() : null;
    if (mandal) delete mandal.pin;
    const snapshot = { kind: "my-mandal-firestore-readonly-export", exportedAt, uid: user.uid, mandal, members, obligations, payments, backupSnapshots: backups };
    const summary = summarize(members, obligations, payments);

    const outDir = join(process.cwd(), "exports");
    mkdirSync(outDir, { recursive: true });
    const stamp = exportedAt.replace(/[:.]/g, "-");
    const dataFile = join(outDir, `firestore-export-${stamp}.json`);
    const summaryFile = join(outDir, `firestore-summary-${stamp}.json`);
    writeFileSync(dataFile, JSON.stringify(snapshot, null, 2), "utf8");
    const fullSummary = { exportedAt, uid: user.uid, summary, comparison: comparePath ? compareWith(snapshot, comparePath) : null };
    writeFileSync(summaryFile, JSON.stringify(fullSummary, null, 2), "utf8");

    console.log(`\nMembers: ${summary.members}  Obligations: ${summary.obligations}  Payments: ${summary.payments}`);
    console.log(`Total received (non-reversed): ₹${summary.totalReceived}`);
    for (const [month, m] of Object.entries(summary.byMonth)) {
        console.log(`  ${month}: ${m.obligations} obligations, installment ₹${m.installment}, ${m.payments} payments, received ₹${m.received}`);
    }
    if (fullSummary.comparison) {
        console.log(`\nComparison with ${comparePath}: ${fullSummary.comparison.matches ? "MATCHES" : "DIFFERENT - review the summary file"}`);
    }
    console.log(`\nSaved:\n  ${dataFile}\n  ${summaryFile}`);
    console.log("\nCompare these numbers with the installed app (Home, History, each member) before relying on this copy.");
    await signOut(auth);
    process.exit(0);
};

main().catch((error) => {
    console.error("Export failed:", error?.message ?? error);
    process.exit(1);
});
