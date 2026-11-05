type Any = any;

// Renders the invoice DOM node to a crisp image and saves it as a real A4 PDF file
// (no print dialog, no browser headers/footers, never splits across pages).
export async function downloadInvoicePdf(node: HTMLElement | null, filename: string) {
  if (!node) throw new Error("Invoice not on screen yet · open it first.");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const prevZoom = (node.style as Any).zoom;
  (node.style as Any).zoom = 1; // neutralise responsive scaling during capture
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  } finally {
    (node.style as Any).zoom = prevZoom;
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
