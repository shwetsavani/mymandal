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

## Tests
| Stage | Suites | Result |
|---|---|---|
| 1 | storage, migration, pinSecurity, backupRestore | 33 passed |

## Remaining work
- Stage 2: finance engine, obligation generator, payments with allocation/idempotency, reversal, month reset, waivers, closure, classification.
- Stage 3: screens.
- Stage 4: cloud snapshot backups, notifications, forgot PIN, app.json/eas.json, release validation.
