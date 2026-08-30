/**
 * Synthetic fixture data, built from the specs only.
 *
 * The records are defined here as typed objects and rendered to real
 * fixed-width lines through the same schema the parser reads with — which
 * gives us a round-trip test (build -> parse -> compare) for free.
 *
 * Story encoded in the data (all values synthetic, VAT at the current
 * Israeli 18% on the clearing fee):
 *
 * - Batch 00000001 ("A") — 5 transactions: three regular sales, one
 *   installment payment (2 of 6), one row held in status H. Their gross /
 *   fee / VAT / net all sum EXACTLY to summary A -> full PASS.
 * - Batch 00000002 ("B") — the summary says 4 transactions / 90,000 agorot
 *   gross, but only 3 rows totaling 85,000 exist in the transaction file.
 *   One transaction (gross 5,000, fee 100, VAT 18, net 4,882) was never
 *   transmitted -> FAIL with a gap that is fully explained by that one
 *   missing row. Summary B's club fields are left empty -> UNKNOWN checks.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderValue } from "./convert.js";
import { MEDIA_210_211, MEDIA_212_213, type FieldSpec } from "./schema.js";

export type FixtureValues = Record<string, unknown>;

export const MERCHANT = "512345678";
export const SUPPLIER = "001234567";
export const BUSINESS = "בית עסק לדוגמה";
export const TERMINAL = "0001234567";
export const CURRENCY_DESC = "ILS";
export const CURRENCY_CODE = "376"; // ISO 4217 numeric code for the new Israeli shekel

export const TXN_DATE = "2026-08-02";
export const DEPOSIT_DATE = "2026-08-03";
export const PROCESS_DATE = "2026-08-04";
export const CREDIT_DATE = "2026-08-05";

const BASE_TXN: FixtureValues = {
  merchantId: MERCHANT,
  supplierIdMain: SUPPLIER,
  businessName: BUSINESS,
  bankCode: "12",
  branchCode: "600",
  accountType: "010",
  accountNumber: "00123456",
  terminalNumber: TERMINAL,
  transactionDate: TXN_DATE,
  depositDate: DEPOSIT_DATE,
  processingDate: PROCESS_DATE,
  creditDate: CREDIT_DATE,
  brandName: "VISA",
  brandCode: "00001",
  transactionTypeDesc: "עסקה רגילה",
  transactionTypeCode: "0001",
  currencyDesc: CURRENCY_DESC,
  currencyCode: CURRENCY_CODE,
  paymentCurrencyDesc: CURRENCY_DESC,
  paymentCurrencyCode: CURRENCY_CODE,
  installmentNumber: 1,
  clubDiscountNoMgmt: 0,
  clubMgmtFee: 0,
  feeNonElectronic: 0,
  discountingRatePct: 0,
  discountingAmount: 0,
  status: "OK",
  touristIndicator: "0",
};

function txn(
  voucher: string,
  batch: string,
  card: string,
  arn: string,
  gross: number,
  fee: number,
  vat: number,
  overrides: FixtureValues = {},
): FixtureValues {
  return {
    ...BASE_TXN,
    voucherNumber: voucher,
    batchNumber: batch,
    approvalNumber: "1234567",
    cardNumberMasked: card,
    arn,
    originalAmount: gross,
    grossAmount: gross,
    netForDiscounting: gross - fee,
    feeRegular: fee,
    vatAmount: vat,
    netAmount: gross - fee - vat,
    ...overrides,
  };
}

export const BATCH_A = "00000001";
export const BATCH_B = "00000002";

export const FIXTURE_TRANSACTIONS: FixtureValues[] = [
  // --- batch A: sums to its summary exactly (PASS) ---
  txn("000000000000101", BATCH_A, "458010******1111", "25123456789012345678901",
    50000, 1000, 180),
  txn("000000000000102", BATCH_A, "458010******2222", "25123456789012345678902",
    30000, 600, 108),
  txn("000000000000103", BATCH_A, "530010******3333", "25123456789012345678903",
    20000, 400, 72),
  // installment payment 2 of 6: original amount is the full deal,
  // gross is the current payment ("התשלום התורן", field 30 description)
  txn("000000000000104", BATCH_A, "458010******4444", "25123456789012345678904",
    20000, 400, 72, {
      transactionTypeDesc: "תשלומים",
      transactionTypeCode: "0003",
      installmentNumber: 2,
      originalAmount: 120000,
    }),
  // held row: status H, still a member of the batch
  txn("000000000000105", BATCH_A, "530010******5555", "25123456789012345678905",
    10000, 200, 36, { status: "HELD" }),
  // --- batch B: one transaction was never transmitted (FAIL) ---
  txn("000000000000201", BATCH_B, "458010******6666", "25123456789012345678906",
    40000, 800, 144),
  txn("000000000000202", BATCH_B, "458010******7777", "25123456789012345678907",
    25000, 500, 90),
  txn("000000000000203", BATCH_B, "530010******8888", "25123456789012345678908",
    20000, 400, 72),
];

const BASE_SUMMARY: FixtureValues = {
  merchantId: MERCHANT,
  supplierIdMain: SUPPLIER,
  businessName: BUSINESS,
  bankCode: "12",
  branchCode: "600",
  accountType: "010",
  accountNumber: "00123456",
  terminalNumber: TERMINAL,
  depositDate: DEPOSIT_DATE,
  creditDate: CREDIT_DATE,
  brandName: "VISA",
  brandCode: "00001",
  paymentCurrencyDesc: CURRENCY_DESC,
  paymentCurrencyCode: CURRENCY_CODE,
  feeNonElectronic: 0,
  discountingAmount: 0,
  status: "OK",
};

export const FIXTURE_SUMMARIES: FixtureValues[] = [
  // summary A == exact totals of its 5 rows
  {
    ...BASE_SUMMARY,
    batchNumber: BATCH_A,
    transactionCount: 5,
    grossAmount: 130000,
    clubDiscountNoMgmt: 0,
    clubMgmtFee: 0,
    feeRegular: 2600,
    vatAmount: 468,
    netAmount: 126932,
  },
  // summary B claims 4 rows / 90,000 gross; the file only carries 3 / 85,000.
  // club fields left as null -> rendered blank -> UNKNOWN checks.
  {
    ...BASE_SUMMARY,
    batchNumber: BATCH_B,
    transactionCount: 4,
    grossAmount: 90000,
    clubDiscountNoMgmt: null,
    clubMgmtFee: null,
    feeRegular: 1800,
    vatAmount: 324,
    netAmount: 87876,
  },
];

/** Render one record's values into a real fixed-width line via the schema. */
export function renderLine(
  schema: readonly FieldSpec[],
  values: FixtureValues,
): string {
  const parts = schema.map((spec) => {
    const rendered = renderValue(spec.kind, values[spec.key] ?? null, spec.length);
    if (rendered.length !== spec.length) {
      throw new Error(
        `field ${spec.num} (${spec.key}) rendered to ${rendered.length} ` +
          `chars, expected ${spec.length}`,
      );
    }
    return rendered;
  });
  return parts.join("");
}

export function transactionLines(): string[] {
  return FIXTURE_TRANSACTIONS.map((v) => renderLine(MEDIA_210_211, v));
}

export function summaryLines(): string[] {
  return FIXTURE_SUMMARIES.map((v) => renderLine(MEDIA_212_213, v));
}

/**
 * Negative fixtures: one line the parser must REJECT (wrong length) and one
 * it must FLAG (right length, impossible transaction date).
 */
export function invalidLines(): string[] {
  const truncated = transactionLines()[0]!.slice(0, 100);
  const badDateValues = txn(
    "000000000000901", BATCH_A, "458010******9999",
    "25123456789012345678909", 10000, 200, 36,
    { transactionDate: null },
  );
  let line = renderLine(MEDIA_210_211, badDateValues);
  const spec13 = MEDIA_210_211.find((s) => s.num === 13)!;
  line =
    line.slice(0, spec13.start - 1) +
    "31/13/2026" +
    line.slice(spec13.start - 1 + 10);
  return [truncated, line];
}

export function writeAll(directory: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "media_210.txt"),
    transactionLines().join("\n") + "\n", "utf-8");
  writeFileSync(join(directory, "media_212.txt"),
    summaryLines().join("\n") + "\n", "utf-8");
  writeFileSync(join(directory, "invalid_lines.txt"),
    invalidLines().join("\n") + "\n", "utf-8");
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  writeAll(join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures"));
  console.log("fixtures written");
}
