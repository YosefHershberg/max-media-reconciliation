/**
 * Schema-driven fixed-width parser for MAX medias.
 *
 * One generic engine reads any media whose schema is declared in `schema.ts`.
 *
 * Line-length policy (see ASSUMPTIONS.md): a line whose length differs from
 * the schema's record length is REJECTED — no record is produced. Truncating
 * or padding would silently shift money between fields, which is exactly the
 * class of error this engine exists to catch. Field-level conversion failures
 * on a correctly-sized line FLAG the record: the record is produced with the
 * failing fields set to null and the problems listed, so one bad date does
 * not discard an otherwise-usable money row.
 */

import { readFileSync } from "node:fs";

import { CONVERTERS, FieldConversionError } from "./convert.js";
import type { SummaryRecord, TransactionRecord } from "./models.js";
import { fieldSlice, recordLength, type FieldSpec } from "./schema.js";

export interface Issue {
  lineNumber: number;
  fieldNum: number | null; // null -> line-level issue
  fieldKey: string | null;
  message: string;
}

export function formatIssue(issue: Issue): string {
  const where =
    issue.fieldNum !== null
      ? `field ${issue.fieldNum} (${issue.fieldKey})`
      : "line";
  return `line ${issue.lineNumber}, ${where}: ${issue.message}`;
}

export interface ParseResult<T> {
  records: T[];
  rejected: Issue[]; // line rejected entirely
  flagged: Issue[];  // record produced with issues
}

export interface ParsedLine<T> {
  record: T | null; // null only when the line is rejected (wrong length)
  issues: Issue[];
}

/** Parse one raw fixed-width line against a schema. */
export function parseLine<T extends TransactionRecord | SummaryRecord>(
  line: string,
  schema: readonly FieldSpec[],
  lineNumber = 1,
): ParsedLine<T> {
  const issues: Issue[] = [];
  const expected = recordLength(schema);
  if (line.length !== expected) {
    issues.push({
      lineNumber,
      fieldNum: null,
      fieldKey: null,
      message: `line length ${line.length} != expected ${expected}; line rejected`,
    });
    return { record: null, issues };
  }

  const values: Record<string, unknown> = {};
  const rawExtras: Record<string, string> = {};
  for (const spec of schema) {
    const raw = fieldSlice(spec, line);
    if (!spec.modelAttr) {
      rawExtras[spec.key] = raw.trim();
      continue;
    }
    try {
      values[spec.key] = CONVERTERS[spec.kind](raw);
    } catch (err) {
      if (!(err instanceof FieldConversionError)) throw err;
      issues.push({
        lineNumber,
        fieldNum: spec.num,
        fieldKey: spec.key,
        message: err.message,
      });
      values[spec.key] = null;
    }
  }

  values.rawExtras = rawExtras;
  return { record: values as T, issues };
}

export function parseLines<T extends TransactionRecord | SummaryRecord>(
  lines: readonly string[],
  schema: readonly FieldSpec[],
): ParseResult<T> {
  const result: ParseResult<T> = { records: [], rejected: [], flagged: [] };
  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/[\r\n]+$/, "");
    if (line.trim() === "") return; // ignore blank lines / trailing newline
    const { record, issues } = parseLine<T>(line, schema, index + 1);
    if (record === null) {
      result.rejected.push(...issues);
    } else {
      result.records.push(record);
      result.flagged.push(...issues);
    }
  });
  return result;
}

/**
 * Parse a media file.
 *
 * Positions are measured in characters of the decoded text, so the same
 * schema works for a single-byte Hebrew encoding (ISO-8859-8 / CP862, where
 * characters == bytes) and for the UTF-8 fixtures in this repo.
 * See ASSUMPTIONS.md ("characters vs. bytes").
 */
export function parseFile<T extends TransactionRecord | SummaryRecord>(
  path: string,
  schema: readonly FieldSpec[],
  encoding: string = "utf-8",
): ParseResult<T> {
  const buffer = readFileSync(path);
  const text = new TextDecoder(encoding).decode(buffer);
  return parseLines<T>(text.split(/\r?\n/), schema);
}
