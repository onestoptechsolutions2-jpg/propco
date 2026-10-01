/**
 * Kenyan payroll maths (monthly). The figures below are the statutory rates as
 * we understand them for 2026. They change (NSSF steps up each February, the
 * Finance Act can change PAYE), so CHECK them against KRA / NSSF / SHA before
 * running real payroll, and edit this one object if they have moved.
 * Every payslip can also be adjusted by hand before the run is approved.
 */
export const PAYROLL_RATES = {
  label: "2026 rates (verify with KRA, NSSF and SHA before use)",
  // NSSF Tier I + Tier II combined: 6% of pensionable pay up to the upper earnings limit.
  nssf: { rate: 0.06, upperLimit: 108_000 },
  // SHIF: 2.75% of gross pay, minimum KES 300.
  shif: { rate: 0.0275, min: 300 },
  // Affordable Housing Levy: 1.5% employee, 1.5% employer.
  housingLevy: { rate: 0.015 },
  // Monthly PAYE bands on taxable pay; personal relief is deducted from the tax.
  personalRelief: 2400,
  payeBands: [
    { upTo: 24_000, rate: 0.1 },
    { upTo: 32_333, rate: 0.25 },
    { upTo: 500_000, rate: 0.3 },
    { upTo: 800_000, rate: 0.325 },
    { upTo: Infinity, rate: 0.35 },
  ],
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function payeOnTaxable(taxable: number) {
  let tax = 0;
  let lower = 0;
  for (const band of PAYROLL_RATES.payeBands) {
    if (taxable > lower) tax += (Math.min(taxable, band.upTo) - lower) * band.rate;
    lower = band.upTo;
  }
  return Math.max(0, r2(tax - PAYROLL_RATES.personalRelief));
}

export type PayslipInput = {
  basic: number;
  allowances: number;
  extraEarnings?: number;
  otherDeductions?: number;
};

export function computePayslip(i: PayslipInput) {
  const extra = i.extraEarnings ?? 0;
  const other = i.otherDeductions ?? 0;
  const gross = r2(i.basic + i.allowances + extra);

  const nssf = r2(Math.min(gross, PAYROLL_RATES.nssf.upperLimit) * PAYROLL_RATES.nssf.rate);
  const shif = gross > 0 ? r2(Math.max(PAYROLL_RATES.shif.min, gross * PAYROLL_RATES.shif.rate)) : 0;
  const housingLevy = r2(gross * PAYROLL_RATES.housingLevy.rate);

  // NSSF, SHIF and the housing levy are deducted before tax is worked out.
  const taxablePay = Math.max(0, r2(gross - nssf - shif - housingLevy));
  const paye = payeOnTaxable(taxablePay);
  const netPay = r2(gross - nssf - shif - housingLevy - paye - other);

  return {
    gross,
    nssf,
    shif,
    housingLevy,
    taxablePay,
    paye,
    netPay,
    employerNssf: nssf, // employer matches the employee NSSF contribution
    employerHousingLevy: housingLevy,
  };
}
