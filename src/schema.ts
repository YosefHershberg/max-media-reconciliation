/**
 * Field schemas for MAX media 210/211 and 212/213.
 *
 * Every offset in the system lives in this module and nowhere else.
 *
 * Positions are copied verbatim from the MAX spec documents, which use
 * 1-based inclusive positions ("תחילת השדה" = start, "אורך השדה" = length).
 * `publishedLength` preserves what the PDF says, including its two errors;
 * `length` holds the resolved value the parser actually uses. The resolution
 * rationale is in DECISIONS.md (decision 1); `findSpecInconsistencies`
 * re-derives the errors mechanically so the resolution is testable.
 */

/** How a field's raw slice is converted to a typed value. */
export type Kind =
  | "text"       // free text (may be Hebrew), stripped
  | "ident"      // identifier: stripped, leading zeros preserved, never numeric
  | "int"        // plain integer (counts, installment number)
  | "amount"     // money in agorot: integer, optional leading '-'
  | "percent"    // percentage with 2 implied decimals, stored as int hundredths
  | "date"       // DD/MM/YYYY, blank allowed
  | "status"     // blank = OK, 'H' = held, 'W' = waiting
  | "exception"; // single-letter discounting exception code, blank allowed

export interface FieldSpec {
  readonly num: number;             // field number in the MAX document
  readonly hebrewName: string;      // name as printed in the document
  readonly key: string;             // attribute name in the internal model
  readonly start: number;           // 1-based inclusive start position, as published
  readonly publishedLength: number; // length column as published (may be wrong)
  readonly length: number;          // resolved length actually used by the parser
  readonly kind: Kind;
  readonly modelAttr: boolean;      // false -> captured raw into rawExtras, not normalized
}

interface FieldOpts {
  published?: number;
  model?: boolean;
}

function f(
  num: number,
  hebrewName: string,
  key: string,
  start: number,
  length: number,
  kind: Kind,
  opts: FieldOpts = {},
): FieldSpec {
  return {
    num,
    hebrewName,
    key,
    start,
    publishedLength: opts.published ?? length,
    length,
    kind,
    modelAttr: opts.model ?? true,
  };
}

/** 1-based inclusive end position (resolved). */
export function fieldEnd(spec: FieldSpec): number {
  return spec.start + spec.length - 1;
}

/** Extract this field's raw slice from a full record line. */
export function fieldSlice(spec: FieldSpec, line: string): string {
  return line.slice(spec.start - 1, spec.start - 1 + spec.length);
}

// --- Media 210/211: credits at transaction level ("מדיית זיכויים ברמת תנועה") ---
export const MEDIA_210_211: readonly FieldSpec[] = [
  f(1, "מורשה / תאגיד", "merchantId", 1, 9, "ident"),
  f(2, 'בי"ע ראשי', "supplierIdMain", 10, 9, "ident"),
  f(3, 'בי"ע מותגי', "supplierIdBrand", 19, 9, "ident", { model: false }),
  f(4, "שם בית עסק", "businessName", 28, 40, "text"),
  f(5, "קוד בנק", "bankCode", 68, 2, "ident", { model: false }),
  f(6, "קוד סניף", "branchCode", 70, 3, "ident", { model: false }),
  f(7, "סוג חשבון", "accountType", 73, 3, "ident", { model: false }),
  f(8, "מספר חשבון", "accountNumber", 76, 8, "ident", { model: false }),
  f(9, "מספר מסוף", "terminalNumber", 84, 10, "ident"),
  f(10, "מספר ריכוז", "batchNumber", 94, 8, "ident"),
  f(11, "מספר שובר", "voucherNumber", 102, 15, "ident"),
  f(12, "מספר אישור", "approvalNumber", 117, 7, "ident"),
  f(13, "תאריך ביצוע עסקה", "transactionDate", 124, 10, "date"),
  f(14, "תאריך הפקדה", "depositDate", 134, 10, "date"),
  f(15, "תאריך עיבוד", "processingDate", 144, 10, "date"),
  f(16, "תאריך זיכוי", "creditDate", 154, 10, "date"),
  f(17, "מותג", "brandName", 164, 15, "text", { model: false }),
  f(18, "מספר מותג/תת קבוצה", "brandCode", 179, 5, "ident", { model: false }),
  f(19, "מספר כרטיס", "cardNumberMasked", 184, 19, "ident"),
  f(20, "מזהה תנועה ARN", "arn", 203, 23, "ident"),
  f(21, "תאור תנועה", "transactionTypeDesc", 226, 15, "text"),
  f(22, "קוד תנועה", "transactionTypeCode", 241, 4, "ident"),
  f(23, "מטבע עסקה", "currencyDesc", 245, 3, "text", { model: false }),
  f(24, "קוד מטבע עסקה", "currencyCode", 248, 3, "ident", { model: false }),
  f(25, "מטבע תשלום", "paymentCurrencyDesc", 251, 3, "text", { model: false }),
  f(26, "קוד מטבע תשלום", "paymentCurrencyCode", 254, 3, "ident"),
  f(27, "שער ביצוע", "executionRate", 257, 7, "ident", { model: false }),
  f(28, "מספר תשלום", "installmentNumber", 264, 5, "int"),
  f(29, "סכום ע. מקורי", "originalAmount", 269, 16, "amount"),
  f(30, "סכום ברוטו", "grossAmount", 285, 16, "amount"),
  f(31, "שם מועדון", "clubName", 301, 30, "text", { model: false }),
  f(32, "מספר מועדון", "clubNumber", 331, 8, "ident", { model: false }),
  f(33, "הנחת כרטיס %", "cardDiscountPct", 339, 16, "percent", { model: false }),
  f(34, "הנחת מועדון ללא דמי ניהול", "clubDiscountNoMgmt", 355, 16, "amount"),
  f(35, "דמי ניהול מועדון %", "clubMgmtFeePct", 371, 16, "percent", { model: false }),
  f(36, "דמי ניהול מועדון", "clubMgmtFee", 387, 16, "amount"),
  f(37, "עמלה רגילה", "feeRegular", 403, 16, "amount"),
  f(38, 'תוספת עמלה ש"א', "feeNonElectronic", 419, 16, "amount"),
  f(39, "נטו לחישוב ניכיון", "netForDiscounting", 435, 16, "amount"),
  f(40, "שיעור ניכיון ב-%", "discountingRatePct", 451, 5, "percent"),
  f(41, "סכום נכיון", "discountingAmount", 456, 10, "amount"),
  f(42, 'מע"מ', "vatAmount", 466, 16, "amount"),
  f(43, "סכום נטו", "netAmount", 482, 16, "amount"),
  f(44, "קוד סיבת חריגה", "exceptionCode", 498, 1, "exception"),
  f(45, "תאור סיבת חריגה (ניכיון)", "exceptionDesc", 499, 40, "text", { model: false }),
  f(46, "סטטוס", "status", 539, 15, "status"),
  f(47, "מספר חשבונית", "invoiceNumber", 554, 13, "ident"),
  f(48, "תאריך חשבונית", "invoiceDate", 567, 10, "date"),
  f(49, "יתרה ברוטו", "grossBalance", 577, 16, "amount", { model: false }),
  f(50, "שדה Z", "fieldZ", 593, 10, "ident", { model: false }),
  // Spec inconsistency #1: the length column says 603, which is this field's
  // END position, not its length. Field 52 starts at 604 and the field is a
  // 0/1 indicator, so the true length is 1. See DECISIONS.md, decision 1.
  f(51, "אינדיקציית עסקת תייר", "touristIndicator", 603, 1, "ident", {
    published: 603,
    model: false,
  }),
  f(52, "מספר עסקה טרמס (שבא)", "emvUid", 604, 23, "ident", { model: false }),
  f(53, "מספר הקצאה", "allocationNumber", 627, 30, "ident", { model: false }),
];

// --- Media 212/213: credits at batch level ("מדיית זיכויים ברמת ריכוז") ---
export const MEDIA_212_213: readonly FieldSpec[] = [
  f(1, "מורשה / תאגיד", "merchantId", 1, 9, "ident"),
  f(2, 'בי"ע ראשי', "supplierIdMain", 10, 9, "ident"),
  f(3, 'בי"ע מותגי', "supplierIdBrand", 19, 9, "ident", { model: false }),
  f(4, "שם בית עסק", "businessName", 28, 40, "text"),
  f(5, "קוד בנק", "bankCode", 68, 2, "ident", { model: false }),
  f(6, "קוד סניף", "branchCode", 70, 3, "ident", { model: false }),
  f(7, "סוג חשבון", "accountType", 73, 3, "ident", { model: false }),
  f(8, "מספר חשבון", "accountNumber", 76, 8, "ident", { model: false }),
  f(9, "מספר מסוף", "terminalNumber", 84, 10, "ident"),
  f(10, "מספר ריכוז", "batchNumber", 94, 8, "ident"),
  f(11, "תאריך הפקדה", "depositDate", 102, 10, "date"),
  f(12, "תאריך זיכוי", "creditDate", 112, 10, "date"),
  f(13, "מותג", "brandName", 122, 15, "text", { model: false }),
  f(14, "מספר מותג/תת קבוצה", "brandCode", 137, 5, "ident", { model: false }),
  f(15, "מטבע תשלום", "paymentCurrencyDesc", 142, 3, "text", { model: false }),
  f(16, "קוד מטבע תשלום", "paymentCurrencyCode", 145, 3, "ident"),
  f(17, "כמות תנועות", "transactionCount", 148, 8, "int"),
  f(18, "סכום ברוטו", "grossAmount", 156, 16, "amount"),
  f(19, "הנחת מועדון ללא דמי ניהול", "clubDiscountNoMgmt", 172, 16, "amount"),
  f(20, "דמי ניהול מועדון", "clubMgmtFee", 188, 16, "amount"),
  // Note: the same business concepts get narrower widths here than in
  // 210/211 (fee 11 vs 16, discounting 9 vs 10, VAT 11 vs 16, net 14 vs 16).
  // That is intentional per the documents, not an inconsistency.
  f(21, "עמלה רגילה", "feeRegular", 204, 11, "amount"),
  f(22, 'תוספת עמלה ש"א', "feeNonElectronic", 215, 11, "amount"),
  f(23, "סכום נכיון", "discountingAmount", 226, 9, "amount"),
  f(24, 'מע"מ', "vatAmount", 235, 11, "amount"),
  f(25, "סכום נטו", "netAmount", 246, 14, "amount"),
  f(26, "סטטוס", "status", 260, 15, "status"),
  f(27, "מספר חשבונית", "invoiceNumber", 275, 13, "ident"),
  f(28, "תאריך חשבונית", "invoiceDate", 288, 10, "date"),
  // Spec inconsistency #2: the length column says 327, which is again the END
  // position (298 + 30 - 1 = 327). The identical field in media 210/211
  // (field 53) is 30 long. Resolved to 30. See DECISIONS.md, decision 1.
  f(29, "מספר הקצאה", "allocationNumber", 298, 30, "ident", {
    published: 327,
    model: false,
  }),
];

/** Total record length implied by the resolved schema. */
export function recordLength(schema: readonly FieldSpec[]): number {
  return fieldEnd(schema[schema.length - 1]!);
}

export const RECORD_LENGTH_210_211 = recordLength(MEDIA_210_211); // 656
export const RECORD_LENGTH_212_213 = recordLength(MEDIA_212_213); // 327

export interface SpecInconsistency {
  fieldNum: number;
  hebrewName: string;
  publishedStart: number;
  publishedLength: number;
  detail: string;
}

/**
 * Contiguity check over the PUBLISHED values: each field must start exactly
 * where the previous one ends. Returns every violation.
 *
 * Running this over both schemas reproduces, mechanically, the two errors
 * that ship in the MAX documents.
 */
export function findSpecInconsistencies(
  schema: readonly FieldSpec[],
): SpecInconsistency[] {
  const findings: SpecInconsistency[] = [];
  for (let i = 0; i < schema.length - 1; i++) {
    const prev = schema[i]!;
    const cur = schema[i + 1]!;
    const expectedNext = prev.start + prev.publishedLength;
    if (expectedNext !== cur.start) {
      findings.push({
        fieldNum: prev.num,
        hebrewName: prev.hebrewName,
        publishedStart: prev.start,
        publishedLength: prev.publishedLength,
        detail:
          `field ${prev.num} starts at ${prev.start} with published length ` +
          `${prev.publishedLength}, so the next field should start at ` +
          `${expectedNext}, but field ${cur.num} starts at ${cur.start}`,
      });
    }
  }
  return findings;
}

/** Assert the RESOLVED schema is gap-free and overlap-free. */
export function validateResolvedContiguity(schema: readonly FieldSpec[]): void {
  for (let i = 0; i < schema.length - 1; i++) {
    const prev = schema[i]!;
    const cur = schema[i + 1]!;
    if (fieldEnd(prev) + 1 !== cur.start) {
      throw new Error(
        `resolved schema broken between field ${prev.num} and ${cur.num}`,
      );
    }
  }
}
