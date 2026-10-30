# My Mandal repair — progress document

Branch: `repair/financial-integrity-v2`. Target app version 1.1.0, package `com.savani.mymandal` (unchanged).

## Settled rules (do not re-decide)

### Data protection
- Never clear storage, never replace data with empty defaults, never require uninstall.
- Existing member / obligation / payment IDs, received amounts (`actualCollectedAmount`) and `paidAt` dates are never rewritten.
- Schema changes are additive only. Legacy records are interpreted on read.
- Storage read/parse failures throw `StorageReadError`; callers must show a recoverable error and never write over the data.
- Every multi-key change goes through `commitJournaled` (journal key `mandal_write_journal`), replayed by `recoverJournal()` at startup. `multiSet` is NOT treated as a transaction.
- All financial read-modify-write runs inside `withStorageLock` (`mutateFinancialState`).
- Immutable pre-migration snapshot `mandal_snapshot_premigration_v1` is written once (raw strings, PIN removed) and never overwritten.
- Pre-restore snapshots: `mandal_snapshots_prerestore` (latest 3).

### Money and calendar
- Money is integer paise in all new fields and calculations. Legacy rupees → `Math.round(r * 100)`.
- Calendar is Asia/Kolkata (UTC+05:30, no DST), independent of device timezone.

### Penalty (fixed rupee steps, no percentage, no cap)
- Obligation month boundaries: 00:00 IST on days 16, 21, 26. Each later month: days 1, 6, 11, 16, 21, 26.
- At each boundary: unpaid principal > ₹500 → +₹200; principal > ₹0 → +₹100; principal ₹0 but penalty unpaid → +₹100; nothing unpaid → nothing.
- Boundary charges apply before any payment made on the boundary date (charge at 00:00, events at the same instant sort after).
- Charges use principal outstanding at that boundary; later payments never reduce earlier charges.
- Engine is a pure recomputation from events (payments, reversals, waivers) as of a date, so reopening screens cannot duplicate charges.

### Legacy allocation
- A legacy payment (no allocation fields) is inferred only when exactly one split is possible at that moment: no penalty outstanding (all principal), no principal outstanding (all penalty), or amount equals the full outstanding total.
- Otherwise the payment is "unclassified": shown as received cash, and the obligation is flagged "needs review". The engine does not guess. The admin can classify it via a focused correction (stored as `principalPaise`/`penaltyPaise` with `allocationSource: "classified"`; amount and date untouched; audit entry written).

### Membership
- No Add Member, no permanent delete. Closure requires all obligations settled or waived; closure stops future obligations.
- Member obligation start = earliest existing obligation for that member, else Mandal start (earliest obligation overall). Real data: September 2026.
- Installment schedule (`installmentSchedule`) derived from existing obligations for generating any missed month with the right amount. Pending changes stay in the legacy `pending*` fields and are cancellable before effective month.

### Security
- PIN verifier: PBKDF2-HMAC-SHA256, 16-byte random salt, 25,000 iterations (stored per verifier), in SecureStore key `mandal_pin_verifier_v1`.
- Plaintext `pin` is removed from `mandal_setup` only after the stored verifier reads back and verifies the same PIN. Until then the plaintext PIN keeps working.
- Throttling: 5 failures → lockout, escalating ×4 (30 s, 2 min, 8 min, … max 24 h). Failures persist until a successful unlock. Clock moved backwards does not shorten a lockout. Not tamper-proof.

### Backup
- Portable backup format `my-mandal-backup` v1: data + counts + total received + SHA-256 checksum. No PIN, verifier, tokens, login security or cloud owner uid.
- Restore: validate (schema, IDs, relationships, money, dates, checksum, totals) → typed confirmation if destructive (empty or fewer members/obligations/payments) → pre-restore snapshot → journaled commit. Validation repeats at commit time.
- Firestore legacy mirror is an UNVERIFIED backup until compared using `tools/firestore-readonly-export.mjs`.

## Completed work

### Stage 1 — recovery path, safe storage, migration, security groundwork
- `src/domain/money.ts`, `calendar.ts`, `types.ts`, `installments.ts`, `checksum.ts`
- `src/storage/keys.ts`, `safeStorage.ts` (lock, journal, `StorageReadError`), `repository.ts`, `migrations.ts` (v2)
- `src/security/pinVerifier.ts`, `loginThrottle.ts`
- `src/backup/backupFormat.ts`, `restore.ts`
- `tools/firestore-readonly-export.mjs` (read-only: getDoc/getDocs only; `npm run firestore:export [-- --compare backup.json]`)
- Jest (jest-expo) + in-memory mocks; `npm test`, `npm run typecheck`.

### Stage 2 — shared financial engine and operations
- `src/domain/financeEngine.ts`: pure `computeObligation` (as-of recomputation, fixed steps, timeline, next boundary, legacy inference/unclassified), `sumSummaries` (each obligation counted once).
- `src/domain/operations.ts` (pure): `generateObligations` (idempotent, missed months, schedule-aware, closure-aware, promotes pending changes), `ensureObligation` (advance up to 12 months), `recordPayment` (one transaction, allocation, idempotency key, commit-time validation against the balance on the received date, stale full-amount rejection), `reversePayment`, `previewMonthReset`/`resetMonthPayments`, `setPaymentAllocation` (correction + legacy classification), `correctPaymentDate`, `addWaiver`/`reverseWaiver`, `updateMemberDetails`, `scheduleInstallmentChange`/`cancelInstallmentChange`, `checkMembershipClosure`/`closeMembership`.
- `src/services/financeService.ts`: storage-locked, journaled wrappers.
- Decisions: payment reversal never creates a waiver; month reset touches only payments of one obligation; corrections keep history in `payment.corrections` + audit log; waivers are effective at the moment they are recorded.

### Stage 3 — screens and exports
- `App.tsx`: everything inside `SafeAreaProvider` + `LanguageProvider` (fixes Setup crash); startup runs journal recovery + migrations + PIN migration; storage errors show `DataErrorView` (retry / raw-data export, never wipes); auto-lock reads `screenRef` (fixes stale closure) and fails closed; no startup cloud upload prompt.
- `src/ui/` shared kit (`components.tsx`, `TotalsCard.tsx`, `selectors.ts`, `useFinance.ts` — refresh on focus, financial change, foreground, IST date change, every minute for as-of).
- `src/localization/strings.ts`: English/Gujarati for all new UI; no placeholders or escaped `\n`.
- Screens: Home (engine totals, older dues, needs-review, backup nudge, no Add Member), MonthlyPayments (month selector: Mandal start → +12 months), MemberMonth (new; simple collect / Pay Full Amount / manual; waive; medium "Reset This Month's Payments" with preview + reason; per-payment expand, reverse, split correction, date correction, legacy classification; waivers; penalty steps), Members (no add/delete; close membership with blocking months; scheduled change visible + cancellable), EditMember, History, Reports (obligation month vs collection date, penalty fund), Export (separate obligation CSV, transaction CSV, PDF), Settings (Mandal info, start month, change PIN via verifier, biometric toggle that respects the user's choice, language, JSON backup/restore), Login (verifier + throttle, biometric only if enabled), Setup (verifier, translated).
- `src/export/exportBuilders.ts`: BOM, formula-safe CSV, escaped HTML, one row per transaction, one total row.
- `src/backup/localBackup.ts`, `backupStatus.ts`, `src/ui/RestoreDialog.tsx` (typed RESTORE for destructive restore). `parseAnyBackup` also accepts the read-only Firestore export file.
- Removed: AddMember, PaymentDetails, `src/database/*`, `src/utils/*`, `cloudSync.ts` (automatic last-writer-wins upload + cloud deletes), `syncDeletionStorage.ts`. The `mandal_cloud_deleted_records` key is left untouched.

### Stage 4 — cloud backups, reminders, PIN recovery, release config
- `src/backup/cloudChunks.ts`: chunking (300k chars), ordered reassembly with count + SHA-256 check, `assessRecoveryIdentity` (verified email, matches setup email, matches cloud owner uid if recorded).
- `src/services/cloudBackup.ts`: manual "Back up now" only. Uploads immutable snapshots to `mandals/{uid}/backups/{id}` (+ `chunks/{n}`); metadata written last with `complete: true`; reads back and verifies before reporting success; records the owner uid on first success. Legacy mirror `mandals/{uid}` is read-only (restore source, never written or deleted).
- `src/screens/settings/CloudBackupSection.tsx`: sign in with recovery password, back up, list/restore complete backups, restore from legacy mirror (all restores go through validation + typed confirmation + pre-restore snapshot).
- `firebase/firestore.rules.proposed`: owner-only, email-verified, create-only backups. NOT deployed.
- `src/services/reminderPlan.ts` (pure) + `src/services/reminders.ts`: one local notification `my-mandal-month-end`, Android channel `monthly-dues`, default OFF and 10:00 IST on the 1st of the next month, configurable time; cancelled when nobody owes installment for the month; rescheduled on startup, foreground, and every financial change. Old reminder settings are not overwritten until the user changes them.
- `src/screens/settings/ReminderSection.tsx`: toggle (asks permission, links to Android settings if denied), time, permission status, platform-limit explanation.
- `src/screens/ForgotPinScreen.tsx`: fresh Firebase sign-in + reload + `assessRecoveryIdentity` before allowing a new PIN; resets throttle on success.
- `app.json`: version 1.1.0, `expo-notifications` plugin; package and EAS projectId unchanged. `eas.json`: `autoIncrement` for preview.
- Validation: `npx expo export --platform android` bundles (988 modules); `npx expo config` shows package `com.savani.mymandal`, version 1.1.0.

## Tests
| Stage | Suites | Result |
|---|---|---|
| 1 | storage, migration, pinSecurity, backupRestore | 33 passed |
| 2 | penaltyEngine, operations, financeService | 64 passed (97 total) |
| 3 | exportsAndScreens | 6 passed (103 total) |
| 4 | cloudAndReminders | 14 passed (117 total) |

## Release status: BLOCKED
- The original APK signing certificate could not be verified from this machine. Do not install until `eas credentials` (Android, `com.savani.mymandal`) SHA-256 matches `apksigner verify --print-certs` of the installed APK.
- Firestore mirror is still unverified; run `npm run firestore:export -- --compare <in-app JSON backup>` first.
- `npx expo install --check` suggests patch updates (expo 57.0.31, expo-dev-client 57.0.20, expo-notifications 57.0.24, expo-sharing 57.0.24); not applied.

## Expo SDK 58 upgrade (branch `upgrade/expo-sdk-58`)
- Process: `npm install expo@^58.0.0` → `npx expo install --fix` → `npx expo-doctor@latest` (20/20). Node 22.23.2 (SDK 58 needs ≥ 22.13).
- Key versions: expo 57.0.26 → 58.0.21, react-native 0.86.3 → 0.88.1, react 19.2.3 → 19.3.0, jest 29.7 → 30.5, jest-expo 57 → 58, all expo-* modules → 58.x. AsyncStorage (2.2.0) and firebase (12.19.0) unchanged, so stored data and auth persistence formats are unchanged.
- Code fix: `App.tsx` AppState ref type (RN 0.88 strict types: `currentState` may be null). Lock behaviour unchanged (fails closed).
- `expo install --fix` added the `expo-status-bar` plugin (no options, no native effect).
- Development variant: `app.config.js` + `eas.json` development `APP_VARIANT=development` → package `com.savani.mymandal.dev` (separate storage, cannot replace the production app). Cloud uploads refused in dev JS (`__DEV__`) and the dev variant (`src/config/appVariant.ts`). Production config is identical to `app.json`.
- Reviewed breaking changes: no removed RN APIs used; app uses `expo-file-system/legacy` (unaffected by async `File.write`); app sets its own notification handler; SecureStore 58 has no storage-format change; R8 minification now on by default in release builds (needs device verification).
- Results: 120 tests pass (117 unchanged + 3 new), tsc clean, `expo export` Android OK, Metro dev server OK, Android prebuild (temp copy) OK. No native APK built, no emulator/device run (no Android SDK/Java on this machine).

## Not done / limitations
- Add Member is intentionally absent; a fresh install can only get members by restoring a backup.
- Live Firestore rules unknown; cloud backup upload may be denied until the proposed rules (or equivalent) are reviewed and deployed by the owner.
- Reminders are local, computed when the app last ran; delivery may be slightly late (no exact-alarm permission).
- Tested with unit tests only; no device/emulator run in this environment.
