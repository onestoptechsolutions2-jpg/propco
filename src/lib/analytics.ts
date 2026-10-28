/** Pure helpers for the Insights page, kept apart so they can be tested without a database. */

const DAY = 86_400_000;

export type AgeBuckets = {
  current: { count: number; total: number }; // due today or not yet due
  d1to30: { count: number; total: number };
  d31to60: { count: number; total: number };
  d61plus: { count: number; total: number };
};

/** Unpaid rent grouped by how long it has been overdue. */
export function ageBuckets(items: { dueDate: Date; amount: number }[], now = new Date()): AgeBuckets {
  const b: AgeBuckets = {
    current: { count: 0, total: 0 },
    d1to30: { count: 0, total: 0 },
    d31to60: { count: 0, total: 0 },
    d61plus: { count: 0, total: 0 },
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const it of items) {
    const due = new Date(it.dueDate.getFullYear(), it.dueDate.getMonth(), it.dueDate.getDate()).getTime();
    const days = Math.round((today - due) / DAY);
    const bucket = days <= 0 ? b.current : days <= 30 ? b.d1to30 : days <= 60 ? b.d31to60 : b.d61plus;
    bucket.count++;
    bucket.total += it.amount;
  }
  return b;
}

/**
 * Kenya Monthly Rental Income tax (MRI) for residential rent: 7.5% of gross
 * rent for landlords whose annual residential rent is between KES 288,000 and
 * KES 15,000,000 (Finance Act 2023). Rates and thresholds change; this is only
 * an estimate and the page tells users to confirm with KRA or their accountant.
 */
export const MRI = { rate: 0.075, minAnnual: 288_000, maxAnnual: 15_000_000 };

export function mriEstimate(grossRentYtd: number): { applies: boolean; tax: number; note: string } {
  if (grossRentYtd <= 0) return { applies: false, tax: 0, note: "No rent collected yet this year." };
  if (grossRentYtd > MRI.maxAnnual) {
    return { applies: false, tax: 0, note: "Above the MRI ceiling: income is taxed through a normal annual return instead." };
  }
  if (grossRentYtd < MRI.minAnnual) {
    return { applies: false, tax: 0, note: "Below KES 288,000 a year, MRI normally does not apply." };
  }
  return { applies: true, tax: Math.round(grossRentYtd * MRI.rate), note: "7.5% of rent collected so far this year." };
}

/** Sort key helper: collection rate 0-100, or null when nothing was billed. */
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
