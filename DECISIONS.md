# DECISIONS

Five significant design decisions. Format per decision: the decision, the
evidence from the MAX documents (with field numbers), the alternative that
was considered, and why this one won.

---

## 1. The two spec inconsistencies: the length column holds the END position

**Decision.** Both broken rows in the MAX field tables are resolved by the
same interpretation — the value printed in the "אורך השדה" (field length)
column is actually the field's **end position**:

| Media | Field | Published start / "length" | Resolved length |
|---|---|---|---|
| 210/211 | 51 — אינדיקציית עסקת תייר | 603 / **603** | **1** |
| 212/213 | 29 — מספר הקצאה | 298 / **327** | **30** |

Record lengths follow: **656** chars for 210/211, **327** for 212/213.

**Evidence.**
- 210/211 field 51: field 52 starts at position 604, so whatever occupies
  position 603 is exactly 1 character wide. Its description is a binary
  indicator ("1 - עסקת תייר / 0 - לא עסקת תייר") — one character of content.
  And 603 is precisely the end position of a 1-char field starting at 603.
- 212/213 field 29: the *same business field* (מספר הקצאה, allocation number
  for the invoice) appears in media 210/211 as field 53 with length **30**.
  298 + 30 − 1 = **327** — the published "length" is exactly the end position
  a 30-char field would have. Two independent routes to the same number.
- The two errors being the *same class of error* (end position pasted into
  the length column) is itself evidence: one editing mistake pattern, made
  twice, is likelier than two unrelated corruptions.

**Alternative considered.** Treating 212/213 field 29's length as literally
327 (record length 624 with a mostly-blank tail). Rejected: it contradicts
the sibling media's 30, and no other field in either document is longer than
40 — a 327-char trailer has no business meaning.

**Detection is mechanized.** `findSpecInconsistencies()` in
`src/schema.ts` re-derives inconsistency #1 from the published values
by contiguity checking; the cross-media length comparison that catches #2 is
pinned in `tests/schema.test.ts`. If MAX ships a corrected document, the
tests will say so.

---

## 2. Identifiers are strings; money is integer agorot; blank ≠ zero

**Decision.** Three type rules applied across both medias:

1. **Identifier fields are never converted to numbers**: terminal (field 9),
   batch (10), voucher (11), approval (12), account/bank/branch (5–8), card
   number (19), ARN (20), invoice (47), allocation (53). Conversion would
   destroy leading zeros — and a terminal `0001234567` is a *different
   terminal* from `1234567`. The masked card number (19) isn't even numeric.
2. **Amounts are integers in agorot.** The documents show no decimal point
   and no decimal-places note for any amount field (29–43 in 210/211, 18–25
   in 212/213); fixed-width financial formats conventionally carry the minor
   currency unit. Integer agorot also makes reconciliation sums exact —
   no floating-point drift in money.
3. **A blank field is `None` ("no value"), an all-zeros field is a real 0.**
   The documents give blank explicit business meaning in several places:
   field 46 status — "תנועות תקינות - יופיע ריק" (blank = the record is
   fine); field 9 — blank terminal marks a non-transaction record; field 12 —
   blank approval = unapproved transaction; fields 47/48 — blank invoice =
   not yet issued. Collapsing blank into 0 would erase those distinctions.

**Alternative considered.** Parsing amounts as `Decimal` shekels. Rejected:
it presumes a decimal convention the documents never state, and integers in
the file's own unit are the honest representation of what MAX actually sent.

---

## 3. Transaction identity: ARN first, then (terminal, voucher); rows add the installment number

**Decision.** The stable identity of a *business transaction* is the **ARN**
(field 20) when present, falling back to **(terminal number, voucher
number)** (fields 9 + 11). The identity of a *row* appends the **installment
number** (field 28).

**Evidence.** Field 20 is described as "מספר מזהה חד - חד ערכי של
התנועה/עסקה" — a one-to-one identifier — making it the strongest key the
document offers. But field 12's description admits blank fields exist
(unapproved transactions), so a fallback is required; field 11 says the
voucher number "ייחודי לשידור ומספר המסוף" — unique *given* the terminal —
which is why the fallback is the pair, never the voucher alone. Field 30's
description ("התשלום התורן" — the current payment) shows one installment
transaction produces multiple rows over its life, one per payment, all
sharing the transaction identity; field 28 is what distinguishes them.

**Alternative considered.** (terminal, voucher, transaction date) as primary.
Rejected: it silently merges rows if a voucher repeats across transmissions
on one day, and ignores the one field the spec *calls* unique.

---

## 4. Batch linking and which fields are comparable

**Decision.** A transaction row links to its summary by **(terminal number,
batch number)** — fields 9 + 10, identically positioned in both medias.
Within a linked group, exactly these summary fields are validated, because
each is defined as an aggregate of a transaction-level field:

| 212/213 field | Validated against |
|---|---|
| 17 כמות תנועות | row count |
| 18 סכום ברוטו | Σ field 30 |
| 19 הנחת מועדון ללא דמי ניהול | Σ field 34 |
| 20 דמי ניהול מועדון | Σ field 36 |
| 21 עמלה רגילה | Σ field 37 |
| 22 תוספת עמלה ש"א | Σ field 38 |
| 23 סכום נכיון | Σ field 41 |
| 24 מע"מ | Σ field 42 |
| 25 סכום נטו | Σ field 43 |

Deliberately **not** compared, despite similar names: percentage fields
(210/211 fields 33, 35, 40 — rates don't sum); field 29 סכום ע. מקורי (in
the *original* currency, while the summary is in the payment currency);
field 39 נטו לחישוב ניכיון (no batch-level counterpart). Comparisons are
scoped to one payment currency and one credit date — field 17's description
counts vouchers "בתאריך הזיכוי" (per credit date), so a scope violation makes
checks UNKNOWN rather than false-FAIL.

**Evidence.** Field 10 in 210/211: "הריכוז שבו מופיעה התנועה" — the batch a
transaction appears in. The compared pairs carry matching definitions in the
two documents (e.g. both field 18/212 and field 30/210 read "סכום
הזיכוי/חיוב ברוטו בתאריך"), including matching semantics for installments.

**Alternative considered.** Linking by batch number alone. Rejected: batch
numbers are only 8 digits and nothing in the documents promises uniqueness
across terminals; the terminal is part of both records precisely because
batches live under terminals.

---

## 5. Held/waiting rows (status H/W) are included in derived totals

**Decision.** Rows whose status (field 46) is H (עצור) or W (המתנה) are
**included** when summing a batch, and the report discloses them. When a
FAIL gap exactly equals the held rows' contribution, the report says so
explicitly — turning a wrong guess into a one-line diagnosis instead of a
silent error.

**Evidence.** Field 46 describes H as "הזיכוי מעוכב" — the *credit is
delayed*. Delay is about timing, not membership: the row still belongs to
its batch. The documents nowhere state that summaries exclude held rows.

**Alternative considered.** Excluding H/W rows from sums. Rejected because
it bakes an unverifiable guess into every total. If MAX in fact excludes
them, our reports will show a characteristic signature (gap == held total)
that the hint line surfaces immediately — the failure mode of this decision
is loud and self-explaining, while the failure mode of the alternative is
quiet corruption of every batch containing a held row. What would settle it:
one real batch containing an H row (see ASSUMPTIONS.md).
