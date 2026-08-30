/**
 * Round-trip: build fixed-width lines from typed values through the schema,
 * parse them back, and require exact equality. This proves the builder and
 * the parser agree on every offset, width, and conversion — a disagreement
 * in either direction fails here.
 */

import { describe, expect, it } from "vitest";

import {
  FIXTURE_SUMMARIES,
  FIXTURE_TRANSACTIONS,
  renderLine,
  type FixtureValues,
} from "../src/fixtures.js";
import type { SummaryRecord, TransactionRecord } from "../src/models.js";
import { parseLine } from "../src/parser.js";
import { MEDIA_210_211, MEDIA_212_213, type FieldSpec } from "../src/schema.js";

/**
 * Normalize a fixture value to the model's blank semantics: text and
 * identifier fields are '' when blank, status defaults to OK, exception to
 * '', and numeric/date fields stay null.
 */
function expected(values: FixtureValues, spec: FieldSpec): unknown {
  const value = values[spec.key];
  if (spec.kind === "text" || spec.kind === "ident") {
    return value ?? "";
  }
  if (spec.kind === "status") {
    return value ?? "OK";
  }
  if (spec.kind === "exception") {
    return value ?? "";
  }
  return value ?? null;
}

function roundtrip<T extends TransactionRecord | SummaryRecord>(
  schema: readonly FieldSpec[],
  values: FixtureValues,
): T {
  const line = renderLine(schema, values);
  const { record, issues } = parseLine<T>(line, schema);
  expect(issues).toEqual([]);
  expect(record).not.toBeNull();
  return record!;
}

describe("round-trip", () => {
  it("transactions survive build -> parse -> compare", () => {
    for (const values of FIXTURE_TRANSACTIONS) {
      const record = roundtrip<TransactionRecord>(MEDIA_210_211, values);
      for (const spec of MEDIA_210_211) {
        if (!spec.modelAttr) continue;
        const actual = (record as unknown as Record<string, unknown>)[spec.key];
        expect(actual, `field ${spec.num} (${spec.key})`).toEqual(
          expected(values, spec),
        );
      }
    }
  });

  it("summaries survive build -> parse -> compare", () => {
    for (const values of FIXTURE_SUMMARIES) {
      const record = roundtrip<SummaryRecord>(MEDIA_212_213, values);
      for (const spec of MEDIA_212_213) {
        if (!spec.modelAttr) continue;
        const actual = (record as unknown as Record<string, unknown>)[spec.key];
        expect(actual, `field ${spec.num} (${spec.key})`).toEqual(
          expected(values, spec),
        );
      }
    }
  });
});
