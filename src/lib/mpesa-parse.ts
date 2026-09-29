/**
 * Best-effort reader for a pasted M-Pesa confirmation SMS, e.g.
 *   "QGH7X8ABCD Confirmed. Ksh35,000.00 received from JOHN DOE 0712345678 on 5/8/24 at 2:15 PM. ..."
 *   "QGH7X8ABCD Confirmed. You have received Ksh35,000.00 from JOHN DOE 0712345678 on 5/8/24 ..."
 * Anything it can't find is left null so a person can fill it in.
 */
export type ParsedMpesa = {
  code: string | null;
  amount: number | null;
  payerName: string | null;
  payerPhone: string | null;
};

export function parseMpesaMessage(text: string): ParsedMpesa {
  const t = text.replace(/\s+/g, " ").trim();

  const code = t.match(/\b([A-Z0-9]{10})\b(?=\s+Confirmed)/i)?.[1]?.toUpperCase() ?? null;

  const amountRaw = t.match(/(?:Ksh|KES)\.?\s?([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  const amount = amountRaw ? Number(amountRaw.replace(/,/g, "")) : null;

  const phone = t.match(/(?:\+?254|0)(7\d{8}|1\d{8})/);
  const payerPhone = phone ? `0${phone[1]}` : null;

  const name =
    t.match(/from\s+([A-Za-z][A-Za-z .'-]{2,40}?)\s+(?:\+?254|0)?\d{6,}/i)?.[1] ??
    t.match(/from\s+([A-Za-z][A-Za-z .'-]{2,40}?)\s+on\s/i)?.[1] ??
    null;

  return {
    code,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    payerName: name ? name.trim() : null,
    payerPhone,
  };
}

/** Last 9 digits, for matching phone numbers written in different formats. */
export function phoneTail(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}
