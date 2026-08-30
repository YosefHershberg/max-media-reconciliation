# MAX Media Ingestion & Reconciliation Engine

A miniature clearing-reconciliation engine for MAX ("מדיות"): it parses
fixed-width **media 210/211** (transaction-level credits) and **media
212/213** (batch-level credits), normalizes them into an internal model, and
cross-checks the batch summaries against the transactions they claim to
aggregate — reporting **PASS / FAIL / UNKNOWN** per field, with the size of
each gap and the rows involved.

## How to run

Requires Node.js 20+.

```bash
# 1. install
npm install

# 2. run: parse the fixtures and print the reconciliation report
npm run report

# 2b. same run, but written as JSON to reports/ instead of printed
npm run report:json

# 3. tests
npm test
```

All commands run from this directory. The CLI exits non-zero when any batch
FAILs or any line is rejected, so it can gate a pipeline. To point it at
other files:

```bash
npx tsx src/cli.ts --transactions <file> --summaries <file> [--encoding utf-8] [--json]
```

### Machine-readable output (`--json`)

Passing `--json` writes one JSON document to
`reports/report-<timestamp>.json` (the directory is created if missing;
timestamped names keep consecutive runs from overwriting each other) instead
of printing the text render. Exit-code behavior is identical. For the
bundled fixtures there is a shortcut: `npm run report:json`. Amounts remain **integer agorot**
and blank fields remain **null** — decimal conversion would invite float
drift, and null-vs-0 is a semantic distinction the engine preserves
end-to-end. Trimmed example:

```json
{
  "inputs": { "transactions": "fixtures/media_210.txt", "summaries": "fixtures/media_212.txt", "encoding": "utf-8" },
  "parseIssues": {
    "transactions": { "rejected": [], "flagged": [] },
    "summaries": { "rejected": [], "flagged": [] }
  },
  "batches": [
    {
      "terminal": "0001234567",
      "batchNumber": "00000002",
      "creditDate": "2026-08-05",
      "overall": "FAIL",
      "transactionCountInFile": 3,
      "checks": [
        {
          "fieldLabel": "gross amount [212 f18 vs Σ 210 f30]",
          "summaryValue": 90000,
          "derivedValue": 85000,
          "gap": 5000,
          "status": "FAIL",
          "note": "rows involved: 000000000000201, 000000000000202, 000000000000203"
        }
      ],
      "notes": []
    }
  ],
  "orphans": [],
  "overall": "FAIL"
}
```

`overall` is the worst status across batches (FAIL > UNKNOWN > PASS);
`parseIssues` reuses the parser's Issue objects (`lineNumber`, `fieldNum`,
`fieldKey`, `message`).

To regenerate the fixture files from their typed definitions:
`npm run fixtures`. To typecheck: `npm run typecheck`.

## What it does

1. **Schema** ([src/schema.ts](src/schema.ts)) — every field of both medias,
   with the 1-based positions copied verbatim from the MAX documents. This
   is the only place offsets exist. The published length column is kept
   alongside the resolved one, and `findSpecInconsistencies()` mechanically
   reproduces the two errors that ship in the PDFs (see DECISIONS.md,
   decision 1).
2. **Parser** ([src/parser.ts](src/parser.ts)) — one generic, schema-driven
   fixed-width engine for both medias. Wrong-length lines are **rejected**;
   field-level conversion failures **flag** the record but keep it. Handles
   padding, leading zeros, blank-vs-zero, negative amounts, Hebrew text.
3. **Model** ([src/models.ts](src/models.ts)) — typed records: identifiers
   stay strings, money is integer agorot, dates are ISO `YYYY-MM-DD`
   strings, status/exception codes are closed unions. Transaction identity
   and the transaction→batch link are functions with the reasoning attached
   (`transactionKey`, `rowKey`, `batchKey`).
4. **Reconciliation** ([src/reconcile.ts](src/reconcile.ts)) — groups
   transactions by (terminal, batch number), validates each summary field
   that is defined as an aggregate of transaction fields, and emits a
   per-field PASS/FAIL/UNKNOWN report. Orphan transactions (no summary) are
   reported too.
5. **Fixtures** ([src/fixtures.ts](src/fixtures.ts), rendered into
   [fixtures/](fixtures/)) — synthetic, spec-derived, real fixed-width:
   8 transactions + 2 summaries. Batch 1 reconciles exactly (PASS); batch 2
   has one deliberately-untransmitted transaction, so every gap in its FAIL
   report is explained by that single missing row. `invalid_lines.txt` holds
   the negative fixtures (truncated line → rejected; impossible date →
   flagged).

## Directory layout

```
solution/
├── src/
│   ├── schema.ts       # field tables for both medias — single source of truth
│   ├── convert.ts      # raw slice <-> typed value converters (+ renderers)
│   ├── models.ts       # TransactionRecord, SummaryRecord, Status, ExceptionCode
│   ├── parser.ts       # generic schema-driven fixed-width parser
│   ├── reconcile.ts    # PASS/FAIL/UNKNOWN validation of summaries vs transactions
│   ├── fixtures.ts     # typed fixture definitions + fixed-width renderer
│   └── cli.ts          # npm run report / npx tsx src/cli.ts …
├── fixtures/
│   ├── media_210.txt   # 8 transaction rows (656 chars each)
│   ├── media_212.txt   # 2 summary rows (327 chars each)
│   └── invalid_lines.txt
├── tests/              # schema, parser, round-trip, reconciliation (vitest)
├── package.json  tsconfig.json
├── README.md  DECISIONS.md  ASSUMPTIONS.md  AI-NOTES.md
```

Stack: TypeScript (strict mode) on Node, run directly via `tsx` — no build
step. Runtime code is dependency-free; `tsx`, `vitest` and `typescript` are
dev-only.

## Field coverage

Both schemas cover **every** field positionally (53 fields in 210/211, 29 in
212/213), so no bytes are unaccounted for. Fields are normalized into typed
model attributes when they serve identity, dating, money, or validation;
fields marked `model: false` in the schema (brand names, bank routing
details, club metadata, rates, EMV identifiers) are captured raw into
`record.rawExtras` and not further typed. The full list is greppable:
`model: false` in [src/schema.ts](src/schema.ts).

## Documentation map

- **DECISIONS.md** — the 5 significant design decisions, each with the MAX
  field numbers used as evidence, the alternative considered, and the choice.
- **ASSUMPTIONS.md** — every place the documents are ambiguous, what was
  assumed, and what would verify it.
- **AI-NOTES.md** — AI tools used and two required worked examples.
