import { categoryName, mxn, shiftName } from "../capture/format";
import type { Cut } from "../capture/queries";

const clean = (text: string) => Array.from(text).filter((char) => {
  const code = char.codePointAt(0) ?? 0;
  return code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
}).join("");
const money = (value: string) => `${mxn(value).replace("−", "-")} MXN`;

function verifyClosed(cut: Cut) {
  const { physicalCashCount, status } = cut.ledger;
  const { difference } = cut.summary;
  if (status !== "cerrado" || physicalCashCount === null || difference === null) {
    throw new Error("Solo se pueden exportar cortes cerrados.");
  }
  const result = difference === "0.00" ? "Cuadra" : difference.startsWith("-") ? "Faltante" : "Sobrante";
  return { physicalCashCount, difference, result };
}

export function ledgerXml(cut: Cut) {
  const { physicalCashCount, difference, result } = verifyClosed(cut);
  const doc = document.implementation.createDocument(null, "LibroContable");
  const root = doc.documentElement;
  root.setAttribute("version", "1");
  const element = (parent: Element, tag: string, value?: string) => {
    const node = doc.createElement(tag);
    if (value !== undefined) node.textContent = clean(value);
    parent.append(node);
    return node;
  };
  const meta = element(root, "Metadatos");
  element(meta, "Id", cut.ledger.id);
  element(meta, "Panaderia", cut.bakeryName);
  element(meta, "Fecha", cut.ledger.date);
  element(meta, "Turno", cut.ledger.shift);
  element(meta, "Responsable", cut.operator);
  element(meta, "Estado", cut.ledger.status);
  element(meta, "Moneda", "MXN");
  const income = element(root, "Ingresos");
  const expenses = element(root, "Egresos");
  for (const entry of cut.entries) {
    const row = element(entry.type === "ingreso" ? income : expenses, "Movimiento");
    row.setAttribute("id", entry.id);
    element(row, "Categoria", entry.category);
    element(row, "Concepto", entry.concept);
    element(row, "Importe", entry.amount);
  }
  const balance = element(root, "BalanceGeneral");
  element(balance, "FondoInicial", cut.ledger.openingBalance);
  element(balance, "TotalIngresos", cut.summary.income);
  element(balance, "TotalEgresos", cut.summary.expenses);
  element(balance, "EfectivoEsperado", cut.summary.balance);
  element(balance, "EfectivoContado", physicalCashCount);
  element(balance, "DiferenciaArqueo", difference);
  element(balance, "ResultadoArqueo", result.toLowerCase());
  if (cut.ledger.closingExplanation) element(balance, "Explicacion", cut.ledger.closingExplanation);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}`;
}

export async function ledgerPdf(cut: Cut) {
  const { physicalCashCount, difference, result } = verifyClosed(cut);
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ format: "letter", unit: "mm", putOnlyUsedFonts: true, compress: true });
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const available = pageWidth - margin * 2;
  const options = {
    margin: { top: 17, bottom: 17, left: margin, right: margin },
    rowPageBreak: "avoid" as const,
    styles: { fontSize: 9, cellPadding: 2.5 as const },
    headStyles: { fillColor: "#103c47" },
  };
  let y = 23;
  doc.setProperties({ title: `Corte de caja ${cut.ledger.date} · ${shiftName[cut.ledger.shift]}` });
  doc.setTextColor("#103c47").setFont("helvetica", "bold").setFontSize(18);
  const name = doc.splitTextToSize(clean(cut.bakeryName), available);
  doc.text(name, margin, y);
  y += name.length * 8;
  doc.setFontSize(13).text("Corte de caja", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor("#142c30");
  doc.text(`Fecha: ${cut.ledger.date}     Turno: ${shiftName[cut.ledger.shift]}     Estado: Cerrado`, margin, y);
  y += 6;
  const operator = doc.splitTextToSize(`Responsable: ${clean(cut.operator)}`, available);
  doc.text(operator, margin, y);
  y += operator.length * 5 + 5;

  function room(height: number) {
    if (y + height < pageHeight - margin) return;
    doc.addPage();
    y = 21;
  }
  function lastY() {
    return (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  }
  for (const [type, title] of [["ingreso", "Ingresos"], ["egreso", "Egresos"]] as const) {
    room(29);
    doc.setFontSize(11).setFont("helvetica", "bold").text(title, margin, y);
    const rows = cut.entries.filter((entry) => entry.type === type).map((entry) => [
      categoryName[entry.category] ?? entry.category, clean(entry.concept), money(entry.amount),
    ]);
    autoTable(doc, {
      ...options, startY: y + 3, head: [["Categoría", "Concepto", "Importe"]],
      body: rows.length ? rows : [["", "Sin movimientos", ""]],
      columnStyles: { 0: { cellWidth: 43 }, 2: { cellWidth: 45, halign: "right" } },
    });
    y = lastY() + 9;
  }

  room(70);
  doc.setFontSize(11).setFont("helvetica", "bold").text("Resumen financiero y arqueo", margin, y);
  autoTable(doc, {
    ...options, startY: y + 3, theme: "grid", head: [["Concepto", "Importe"]],
    body: [
      ["Fondo inicial", money(cut.ledger.openingBalance)], ["Total ingresos", money(cut.summary.income)],
      ["Total egresos", money(cut.summary.expenses)], ["Efectivo esperado", money(cut.summary.balance)],
      ["Efectivo contado", money(physicalCashCount)], [`Arqueo: ${result}`, money(difference)],
    ],
    columnStyles: { 1: { halign: "right" } },
  });
  y = lastY() + 7;
  doc.setFont("helvetica", "normal").setFontSize(10);
  if (cut.ledger.closingExplanation) {
    const note = doc.splitTextToSize(`Explicación: ${clean(cut.ledger.closingExplanation)}`, available);
    room(note.length * 5 + 2);
    doc.text(note, margin, y);
    y += note.length * 5 + 4;
  }
  room(24);
  y += 9;
  doc.setDrawColor("#4b6267").line(margin, y, margin + 75, y);
  doc.text("Firma del responsable", margin, y + 5);
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page).setFontSize(8).setTextColor("#4b6267")
      .text(`${cut.ledger.date}  ·  Página ${page} de ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }
  return doc.output("blob");
}

export async function downloadLedger(cut: Cut, format: "pdf" | "xml") {
  const blob = format === "xml"
    ? new Blob([ledgerXml(cut)], { type: "application/xml;charset=utf-8" })
    : await ledgerPdf(cut);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `corte-${cut.ledger.date}-${cut.ledger.shift}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
