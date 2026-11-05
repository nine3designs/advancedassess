type Any = any;

// Renders the invoice DOM node to a crisp image and saves it as a real A4 PDF file
// (no print dialog, no browser headers/footers, never splits across pages).
// The node is cloned into a fixed-width off-screen holder so the capture is
// identical no matter the viewport or on-screen zoom.
const CAPTURE_CSS = `
  .pdf-cap { min-height: 0 !important; }
  .pdf-cap .mt-12 { margin-top: 1.25rem !important; }
  .pdf-cap .mt-10 { margin-top: 1.25rem !important; }
  .pdf-cap .pt-10 { padding-top: 1.75rem !important; }
  .pdf-cap .pt-9 { padding-top: 1.5rem !important; }
`;

export async function downloadInvoicePdf(node: HTMLElement | null, filename: string) {
  if (!node) throw new Error("Invoice not on screen yet · open it first.");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-99999px;top:0;width:820px;background:#ffffff;z-index:-1;";
  const clone = node.cloneNode(true) as HTMLElement;
  clone.classList.add("pdf-cap");
  const style = document.createElement("style");
  style.textContent = CAPTURE_CSS;
  holder.appendChild(style);
  holder.appendChild(clone);
  document.body.appendChild(holder);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(holder, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, width: 820 });
  } finally {
    holder.remove();
  }
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageW = 210, pageH = 297, margin = 6;
  const maxW = pageW - margin * 2, maxH = pageH - margin * 2;
  const aspect = canvas.height / canvas.width;
  let w = maxW, h = maxW * aspect;
  if (h > maxH) { h = maxH; w = maxH / aspect; }
  pdf.addImage(img, "PNG", (pageW - w) / 2, margin, w, h, undefined, "FAST");
  pdf.save(filename);
}
