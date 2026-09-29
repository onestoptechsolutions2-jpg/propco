/**
 * WhatsApp via the user's own device: builds a wa.me "click to chat" link that
 * opens WhatsApp (app or web) with the message pre-filled. No API account
 * needed; a person taps Send.
 */
export function normalizePhone(raw: string, defaultCountryCode = "254"): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = defaultCountryCode + d.slice(1);
  else if (d.length === 9) d = defaultCountryCode + d; // 712345678
  return /^\d{10,15}$/.test(d) ? d : null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const n = phone ? normalizePhone(phone) : null;
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
