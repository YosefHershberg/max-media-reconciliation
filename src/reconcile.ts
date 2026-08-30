/**
 * Reconciliation between transaction-level rows (210/211) and batch
 * summaries (212/213).
 *
 * Only fields the MAX documents define as aggregations of transaction-level
 * fields are compared (see DECISIONS.md, decision 4). Every check reports one
 * of PASS / FAIL / UNKNOWN:
 *
 * - PASS    — summary value equals the value derived from the transactions;
 * - FAIL    — they differ; the report carries the gap, the field, and the
 *             records involved;
 * - UNKNOWN — there is not enough information to decide (empty summary field,
 *             mixed currencies, credit-date scope mismatch). UNKNOWN is an
 *             honest answer, not a soft PASS.
 */

import {
  batchKey,
  type SummaryRecord,
  type TransactionRecord,
} from "./models.js";

export type CheckStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface Check {
  fieldLabel: string; // human label, includes MAX field numbers
  summaryValue: number | null;
  derivedValue: number | null;
  status: CheckStatus;
  gap: number | null; // summary - derived, when both known
  note: string;
}

export function renderCheck(check: Check): string {
  const parts = [
    `[${check.status}] ${check.fieldLabel}:`,
    `summary=${check.summaryValue}`,
    `derived-from-transactions=${check.derivedValue}`,
  ];
  if (check.gap) {
    parts.push(`gap=${check.gap > 0 ? "+" : ""}${check.gap}`);
  }
  if (check.note) {
    parts.push(`(${check.note})`);
  }
  return parts.join(" ");
}

export interface ReconciliationReport {
  batchKey: string;
  summary: SummaryRecord;
  transactions: TransactionRecord[];
  checks: Check[];
  notes: string[];
}

export function overallStatus(report: ReconciliationReport): CheckStatus {
  if (report.checks.some((c) => c.status === "FAIL")) return "FAIL";
  if (report.checks.some((c) => c.status === "UNKNOWN")) return "UNKNOWN";
  return "PASS";
}

export function renderReport(report: ReconciliationReport): string {
  const { summary } = report;
  const lines = [
    `=== Batch ${summary.batchNumber} (terminal ${summary.terminalNumber}) — ${overallStatus(report)} ===`,
    `credit date: ${summary.creditDate}, transactions in file: ${report.transactions.length}`,
    ...report.checks.map((c) => `  ${renderCheck(c)}`),
    ...report.notes.map((n) => `  note: ${n}`),
  ];
  return lines.join("\n");
}

type SummaryAmountKey =
  | "grossAmount"
  | "clubDiscountNoMgmt"
  | "clubMgmtFee"
  | "feeRegular"
  | "feeNonElectronic"
  | "discountingAmount"
  | "vatAmount"
  | "netAmount";

// [label, summary attr, transaction attr] — every pair here is justified by
// matching field definitions across the two documents; see DECISIONS.md.
const SUM_CHECKS: readonly [string, SummaryAmountKey, SummaryAmountKey][] = [
  ["gross amount [212 f18 vs Σ 210 f30]", "grossAmount", "grossAmount"],
  ["club discount excl. mgmt [212 f19 vs Σ 210 f34]", "clubDiscountNoMgmt", "clubDiscountNoMgmt"],
  ["club mgmt fee [212 f20 vs Σ 210 f36]", "clubMgmtFee", "clubMgmtFee"],
  ["regular fee [212 f21 vs Σ 210 f37]", "feeRegular", "feeRegular"],
  ["non-electronic fee addition [212 f22 vs Σ 210 f38]", "feeNonElectronic", "feeNonElectronic"],
  ["discounting amount [212 f23 vs Σ 210 f41]", "discountingAmount", "discountingAmount"],
  ["VAT [212 f24 vs Σ 210 f42]", "vatAmount", "vatAmount"],
  ["net amount [212 f25 vs Σ 210 f43]", "netAmount", "netAmount"],
];

/**
 * Validate one batch summary against its transaction rows.
 *
 * Policy on held/waiting rows (H/W): they are INCLUDED in derived totals —
 * the batch describes membership, the status describes timing. When a FAIL
 * gap exactly equals the held rows' contribution, the report says so, since
 * that is the most likely explanation. See DECISIONS.md, decision 5.
 */
export function reconcile(
  summary: SummaryRecord,
  transactions: TransactionRecord[],
): ReconciliationReport {
  const report: ReconciliationReport = {
    batchKey: batchKey(summary),
    summary,
    transactions,
    checks: [],
    notes: [],
  };

  // Scope guards: comparisons are only meaningful within one payment
  // currency and one credit date (field 17 of 212/213 counts vouchers
  // "בתאריך הזיכוי" — per credit date).
  const currencies = new Set(transactions.map((t) => t.paymentCurrencyCode));
  const mixedCurrency =
    currencies.size > 1 ||
    (currencies.size > 0 && !currencies.has(summary.paymentCurrencyCode));
  if (mixedCurrency) {
    report.notes.push(
      `payment currencies differ (summary '${summary.paymentCurrencyCode}', ` +
        `transactions [${[...currencies].sort().join(", ")}]) — amount checks are UNKNOWN`,
    );
  }
  const offDate = transactions.filter(
    (t) =>
      t.creditDate !== null &&
      summary.creditDate !== null &&
      t.creditDate !== summary.creditDate,
  );
  if (offDate.length > 0) {
    report.notes.push(
      `${offDate.length} transaction(s) carry a credit date different from ` +
        `the summary's — count/amount checks are UNKNOWN`,
    );
  }

  const held = transactions.filter(
    (t) => t.status === "HELD" || t.status === "WAITING",
  );
  if (held.length > 0) {
    report.notes.push(
      `${held.length} row(s) in held/waiting status included in derived totals: ` +
        held.map((t) => t.voucherNumber).join(", "),
    );
  }

  const scopeBroken = mixedCurrency || offDate.length > 0;

  // Check 1: transaction count (212 field 17 vs number of 210 rows).
  const countLabel = "transaction count [212 f17 vs row count]";
  if (summary.transactionCount === null) {
    report.checks.push({
      fieldLabel: countLabel,
      summaryValue: null,
      derivedValue: transactions.length,
      status: "UNKNOWN",
      gap: null,
      note: "summary field empty — nothing to verify against",
    });
  } else if (scopeBroken) {
    report.checks.push({
      fieldLabel: countLabel,
      summaryValue: summary.transactionCount,
      derivedValue: transactions.length,
      status: "UNKNOWN",
      gap: null,
      note: "scope mismatch, see notes",
    });
  } else {
    const count = transactions.length;
    const gap = summary.transactionCount - count;
    const check: Check = {
      fieldLabel: countLabel,
      summaryValue: summary.transactionCount,
      derivedValue: count,
      status: gap === 0 ? "PASS" : "FAIL",
      gap,
      note: "",
    };
    if (check.status === "FAIL") {
      check.note =
        `${Math.abs(gap)} transaction(s) ` +
        (gap > 0
          ? "missing from the transaction file"
          : "present in the file but not counted in the summary");
    }
    report.checks.push(check);
  }

  // Checks 2..n: summable amounts.
  for (const [label, sAttr, tAttr] of SUM_CHECKS) {
    const summaryValue = summary[sAttr];
    const derived = transactions.reduce((acc, t) => acc + (t[tAttr] ?? 0), 0);
    if (summaryValue === null) {
      report.checks.push({
        fieldLabel: label,
        summaryValue: null,
        derivedValue: derived,
        status: "UNKNOWN",
        gap: null,
        note: "summary field empty — cannot verify",
      });
      continue;
    }
    if (scopeBroken) {
      report.checks.push({
        fieldLabel: label,
        summaryValue,
        derivedValue: derived,
        status: "UNKNOWN",
        gap: null,
        note: "scope mismatch, see notes",
      });
      continue;
    }
    if (summaryValue === derived) {
      report.checks.push({
        fieldLabel: label,
        summaryValue,
        derivedValue: derived,
        status: "PASS",
        gap: null,
        note: "",
      });
      continue;
    }
    const gap = summaryValue - derived;
    const heldTotal = held.reduce((acc, t) => acc + (t[tAttr] ?? 0), 0);
    const check: Check = {
      fieldLabel: label,
      summaryValue,
      derivedValue: derived,
      status: "FAIL",
      gap,
      note: "",
    };
    if (held.length > 0 && gap === -heldTotal && heldTotal !== 0) {
      check.note =
        "gap equals the held/waiting rows' total — if MAX excludes held " +
        "rows from summaries, that explains it";
    } else {
      check.note = `rows involved: ${transactions.map((t) => t.voucherNumber).join(", ")}`;
    }
    report.checks.push(check);
  }

  return report;
}

/**
 * Group transactions by (terminal, batch) and reconcile each summary.
 *
 * Returns the reports plus any transactions whose batch has no summary
 * (orphans — money claimed at transaction level with no batch backing it).
 */
export function reconcileAll(
  summaries: SummaryRecord[],
  transactions: TransactionRecord[],
): { reports: ReconciliationReport[]; orphans: TransactionRecord[] } {
  const byBatch = new Map<string, TransactionRecord[]>();
  for (const t of transactions) {
    const key = batchKey(t);
    const group = byBatch.get(key);
    if (group) group.push(t);
    else byBatch.set(key, [t]);
  }

  const reports = summaries.map((s) => {
    const key = batchKey(s);
    const group = byBatch.get(key) ?? [];
    byBatch.delete(key);
    return reconcile(s, group);
  });
  const orphans = [...byBatch.values()].flat();
  return { reports, orphans };
}
