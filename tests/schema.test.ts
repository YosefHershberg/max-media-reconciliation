/**
 * The schema is the spec: these tests pin the record lengths, prove the
 * resolved tables are contiguous, and mechanically reproduce the two
 * inconsistencies that ship in the MAX documents.
 */

import { describe, expect, it } from "vitest";

import {
  MEDIA_210_211,
  MEDIA_212_213,
  RECORD_LENGTH_210_211,
  RECORD_LENGTH_212_213,
  findSpecInconsistencies,
  validateResolvedContiguity,
} from "../src/schema.js";

describe("schema", () => {
  it("record lengths", () => {
    expect(RECORD_LENGTH_210_211).toBe(656);
    expect(RECORD_LENGTH_212_213).toBe(327);
  });

  it("resolved schemas are contiguous", () => {
    expect(() => validateResolvedContiguity(MEDIA_210_211)).not.toThrow();
    expect(() => validateResolvedContiguity(MEDIA_212_213)).not.toThrow();
  });

  it("published 210/211 has exactly the known inconsistency", () => {
    const findings = findSpecInconsistencies(MEDIA_210_211);
    expect(findings).toHaveLength(1);
    // Field 51 (tourist indicator): length column holds the END position (603).
    expect(findings[0]!.fieldNum).toBe(51);
    expect(findings[0]!.publishedStart).toBe(603);
    expect(findings[0]!.publishedLength).toBe(603);
  });

  it("published 212/213 has exactly the known inconsistency", () => {
    // Field 29 is the LAST field, so contiguity can't catch it — it is caught
    // by cross-media comparison instead (same field is 30 long in 210/211,
    // and 298 + 30 - 1 = 327, the published "length"). The contiguity scan
    // itself must be clean:
    expect(findSpecInconsistencies(MEDIA_212_213)).toHaveLength(0);
    const f29 = MEDIA_212_213[MEDIA_212_213.length - 1]!;
    expect(f29.num).toBe(29);
    expect(f29.publishedLength).toBe(327);
    expect(f29.length).toBe(30);
    const f53 = MEDIA_210_211[MEDIA_210_211.length - 1]!;
    expect(f53.hebrewName).toBe(f29.hebrewName); // same business field
    expect(f53.length).toBe(f29.length);
    // the "end position typo" theory: start + resolved length - 1 == published
    expect(f29.start + f29.length - 1).toBe(f29.publishedLength);
  });

  it("same concept may differ in width between medias", () => {
    // Explicitly expected by the assignment: e.g. the regular fee is 16 wide
    // at transaction level and 11 wide at batch level.
    const fee210 = MEDIA_210_211.find((s) => s.key === "feeRegular")!;
    const fee212 = MEDIA_212_213.find((s) => s.key === "feeRegular")!;
    expect([fee210.length, fee212.length]).toEqual([16, 11]);
  });

  it("keys are unique within each schema", () => {
    for (const schema of [MEDIA_210_211, MEDIA_212_213]) {
      const keys = schema.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
