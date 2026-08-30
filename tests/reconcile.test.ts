import { describe, expect, it } from "vitest";

import { summaryLines, transactionLines } from "../src/fixtures.js";
import type { SummaryRecord, TransactionRecord } from "../src/models.js";
import { parseLines } from "../src/parser.js";
import { overallStatus, reconcile, reconcileAll } from "../src/reconcile.js";
import { MEDIA_210_211, MEDIA_212_213 } from "../src/schema.js";

function parsed(): { sums: SummaryRecord[]; txns: TransactionRecord[] } {
  const txns = parseLines<TransactionRecord>(
    transactionLines(), MEDIA_210_211).records;
  const sums = parseLines<SummaryRecord>(
    summaryLines(), MEDIA_212_213).records;
  return { sums, txns };
}

describe("reconcile", () => {
  it("batch A is a full PASS", () => {
    const { sums, txns } = parsed();
    const { reports, orphans } = reconcileAll(sums, txns);
    expect(orphans).toEqual([]);
    const reportA = reports.find((r) => r.summary.batchNumber === "00000001")!;
    expect(overallStatus(reportA)).toBe("PASS");
    expect(reportA.checks.every((c) => c.status === "PASS")).toBe(true);
    // the held row is included in the totals and disclosed in the notes
    expect(reportA.notes.some((n) => n.includes("held"))).toBe(true);
  });

  it("batch B fails with an explained gap", () => {
    const { sums, txns } = parsed();
    const { reports } = reconcileAll(sums, txns);
    const reportB = reports.find((r) => r.summary.batchNumber === "00000002")!;
    expect(overallStatus(reportB)).toBe("FAIL");

    const byLabel = new Map(reportB.checks.map((c) => [c.fieldLabel, c]));
    const count = byLabel.get("transaction count [212 f17 vs row count]")!;
    expect(count.status).toBe("FAIL");
    expect(count.gap).toBe(1);                 // one row missing from the file
    expect(count.note).toContain("missing");

    const gross = byLabel.get("gross amount [212 f18 vs Σ 210 f30]")!;
    expect(gross.status).toBe("FAIL");
    expect(gross.gap).toBe(5000);              // exactly the untransmitted txn
    expect(gross.summaryValue).toBe(90000);
    expect(gross.derivedValue).toBe(85000);

    const net = byLabel.get("net amount [212 f25 vs Σ 210 f43]")!;
    expect(net.gap).toBe(4882);                // consistent with one missing row
  });

  it("empty summary fields report UNKNOWN, not PASS", () => {
    const { sums, txns } = parsed();
    const { reports } = reconcileAll(sums, txns);
    const reportB = reports.find((r) => r.summary.batchNumber === "00000002")!;
    const unknowns = reportB.checks.filter((c) => c.status === "UNKNOWN");
    expect(new Set(unknowns.map((c) => c.fieldLabel))).toEqual(new Set([
      "club discount excl. mgmt [212 f19 vs Σ 210 f34]",
      "club mgmt fee [212 f20 vs Σ 210 f36]",
    ]));
    for (const c of unknowns) {
      expect(c.summaryValue).toBeNull();
      expect(c.note).toContain("empty");
    }
  });

  it("a summary without transactions is a clear FAIL", () => {
    const { sums } = parsed();
    const summaryA = sums.find((s) => s.batchNumber === "00000001")!;
    const report = reconcile(summaryA, []);
    expect(overallStatus(report)).toBe("FAIL");
    const count = report.checks[0]!;
    expect(count.summaryValue).toBe(5);
    expect(count.derivedValue).toBe(0);
  });

  it("orphan transactions are reported", () => {
    const { sums, txns } = parsed();
    const onlyA = sums.filter((s) => s.batchNumber === "00000001");
    const { orphans } = reconcileAll(onlyA, txns);
    expect(new Set(orphans.map((t) => t.batchNumber))).toEqual(
      new Set(["00000002"]));
  });

  it("mixed currency turns amount checks UNKNOWN", () => {
    const { sums, txns } = parsed();
    const summaryA = sums.find((s) => s.batchNumber === "00000001")!;
    const batchATxns = txns.filter((t) => t.batchNumber === "00000001");
    batchATxns[0]!.paymentCurrencyCode = "840"; // one row in USD
    const report = reconcile(summaryA, batchATxns);
    expect(overallStatus(report)).toBe("UNKNOWN");
    expect(report.checks.every((c) => c.status === "UNKNOWN")).toBe(true);
    expect(report.notes.some((n) => n.includes("currencies differ"))).toBe(true);
  });
});
