/**
 * Converters between raw fixed-width slices and typed model values.
 *
 * Conventions (each is a documented decision or assumption — see DECISIONS.md
 * and ASSUMPTIONS.md):
 *
 * - Empty (all spaces) is distinct from all-zeros: empty numeric/date fields
 *   become null ("no value"); an all-zeros amount is a real 0.
 * - Amounts are integer agorot with no decimal point in the file; a negative
 *   amount is a leading '-' immediately before the digits.
 * - Dates are DD/MM/YYYY in the file, normalized to ISO YYYY-MM-DD.
 * - Identifiers are stripped of surrounding spaces only — leading zeros are
 *   preserved and the value is never converted to a number.
 */

import {
  EXCEPTION_CODES,
  STATUS_FROM_LETTER,
  STATUS_TO_LETTER,
  type ExceptionCode,
  type IsoDate,
  type Status,
} from "./models.js";
import type { Kind } from "./schema.js";

/** A slice could not be converted to its declared type. */
export class FieldConversionError extends Error {}

const isBlank = (raw: string): boolean => raw.trim() === "";
const isDigits = (s: string): boolean => /^[0-9]+$/.test(s);

export function convertText(raw: string): string {
  return raw.trim();
}

export function convertIdent(raw: string): string {
  // Strip padding spaces only. Never Number() an identifier: leading zeros
  // are significant (bank accounts, terminals) and masked card numbers
  // contain non-digits. See DECISIONS.md, decision 2.
  return raw.trim();
}

export function convertInt(raw: string): number | null {
  if (isBlank(raw)) return null;
  const stripped = raw.trim();
  if (!isDigits(stripped)) {
    throw new FieldConversionError(`expected digits, got ${JSON.stringify(stripped)}`);
  }
  return parseInt(stripped, 10);
}

/**
 * Agorot as integer. Accepts zero padding and an optional leading '-'
 * (e.g. '-000000000012345' or '0000000000012345').
 */
export function convertAmount(raw: string): number | null {
  if (isBlank(raw)) return null;
  const stripped = raw.trim();
  const negative = stripped.startsWith("-");
  const digits = negative ? stripped.slice(1) : stripped;
  if (!isDigits(digits)) {
    throw new FieldConversionError(`expected an amount, got ${JSON.stringify(stripped)}`);
  }
  const value = parseInt(digits, 10);
  return negative ? -value : value;
}

/** Percentage with two implied decimals, e.g. '00150' -> 150 (== 1.50%). */
export function convertPercent(raw: string): number | null {
  if (isBlank(raw)) return null;
  const stripped = raw.trim();
  if (!isDigits(stripped)) {
    throw new FieldConversionError(`expected a percentage, got ${JSON.stringify(stripped)}`);
  }
  return parseInt(stripped, 10);
}

// DD/MM/YYYY — see ASSUMPTIONS.md
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(month: number, year: number): number {
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

export function convertDate(raw: string): IsoDate | null {
  if (isBlank(raw)) return null; // e.g. invoice not yet issued (field 47/48)
  const stripped = raw.trim();
  const m = DATE_PATTERN.exec(stripped);
  if (!m) {
    throw new FieldConversionError(`invalid date ${JSON.stringify(stripped)}`);
  }
  const day = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  const year = parseInt(m[3]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year)) {
    throw new FieldConversionError(`invalid date ${JSON.stringify(stripped)}`);
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function convertStatus(raw: string): Status {
  const stripped = raw.trim();
  const status = STATUS_FROM_LETTER[stripped];
  if (status === undefined) {
    throw new FieldConversionError(`unknown status ${JSON.stringify(stripped)}`);
  }
  return status;
}

export function convertException(raw: string): ExceptionCode {
  const stripped = raw.trim();
  if (!(EXCEPTION_CODES as readonly string[]).includes(stripped)) {
    throw new FieldConversionError(`unknown exception code ${JSON.stringify(stripped)}`);
  }
  return stripped as ExceptionCode;
}

export const CONVERTERS: Record<Kind, (raw: string) => unknown> = {
  text: convertText,
  ident: convertIdent,
  int: convertInt,
  amount: convertAmount,
  percent: convertPercent,
  date: convertDate,
  status: convertStatus,
  exception: convertException,
};

// --- Rendering (model value -> fixed-width slice), used by the fixture
// builder and by the round-trip tests. ---

export function renderValue(kind: Kind, value: unknown, width: number): string {
  if (value === null || value === undefined) {
    return " ".repeat(width);
  }
  switch (kind) {
    case "text":
    case "ident":
    case "status":
    case "exception": {
      const text =
        kind === "status" ? STATUS_TO_LETTER[value as Status] : String(value);
      if (text.length > width) {
        throw new Error(`value ${JSON.stringify(text)} wider than field width ${width}`);
      }
      return text.padEnd(width);
    }
    case "int":
    case "percent":
      return String(Math.trunc(value as number)).padStart(width, "0");
    case "amount": {
      const amount = Math.trunc(value as number);
      if (amount < 0) {
        return "-" + String(-amount).padStart(width - 1, "0");
      }
      return String(amount).padStart(width, "0");
    }
    case "date": {
      const iso = value as IsoDate; // YYYY-MM-DD
      const [year, month, day] = iso.split("-");
      return `${day}/${month}/${year}`;
    }
  }
}
