export type LineItem = { description: string; quantity: number; rate: number };

export const LOGO_URL = "/branding/favicon.svg";
export const LOGO_URL_PETROL = "/branding/favicon.svg";
export const LOGO_MARK_URL = "/branding/favicon.svg";
export const LOGO_MARK_WHITE_URL = "/branding/favicon.svg";
export const LOGO_WORDMARK_LIGHT_URL = "/branding/sara-logo.png";
export const LOGO_WORDMARK_PETROL_URL = "/branding/favicon.svg";

export function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(isFinite(v) ? v : 0);
}

export function invoiceTotals(items: LineItem[] | null | undefined, taxRate: number | string = 0) {
  const subtotal = (items ?? []).reduce((s, i) => s + Number(i.quantity || 0) * Number(i.rate || 0), 0);
  const tax = Math.round(subtotal * Number(taxRate || 0)) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

/** An unpaid invoice past its due date counts as overdue. */
export function effectiveStatus(inv: { status: string; due_date?: string | null }, today = new Date()) {
  if (inv.status === "sent" && inv.due_date && new Date(inv.due_date + "T23:59:59") < today) return "overdue";
  return inv.status;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "·";
  return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function portalLink(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/portal/${token}`;
}

export function portalLinkFor(client: { portal_token?: string | null; portal_prefs?: { slug?: string } | null; company?: string | null; name?: string | null }) {
  const slug = client.portal_prefs?.slug;
  if (slug) return `/portal/${slug}`;
  return portalLink(client.portal_token ?? "");
}

/** Groups non-draft invoices by issue month (YYYY-MM): what was billed, paid and is still owed. */
export function monthlyPayments(
  invoices: { issue_date: string; status: string; items: LineItem[] | null; tax_rate: number | string }[],
) {
  const map = new Map<string, { month: string; billed: number; paid: number; owed: number }>();
  for (const inv of invoices) {
    if (inv.status === "draft") continue;
    const month = inv.issue_date.slice(0, 7);
    const m = map.get(month) ?? { month, billed: 0, paid: 0, owed: 0 };
    const { total } = invoiceTotals(inv.items, inv.tax_rate);
    m.billed += total;
    if (inv.status === "paid") m.paid += total; else m.owed += total;
    map.set(month, m);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}
