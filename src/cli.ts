/**
 * Small CLI: parse media files and print a reconciliation report.
 *
 * Usage (from the solution directory):
 *   npm run report
 *   # or directly:
 *   npx tsx src/cli.ts --transactions fixtures/media_210.txt \
 *                      --summaries fixtures/media_212.txt [--json]
 *
 * `--json` writes a single machine-readable JSON document into the reports/
 * directory (created if missing) instead of printing the text render.
 * Amounts stay integer agorot and blank fields stay null in the JSON too —
 * converting to decimal shekels would invite float drift, and null-vs-0 is
 * a semantic distinction (see DECISIONS.md, decision 2).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { SummaryRecord, TransactionRecord } from "./models.js";
import {
  formatIssue,
  parseFile,
  type Issue,
  type ParseResult,
} from "./parser.js";
import {
  overallStatus,
  reconcileAll,
  renderReport,
  type CheckStatus,
  type ReconciliationReport,
} from "./reconcile.js";
import { MEDIA_210_211, MEDIA_212_213 } from "./schema.js";

export interface ReportInputs {
  transactions: string;
  summaries: string;
  encoding: string;
}

export interface ReportRun {
  txnResult: ParseResult<TransactionRecord>;
  sumResult: ParseResult<SummaryRecord>;
  reports: ReconciliationReport[];
  orphans: TransactionRecord[];
  exitCode: number;
}

/** Parse both files and reconcile. Shared by the text and JSON outputs. */
export function runReport(inputs: ReportInputs): ReportRun {
  const txnResult = parseFile<TransactionRecord>(
    inputs.transactions, MEDIA_210_211, inputs.encoding);
  const sumResult = parseFile<SummaryRecord>(
    inputs.summaries, MEDIA_212_213, inputs.encoding);
  const { reports, orphans } = reconcileAll(sumResult.records, txnResult.records);

  const anyFail = reports.some((r) => overallStatus(r) === "FAIL");
  const exitCode =
    anyFail || txnResult.rejected.length > 0 || sumResult.rejected.length > 0
      ? 1
      : 0;
  return { txnResult, sumResult, reports, orphans, exitCode };
}

interface JsonIssues {
  rejected: Issue[];
  flagged: Issue[];
}

export interface JsonPayload {
  inputs: ReportInputs;
  parseIssues: {
    transactions: JsonIssues;
    summaries: JsonIssues;
  };
  batches: {
    terminal: string;
    batchNumber: string;
    creditDate: string | null;
    overall: CheckStatus;
    transactionCountInFile: number;
    checks: {
      fieldLabel: string;
      summaryValue: number | null;
      derivedValue: number | null;
      gap: number | null;
      status: CheckStatus;
      note: string;
    }[];
    notes: string[];
  }[];
  orphans: {
    terminal: string;
    batchNumber: string;
    voucherNumber: string;
  }[];
  overall: CheckStatus;
}

/** Shape the run into the machine-readable document printed by --json. */
export function toJsonPayload(inputs: ReportInputs, run: ReportRun): JsonPayload {
  const batchStatuses = run.reports.map(overallStatus);
  const overall: CheckStatus = batchStatuses.includes("FAIL")
    ? "FAIL"
    : batchStatuses.includes("UNKNOWN")
      ? "UNKNOWN"
      : "PASS";

  return {
    inputs,
    parseIssues: {
      transactions: {
        rejected: run.txnResult.rejected,
        flagged: run.txnResult.flagged,
      },
      summaries: {
        rejected: run.sumResult.rejected,
        flagged: run.sumResult.flagged,
      },
    },
    batches: run.reports.map((report) => ({
      terminal: report.summary.terminalNumber,
      batchNumber: report.summary.batchNumber,
      creditDate: report.summary.creditDate,
      overall: overallStatus(report),
      transactionCountInFile: report.transactions.length,
      checks: report.checks.map((c) => ({
        fieldLabel: c.fieldLabel,
        summaryValue: c.summaryValue,
        derivedValue: c.derivedValue,
        gap: c.gap,
        status: c.status,
        note: c.note,
      })),
      notes: report.notes,
    })),
    orphans: run.orphans.map((t) => ({
      terminal: t.terminalNumber,
      batchNumber: t.batchNumber,
      voucherNumber: t.voucherNumber,
    })),
    overall,
  };
}

function printText(run: ReportRun): void {
  const sections: [string, ParseResult<unknown>][] = [
    ["transactions", run.txnResult],
    ["summaries", run.sumResult],
  ];
  for (const [label, result] of sections) {
    console.log(
      `${label}: ${result.records.length} record(s) parsed, ` +
        `${result.rejected.length} rejected, ${result.flagged.length} field issue(s)`,
    );
    for (const issue of [...result.rejected, ...result.flagged]) {
      console.log(`  ! ${formatIssue(issue)}`);
    }
  }
  console.log();

  for (const report of run.reports) {
    console.log(renderReport(report));
    console.log();
  }
  if (run.orphans.length > 0) {
    console.log(
      "ORPHAN transactions (no matching summary): " +
        run.orphans.map((t) => t.voucherNumber).join(", "),
    );
  }
}

export function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      transactions: { type: "string" },
      summaries: { type: "string" },
      encoding: { type: "string", default: "utf-8" },
      json: { type: "boolean", default: false },
    },
  });
  if (!values.transactions || !values.summaries) {
    console.error(
      "usage: tsx src/cli.ts --transactions <media 210/211 file> " +
        "--summaries <media 212/213 file> [--encoding utf-8] [--json]",
    );
    return 2;
  }

  const inputs: ReportInputs = {
    transactions: values.transactions,
    summaries: values.summaries,
    encoding: values.encoding,
  };
  const run = runReport(inputs);

  if (values.json) {
    const path = writeJsonReport(inputs, run);
    console.log(`report written to ${path}`);
  } else {
    printText(run);
  }
  return run.exitCode;
}

export const REPORTS_DIR = "reports";

/**
 * Write the JSON document to reports/report-<timestamp>.json (timestamped so
 * consecutive runs don't overwrite each other) and return the path.
 */
export function writeJsonReport(inputs: ReportInputs, run: ReportRun): string {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = join(REPORTS_DIR, `report-${stamp}.json`);
  writeFileSync(path, JSON.stringify(toJsonPayload(inputs, run), null, 2) + "\n", "utf-8");
  return path;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  process.exitCode = main(process.argv.slice(2));
}
