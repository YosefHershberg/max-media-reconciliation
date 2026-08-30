/**
 * Internal data model for MAX media records.
 *
 * Normalization targets:
 * - identifiers stay strings (leading zeros are data, not padding);
 * - money is integer agorot;
 * - dates are ISO `YYYY-MM-DD` strings (validated on parse);
 * - statuses/exception codes are closed unions;
 * - everything else the file carries is still captured, raw, in `rawExtras`,
 *   keyed by the schema key, so no information is dropped.
 */

/** ISO calendar date string, YYYY-MM-DD. */
export type IsoDate = string;

/**
 * Field 46 (210/211) / field 26 (212/213). Blank means a normal record —
 * the spec explicitly gives an empty field business meaning here.
 */
export type Status =
  | "OK"       // "תנועות תקינות - יופיע ריק"
  | "HELD"     // 'H' — "עצור - הזיכוי מעוכב"
  | "WAITING"; // 'W' — "המתנה - ממתינה לזיכויים לקיזוז החוב"

export const STATUS_FROM_LETTER: Record<string, Status> = {
  "": "OK",
  H: "HELD",
  W: "WAITING",
};

export const STATUS_TO_LETTER: Record<Status, string> = {
  OK: "",
  HELD: "H",
  WAITING: "W",
};

/** Field 44 (210/211): discounting exception reason, single letter. */
export type ExceptionCode =
  | ""   // none
  | "C"  // credit deal exceeded
  | "I"  // immediate credit date
  | "L"  // installments do not match the discounting offer
  | "M"  // manual voucher
  | "O"  // over the merchant's limit
  | "S"  // deferred transaction
  | "T"  // exceeding installment
  | "X"  // installment not discounted
  | "Y"; // transaction discounted

export const EXCEPTION_CODES: readonly ExceptionCode[] = [
  "", "C", "I", "L", "M", "O", "S", "T", "X", "Y",
];

/** One media 210/211 row: a single transaction-level credit line. */
export interface TransactionRecord {
  merchantId: string;
  supplierIdMain: string;
  businessName: string;
  terminalNumber: string;
  batchNumber: string;
  voucherNumber: string;
  approvalNumber: string;
  transactionDate: IsoDate | null;
  depositDate: IsoDate | null;
  processingDate: IsoDate | null;
  creditDate: IsoDate | null;
  cardNumberMasked: string;
  arn: string;
  transactionTypeDesc: string;
  transactionTypeCode: string;
  paymentCurrencyCode: string;
  installmentNumber: number | null;
  originalAmount: number | null;      // agorot, original currency
  grossAmount: number | null;         // agorot; for installments: current payment
  clubDiscountNoMgmt: number | null;
  clubMgmtFee: number | null;
  feeRegular: number | null;
  feeNonElectronic: number | null;
  netForDiscounting: number | null;
  discountingRatePct: number | null;  // hundredths of a percent
  discountingAmount: number | null;
  vatAmount: number | null;
  netAmount: number | null;
  exceptionCode: ExceptionCode | null;
  status: Status | null;
  invoiceNumber: string;
  invoiceDate: IsoDate | null;
  rawExtras: Record<string, string>;
}

/** One media 212/213 row: aggregated credits for one batch/credit date. */
export interface SummaryRecord {
  merchantId: string;
  supplierIdMain: string;
  businessName: string;
  terminalNumber: string;
  batchNumber: string;
  depositDate: IsoDate | null;
  creditDate: IsoDate | null;
  paymentCurrencyCode: string;
  transactionCount: number | null;
  grossAmount: number | null;
  clubDiscountNoMgmt: number | null;
  clubMgmtFee: number | null;
  feeRegular: number | null;
  feeNonElectronic: number | null;
  discountingAmount: number | null;
  vatAmount: number | null;
  netAmount: number | null;
  status: Status | null;
  invoiceNumber: string;
  invoiceDate: IsoDate | null;
  rawExtras: Record<string, string>;
}

/**
 * Stable identity of the business transaction.
 *
 * The ARN (field 20) is described as a one-to-one identifier of the
 * transaction; when present it wins. Fallback: the voucher number (field 11)
 * which is unique per transmission + terminal (its own description), scoped
 * by the terminal (field 9). See DECISIONS.md, decision 3.
 */
export function transactionKey(t: TransactionRecord): string {
  return t.arn !== ""
    ? `arn:${t.arn}`
    : `voucher:${t.terminalNumber}:${t.voucherNumber}`;
}

/**
 * Identity of this specific row. An installment transaction shows up once
 * per payment, so the installment number (field 28) joins the key.
 */
export function rowKey(t: TransactionRecord): string {
  return `${transactionKey(t)}#${t.installmentNumber ?? ""}`;
}

/**
 * Key linking a row to its batch summary: terminal + batch number
 * (fields 9 + 10 in both medias). See DECISIONS.md, decision 4.
 */
export function batchKey(r: TransactionRecord | SummaryRecord): string {
  return `${r.terminalNumber}|${r.batchNumber}`;
}
