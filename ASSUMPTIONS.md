# ASSUMPTIONS

Every place the MAX documents do not give a single unambiguous answer, what
this implementation assumes, and what would verify the assumption. (Where a
question rose to a *design decision* with document evidence, it lives in
DECISIONS.md instead; this file is the residue that only a real MAX file or
an answer from MAX could settle.)

## 1. Position indexing: 1-based, inclusive

**Assumed.** "תחילת השדה" is 1-based and inclusive: field 1 occupies
positions 1–9, and in 0-based code `line[start-1 : start-1+length]`.
**Why.** Field 1 starts at 1 (not 0), and under this reading every
field's start equals the previous start + length across both documents
(82 field boundaries), with the two known exceptions. A 0-based reading
would break every boundary.
**Verify with.** Any real media line: the merchant number should occupy the
first 9 characters exactly.

## 2. Positions count characters; the file is a single-byte Hebrew encoding

**Assumed.** Offsets are measured in characters of decoded text. The parser
decodes the file, then slices characters. Default encoding for real MAX
files is assumed to be a single-byte Hebrew encoding (ISO-8859-8 or IBM
CP862 — configurable via `--encoding`), in which characters == bytes, so the
distinction is invisible. The committed fixtures use UTF-8; because slicing
happens after decoding, the same schema parses them identically.
**Why.** Field 4 (שם בית עסק, 40) contains Hebrew. In UTF-8 Hebrew letters
are 2 bytes, so byte-counted offsets would make record length depend on the
business name's language — implausible for a fixed-width mainframe format.
Single-byte Hebrew encodings are the norm for Israeli banking interchange
files.
**Verify with.** A real file: check its byte length per line (656/327 ⇒
single-byte) and whether Hebrew renders correctly under ISO-8859-8 vs CP862.

## 3. Dates are DD/MM/YYYY

**Assumed.** All 10-character date fields are `DD/MM/YYYY`.
**Why.** The width is exactly 10, which requires two separator characters;
day-first is the Israeli convention, and MAX's own customer-facing documents
are day-first. ISO `YYYY-MM-DD` also fits 10 chars but is rare in Israeli
legacy interchange formats.
**Verify with.** Any real line — a day > 12 disambiguates instantly.
Note: the parser isolates the format in one place (`convertDate` /
`renderValue` in `convert.ts`), so being wrong costs a one-line change.

## 4. Negative amounts carry a leading minus inside the field

**Assumed.** An amount field has no separate sign field, so a negative value
(refund, cancellation — field 21 lists "ביטול עסקה") is rendered as `-`
followed by zero-padded digits, e.g. `-000000000012345`. The parser accepts
this; absence of a minus means positive.
**Why.** Something must represent debits ("הזיכוי/חיוב" appears in the field
18/30 descriptions, so both directions exist). A leading minus is the most
common convention in flat financial files. Alternatives (trailing sign,
overpunch/zoned decimal, direction implied by transaction-type code) are
possible but less likely for a file also containing plain-text Hebrew.
**Verify with.** A real file containing a cancellation row.

## 5. Percentages have two implied decimals

**Assumed.** Rate fields (210/211 fields 33, 35, 40) are integers with two
implied decimal places: `00150` = 1.50%.
**Why.** Field 40 is 5 wide with no decimal point; clearing-fee rates need
sub-percent precision. Stored as int hundredths, never summed (rates are not
additive — see DECISIONS.md, decision 4).
**Verify with.** A real discounted transaction where field 41 ≈ field 39 ×
rate can be recomputed.

## 6. Line-length policy: exact length or rejected

**Assumed.** A line that is not exactly 656 (210/211) or 327 (212/213)
characters is rejected whole — never padded or truncated. Field-level
conversion failures on a correct-length line flag the record but keep it.
**Why.** In a fixed-width money file, a wrong-length line means the frame
of *every* subsequent field is unknowable; padding would quietly shift
amounts between fields — the exact failure class a reconciliation engine
exists to expose. One policy, applied uniformly (`src/parser.ts`).
**Verify with.** MAX's file-level documentation (headers/trailers, if any —
see #8).

## 7. Empty vs. all-zeros (the spec's own answer, plus our rule)

**Assumed.** Blank numeric/date fields parse to `None` ("no value"), and the
reconciler treats a `None` summary field as **UNKNOWN** — it refuses to
verify against nothing. All-zeros is a genuine 0 and participates normally.
**Where the documents themselves give blank a meaning** (the assignment asks
to find one): field 46 סטטוס — a *blank* status is how MAX marks a normal,
valid record ("תנועות תקינות - יופיע ריק"); likewise blank terminal (field
9) = not a transaction, blank approval (field 12) = unapproved, blank
invoice number/date (fields 47/48) = invoice not yet issued.
**Verify with.** Real files: confirm MAX pads unused numeric fields with
spaces rather than zeros.

## 8. No file-level header/trailer records

**Assumed.** A media file is data lines only; every non-blank line is a
record. The parser skips blank lines.
**Why.** The documents describe record layouts only and never mention
header/trailer records. Real mainframe media files often do carry them —
this is the assumption most likely to need revision.
**Verify with.** The first and last lines of any real file (a wrong-length
header would currently be *rejected and reported*, so the failure mode is
visible, not silent).

## 9. Copy-paste artifacts in the 212/213 document are ignored

**Assumed.** Several 212/213 field descriptions reference "דוח ברמת תנועה"
(a transaction-level report) — e.g. fields 10 and 18 — which cannot apply to
a batch-level media. These are treated as copy-paste remnants from the
210/211 document, not as meaning that 212/213 lines sometimes carry
transaction-level semantics.
**Verify with.** MAX support, or a real 212/213 file exhibiting only
batch-level rows.
