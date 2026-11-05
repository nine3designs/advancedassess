import { invoiceTotals, money, type LineItem } from "@/lib/format";

type Any = any;

const PETROL = "#174B50";
const PORCELAIN = "#F5F1E8";
const MIST = "#B3C3C4";
const PAPER = "#DCDFDA";
const INK = "#131717";
const SIGNATURE_URL = "/branding/nine3-signature.png";

function dmy(d?: string | null) {
  if (!d) return "";
  const x = new Date(d.length === 10 ? d + "T00:00:00" : d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)}`;
}

function lineDesc(s?: string | null) {
  return (s || "·").replace(/^Design & admin support\s*·\s*/i, "");
}

export function InvoiceDocument({ inv }: { inv: Any }) {
  const t = invoiceTotals((inv.items ?? []) as LineItem[], inv.tax_rate);
  return (
    <div
      className="invoice-doc relative mx-auto w-full max-w-[820px] overflow-hidden bg-white shadow-sm"
      style={{ fontFamily: "'Montserrat', sans-serif", color: PETROL, minHeight: 1120 }}
    >
      {/* background bands */}
      <div className="absolute inset-x-0 top-0" style={{ height: 300, background: PETROL }} />
      <div className="absolute inset-x-0" style={{ top: 300, bottom: 48, background: MIST }} />

      {/* teal header */}
      <div className="relative z-10 flex items-start justify-between px-10 pt-10">
        <img src="/branding/nine3-wordmark-light.png" alt="Nine3 Designs" className="h-16 w-auto" />
        <div className="text-right text-white">
          <p className="text-[26px] font-bold leading-tight">{inv.clientName ?? "·"}</p>
          {inv.clientCompany && <p className="text-sm text-white/85">{inv.clientCompany}</p>}
          {inv.clientEmail && <p className="text-sm text-white/85">{inv.clientEmail}</p>}
        </div>
      </div>

      {/* cream card with angled top-right cut */}
      <div className="relative z-10 mx-10 mt-12 rounded-[28px]" style={{ background: PORCELAIN }}>
        <svg className="absolute right-0 top-0" style={{ width: "38%", height: 118, display: "block" }} viewBox="0 0 100 118" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="0,0 100,0 100,118" fill={PETROL} />
        </svg>
        <div className="relative px-10 pb-8 pt-9">
          <h1 className="text-[56px] font-bold leading-none tracking-tight" style={{ color: PETROL, fontFamily: "'Montserrat', sans-serif", fontWeight: 800 }}>
            INVOICE
          </h1>

          <div className="mt-6 grid grid-cols-[1.2fr_1fr] items-end gap-6 text-[15px]">
            <div>
              <p className="font-bold tracking-wide">PAYABLE TO : NINE3 DESIGNS</p>
              <p className="mt-3 font-bold tracking-wide">BANK DETAILS</p>
              <p className="mt-1">SORT CODE:</p>
              <p className="font-semibold">04-03-33</p>
              <p className="mt-1">ACCOUNT NUMBER:</p>
              <p className="font-semibold">40426946</p>
            </div>
            <div className="pb-1 text-right">
              <p><span className="font-semibold">DATE OF INVOICE:</span> {dmy(inv.issue_date)}</p>
              <p className="mt-1"><span className="font-semibold">REFERENCE:</span> {inv.number}</p>
            </div>
          </div>

          {/* items table */}
          <div className="mt-7">
            <div className="grid grid-cols-[1fr_90px_110px] items-center text-[13px] font-bold tracking-[0.15em] text-white" style={{ background: INK, minHeight: 46 }}>
              <span className="pl-6">DESCRIPTION</span>
              <span className="text-center">TIME (HRS)</span>
              <span className="pr-6 text-right">AMOUNT</span>
            </div>
            <div style={{ background: PAPER, minHeight: 330 }}>
              {((inv.items ?? []) as LineItem[]).map((i, k) => (
                <div key={k} className="grid grid-cols-[1fr_90px_110px] items-start px-6 py-3 text-[14px]">
                  <span className="whitespace-pre-wrap pr-4">{lineDesc(i.description)}</span>
                  <span className="text-center">{i.quantity}</span>
                  <span className="text-right font-semibold">{money(Number(i.quantity) * Number(i.rate))}</span>
                </div>
              ))}
            </div>
          </div>

          {/* totals */}
          <div className="avoid-break mt-7 ml-auto w-[62%] space-y-3 text-[15px]">
            {Number(inv.tax_rate) > 0 && (
              <div className="flex items-end justify-end gap-3">
                <span className="font-bold tracking-wide">VAT ({inv.tax_rate}%):</span>
                <span className="inline-block w-40 border-b-2 text-right font-bold" style={{ borderColor: PETROL }}>{money(t.tax)}</span>
              </div>
            )}
            <div className="flex items-end justify-end gap-3">
              <span className="font-bold tracking-wide">GRAND TOTAL:</span>
              <span className="inline-block w-44 border-b-2 text-right font-bold" style={{ borderColor: PETROL }}>{money(t.total)}</span>
            </div>
          </div>

          {/* notes */}
          <div className="avoid-break mt-10">
            <p className="text-[15px] font-bold tracking-wide">NOTES:</p>
            {inv.notes && <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed">{inv.notes}</p>}
          </div>

          {/* terms + signature */}
          <div className="avoid-break mt-10 flex items-end justify-between gap-6">
            <div className="max-w-[62%]">
              <p className="text-[15px] font-bold">Terms and Conditions:</p>
              <p className="mt-1 text-[14px] italic leading-relaxed">
                Payment due within <span className="font-bold not-italic">7 days</span> of receipt of invoice. Overdue payments will incur statutory interest charged at 8% of the invoice total plus the Bank of England base rate and a £50.00 Compensation Charge
              </p>
            </div>
            <img src={SIGNATURE_URL} alt="" className="mb-1 h-28 w-auto shrink-0" />
          </div>
        </div>
      </div>

      {/* footer on mist */}
      <div className="relative z-10 py-6 text-center text-[14px]" style={{ color: PETROL }}>
        e: hello@nine3designs.co.uk
      </div>
    </div>
  );
}
