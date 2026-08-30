import { describe, expect, it } from "vitest";

import {
  FIXTURE_TRANSACTIONS,
  invalidLines,
  renderLine,
  summaryLines,
  transactionLines,
} from "../src/fixtures.js";
import {
  rowKey,
  transactionKey,
  type SummaryRecord,
  type TransactionRecord,
} from "../src/models.js";
import { parseLine, parseLines } from "../src/parser.js";
import {
  MEDIA_210_211,
  MEDIA_212_213,
  RECORD_LENGTH_210_211,
  RECORD_LENGTH_212_213,
} from "../src/schema.js";

describe("parser", () => {
  it("fixture lines have exact record length", () => {
    expect(new Set(transactionLines().map((l) => l.length)))
      .toEqual(new Set([RECORD_LENGTH_210_211]));
    expect(new Set(summaryLines().map((l) => l.length)))
      .toEqual(new Set([RECORD_LENGTH_212_213]));
  });

  it("parses a regular transaction", () => {
    const { record, issues } = parseLine<TransactionRecord>(
      transactionLines()[0]!, MEDIA_210_211);
    expect(issues).toEqual([]);
    expect(record!.merchantId).toBe("512345678");
    expect(record!.terminalNumber).toBe("0001234567");   // leading zeros intact
    expect(record!.batchNumber).toBe("00000001");
    expect(record!.voucherNumber).toBe("000000000000101");
    expect(record!.transactionDate).toBe("2026-08-02");
    expect(record!.creditDate).toBe("2026-08-05");
    expect(record!.grossAmount).toBe(50000);             // agorot
    expect(record!.feeRegular).toBe(1000);
    expect(record!.vatAmount).toBe(180);
    expect(record!.netAmount).toBe(48820);
    expect(record!.status).toBe("OK");                   // blank status == OK
    expect(record!.businessName).toBe("בית עסק לדוגמה"); // Hebrew round-trips
    expect(record!.invoiceNumber).toBe("");              // empty, not zero
    expect(record!.invoiceDate).toBeNull();
  });

  it("parses an installment transaction", () => {
    const { record, issues } = parseLine<TransactionRecord>(
      transactionLines()[3]!, MEDIA_210_211);
    expect(issues).toEqual([]);
    expect(record!.installmentNumber).toBe(2);
    expect(record!.originalAmount).toBe(120000);         // full deal
    expect(record!.grossAmount).toBe(20000);             // current payment only
    expect(transactionKey(record!)).toBe("arn:25123456789012345678904");
    expect(rowKey(record!).endsWith("#2")).toBe(true);   // payment number in row identity
  });

  it("parses a held-status row", () => {
    const { record, issues } = parseLine<TransactionRecord>(
      transactionLines()[4]!, MEDIA_210_211);
    expect(issues).toEqual([]);
    expect(record!.status).toBe("HELD");
  });

  it("parses a summary", () => {
    const { record, issues } = parseLine<SummaryRecord>(
      summaryLines()[0]!, MEDIA_212_213);
    expect(issues).toEqual([]);
    expect(record!.batchNumber).toBe("00000001");
    expect(record!.transactionCount).toBe(5);
    expect(record!.grossAmount).toBe(130000);
    expect(record!.netAmount).toBe(126932);
  });

  it("empty summary field is null, not zero", () => {
    const { record } = parseLine<SummaryRecord>(summaryLines()[1]!, MEDIA_212_213);
    expect(record!.clubDiscountNoMgmt).toBeNull();
    expect(record!.clubMgmtFee).toBeNull();
    // while an explicitly zero-filled field is a real 0:
    expect(record!.feeNonElectronic).toBe(0);
  });

  it("rejects a wrong-length line", () => {
    const truncated = invalidLines()[0]!;
    const { record, issues } = parseLine(truncated, MEDIA_210_211);
    expect(record).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("length");
  });

  it("flags a bad date without rejecting the record", () => {
    const badDateLine = invalidLines()[1]!;
    const { record, issues } = parseLine<TransactionRecord>(
      badDateLine, MEDIA_210_211);
    expect(record).not.toBeNull();                       // money row still usable
    expect(record!.transactionDate).toBeNull();
    expect(issues.some((i) => i.fieldNum === 13)).toBe(true); // failing field named
    expect(record!.grossAmount).toBe(10000);             // rest parsed fine
  });

  it("parses a negative amount", () => {
    const values = { ...FIXTURE_TRANSACTIONS[0]!, grossAmount: -12345 }; // e.g. a cancellation
    const line = renderLine(MEDIA_210_211, values);
    const { record, issues } = parseLine<TransactionRecord>(line, MEDIA_210_211);
    expect(issues).toEqual([]);
    expect(record!.grossAmount).toBe(-12345);
  });

  it("skips blank lines and reports rejects with line numbers", () => {
    const lines = [...transactionLines(), "", invalidLines()[0]!];
    const result = parseLines<TransactionRecord>(lines, MEDIA_210_211);
    expect(result.records).toHaveLength(8);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.lineNumber).toBe(10); // blank line 9 kept in numbering
  });
});
