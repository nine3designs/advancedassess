import { invoiceTotals, money, type LineItem } from "@/lib/format";

type Any = any;

const PETROL = "#174B50";
const PORCELAIN = "#F5F1E8";
const MIST = "#B3C3C4";
const PAPER = "#DCDFDA";
const INK = "#131717";

function dmy(d?: string | null) {
  if (!d) return "";
  const x = new Date(d.length === 10 ? d + "T00:00:00" : d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)}`;
}

export function InvoiceDocument({ inv }: { inv: Any }) {
  const t = invoiceTotals((inv.items ?? []) as LineItem[], inv.tax_rate);
  return (
    <div className="invoice-doc relative mx-auto w-full overflow-hidden bg-white shadow-sm" style={{ fontFamily: "'Montserrat', sans-serif", color: PETROL, maxWidth: 820, minHeight: 1020 }}>
      <div className="absolute inset-x-0 top-0" style={{ height: 280, background: PETROL }} />
      <div className="absolute inset-x-0" style={{ top: 280, bottom: 44, background: MIST }} />
      <div className="relative z-10 flex items-start justify-between px-7 pt-8 md:px-10 md:pt-10">
        <img src="/branding/nine3-wordmark-light.png" alt="Nine3 Designs" className="h-12 w-auto md:h-16" />
        <div className="text-right text-white">
          <p className="text-xl font-bold leading-tight md:text-[26px]">{inv.clientName ?? "·"}</p>
          {inv.clientCompany && <p className="text-sm text-white/85">{inv.clientCompany}</p>}
          {inv.clientEmail && <p className="text-sm text-white/85">{inv.clientEmail}</p>}
        </div>
      </div>
      <div className="relative z-10 mx-4 mt-10 rounded-[28px] md:mx-10 md:mt-12">
        <div className="absolute right-0 top-0" style={{ width: "38%", height: 108, background: PETROL, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
        <div className="relative px-5 pb-7 pt-8 md:px-10 md:pb-8 md:pt-9">
          <h1 className="leading-none tracking-tight" style={{ color: PETROL, fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: "clamp(34px, 7vw, 56px)" }}>INVOICE</h1>
          <div className="mt-6 grid gap-6 text-[14px] md:grid-cols-[1.2fr_1fr] md:items-end md:text-[15px]">
            <div>
              <p className="font-bold tracking-wide">PAYABLE TO : NINE3 DESIGNS</p>
              <p className="mt-3 font-bold tracking-wide">BANK DETAILS</p>
              <p className="mt-1">SORT CODE:</p>
              <p className="font-semibold">04-03-33</p>
              <p className="mt-1">ACCOUNT NUMBER:</p>
              <p className="font-semibold">40426946</p>
            </div>
            <div className="text-left md:pb-1 md:text-right">
              <p><span className="font-semibold">DATE OF INVOICE:</span> {dmy(inv.issue_date)}</p>
              <p className="mt-1"><span className="font-semibold">REFERENCE:</span> {inv.number}</p>
            </div>
          </div>
          <div className="mt-7">
            <div className="grid grid-cols-[1fr_70px_100px] items-center text-[12px] font-bold tracking-[0.15em] text-white md:text-[13px]" style={{ background: INK, minHeight: 42 }}>
              <span className="pl-4 md:pl-6">ITEM DESCRIPTION</span>
              <span className="text-center">QTY</span>
              <span className="pr-4 text-right md:pr-6">PRICE</span>
            </div>
            <div style={{ background: PAPER, minHeight: 180 }}>
              {((inv.items ?? []) as LineItem[]).map((i, k) => (
                <div key={k} className="grid grid-cols-[1fr_70px_100px] items-start px-4 py-3 text-[13px] md:px-6 md:text-[14px]">
                  <span className="whitespace-pre-wrap pr-3">{i.description || "·"}</span>
                  <span className="text-center">{i.quantity}</span>
                  <span className="text-right font-semibold">{money(Number(i.quantity) * Number(i.rate))}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-7 space-y-3 text-[14px] md:ml-auto md:w-[62%] md:text-[15px]">
            {Number(inv.tax_rate) > 0 && (
              <div className="flex items-end justify-end gap-3">
                <span className="font-bold tracking-wide">VAT ({inv.tax_rate}%):</span>
                <span className="inline-block w-36 border-b-2 text-right font-bold md:w-40" style={{ borderColor: PETROL }}>{money(t.tax)}</span>
              </div>
            )}
            <div className="flex items-end justify-end gap-3">
              <span className="font-bold tracking-wide">GRAND TOTAL:</span>
              <span className="inline-block w-40 border-b-2 text-right font-bold md:w-44" style={{ borderColor: PETROL }}>{money(t.total)}</span>
            </div>
          </div>
          <div className="mt-9">
            <p className="text-[14px] font-bold tracking-wide md:text-[15px]">NOTES:</p>
            {inv.notes && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed md:text-[14px]">{inv.notes}</p>}
          </div>
          <div className="mt-9">
            <p className="text-[14px] font-bold md:text-[15px]">Terms and Conditions:</p>
            <p className="mt-1 text-[13px] italic leading-relaxed md:text-[14px]">
              Payment due within <span className="font-bold not-italic">7 days</span> of receipt of invoice. Overdue payments will incur statutory interest charged at 8% of the invoice total plus the Bank of England base rate and a £50.00 Compensation Charge
            </p>
          </div>
        </div>
      </div>
      <div className="relative z-10 py-5 text-center text-[13px] md:text-[14px]" style={{ color: PETROL }}>e: hello@nine3designs.co.uk</div>
    </div>
  );
}
