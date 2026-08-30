/**
 * The --json payload is built programmatically (runReport + toJsonPayload,
 * the same functions main() uses) and round-tripped through
 * JSON.stringify/parse to assert on exactly what a consumer would read.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runReport, toJsonPayload, type JsonPayload } from "../src/cli.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

const INPUTS = {
  transactions: join(FIXTURES, "media_210.txt"),
  summaries: join(FIXTURES, "media_212.txt"),
  encoding: "utf-8",
};

function payloadFromFixtures(): { payload: JsonPayload; exitCode: number } {
  const run = runReport(INPUTS);
  // serialize -> parse, so the assertions cover the actual JSON document
  const payload = JSON.parse(
    JSON.stringify(toJsonPayload(INPUTS, run), null, 2),
  ) as JsonPayload;
  return { payload, exitCode: run.exitCode };
}

describe("cli --json payload", () => {
  it("reports batch statuses, gaps, and the worst overall", () => {
    const { payload, exitCode } = payloadFromFixtures();

    expect(payload.inputs.transactions).toBe(INPUTS.transactions);
    expect(payload.parseIssues.transactions.rejected).toEqual([]);
    expect(payload.parseIssues.summaries.rejected).toEqual([]);

    const batchA = payload.batches.find((b) => b.batchNumber === "00000001")!;
    expect(batchA.overall).toBe("PASS");
    expect(batchA.terminal).toBe("0001234567");
    expect(batchA.transactionCountInFile).toBe(5);

    const batchB = payload.batches.find((b) => b.batchNumber === "00000002")!;
    expect(batchB.overall).toBe("FAIL");

    const byLabel = new Map(batchB.checks.map((c) => [c.fieldLabel, c]));
    const gross = byLabel.get("gross amount [212 f18 vs Σ 210 f30]")!;
    expect(gross.status).toBe("FAIL");
    expect(gross.gap).toBe(5000);                 // integer agorot, not shekels

    const count = byLabel.get("transaction count [212 f17 vs row count]")!;
    expect(count.gap).toBe(1);

    // blank summary fields stay null in JSON — distinct from 0
    const clubChecks = batchB.checks.filter((c) => c.status === "UNKNOWN");
    expect(clubChecks.map((c) => c.fieldLabel).sort()).toEqual([
      "club discount excl. mgmt [212 f19 vs Σ 210 f34]",
      "club mgmt fee [212 f20 vs Σ 210 f36]",
    ]);
    for (const c of clubChecks) {
      expect(c.summaryValue).toBeNull();
    }

    expect(payload.overall).toBe("FAIL");         // worst across batches
    expect(payload.orphans).toEqual([]);
    expect(exitCode).toBe(1);                     // unchanged exit semantics
  });
});
