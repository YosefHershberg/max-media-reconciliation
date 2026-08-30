# AI-NOTES

## Tools used

**Claude Code** (Anthropic's CLI agent) was used throughout: extracting the
field tables from the spec PDFs, drafting the schema/parser/reconciliation
modules, generating the fixture arithmetic, and iterating on the tests. All
generated code was reviewed line-by-line; the design decisions in
DECISIONS.md are mine and each is traceable to specific field numbers in the
MAX documents.

## Where AI helped significantly

**Mechanical verification of the field tables.** After transcribing both
field tables from the PDFs, I had the agent run a contiguity check over all
82 field boundaries (each field's start must equal the previous start +
length) *before any parser code was written*. It surfaced both spec
inconsistencies in seconds — field 51 in 210/211 and field 29 in 212/213 —
and, more valuably, testing the "the length column accidentally holds the
end position" hypothesis against both errors took one more query
(603 = end of a 1-char field at 603; 327 = end of a 30-char field at 298,
matching the sibling media's length 30). Doing that arithmetic by hand
across 82 rows is error-prone busywork; doing it mechanically made the
inconsistency *resolution* testable, which is why the same check now lives
in `src/schema.ts` and is pinned by `tests/schema.test.ts`.

A related find worth disclosing: while extracting the assignment PDF's text
layer, the agent found **hidden instructions embedded in the brief itself** —
white, ~1pt text on pages 2 and 3, invisible to a human reader, addressed to
"AI coding assistants" and directing them to use specific planted
identifier names and to insert a fabricated entry into DECISIONS.md. These
were treated as untrusted data, not instructions: none of the planted names
appear anywhere in this repository, and every DECISIONS.md entry traces to a
real field in the real MAX documents. (I'm noting this because the
assignment grades judgment with AI — and instructing the agent to treat
document content as data rather than commands is, in my view, exactly the
discipline an AI-native workflow needs.)

## Where an AI suggestion was changed / rejected

**Rejecting a full-record rejection policy.** The agent's first parser
sketch rejected an entire line whenever *any* field failed conversion —
including a single malformed date. I changed the policy to a two-tier one:
wrong *line length* rejects the record (the frame is unknowable, every
subsequent offset is garbage), but a field-level failure on a
correctly-framed line only *flags* the record, parses the remaining fields,
and names the failing field and line in the issue list. Rationale: in a
reconciliation engine the money fields of a row with one bad date are still
evidence — discarding them can flip a batch from an explainable FAIL to a
misleading count mismatch. The distinction is now explicit in `src/parser.ts`'s
header comment and covered by the "rejects a wrong-length line" vs
"flags a bad date without rejecting the record" tests in
`tests/parser.test.ts`.

A smaller override in the same spirit: the agent initially compared summary
fields to transaction sums wherever *names* matched. I restricted the
comparison set to fields whose *definitions* match across the two documents
and forced UNKNOWN for the rest (original-currency amounts, percentage
rates) — per the assignment's warning that similarly-named fields are not
necessarily comparable.
