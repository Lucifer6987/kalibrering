import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { evaluate, type Instrument } from "./calculations.ts";
export async function workbook(
  points: any[],
  instrument?: Instrument,
  uncertainty = 0,
  context?: {
    id: number;
    date: string;
    operator: string;
    referenceEquipment: string;
    notes: string;
  },
) {
  const book = new ExcelJS.Workbook();
  book.creator = "Kalibrering";
  book.calcProperties.fullCalcOnLoad = true;
  const sheet = book.addWorksheet("Målinger");
  sheet.addRow([
    "Reference",
    "Før",
    "Efter",
    "Afvigelse før",
    "Afvigelse efter",
    "Tolerance",
    "Status efter",
    "Usikkerhed",
  ]);
  points.forEach((p, index) => {
    const r = index + 2;
    const limit = instrument ? evaluate(instrument, [p]).limit : null;
    sheet.addRow([
      p.reference,
      p.before,
      p.after,
      { formula: `B${r}-A${r}` },
      { formula: `IF(C${r}="","",C${r}-A${r})` },
      limit,
      {
        formula: `IF(C${r}="","Ikke målt",IF(ABS(E${r})+H${r}<=F${r},"Godkendt","Afvist"))`,
      },
      uncertainty,
    ]);
  });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF173F38" },
  };
  sheet.columns.forEach((c) => (c.width = 22));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (instrument) {
    const info = book.addWorksheet("Certifikat");
    info.columns = [{ width: 28 }, { width: 80 }];
    info.addRows([
      ["KALIBRERINGSRAPPORT", context ? `KAL-${context.id}` : ""],
      ["Instrument", instrument.name],
      ["Serienummer", instrument.serial],
      ["Type", instrument.type],
      ["Enhed", instrument.unit],
      ["Måleområde", `${instrument.rangeMin} til ${instrument.rangeMax}`],
      ["Usikkerhed", uncertainty],
      ["Beslutningsregel", "|afvigelse| + usikkerhed <= tolerance"],
      ...(context
        ? [
            ["Dato", context.date],
            ["Ansvarlig", context.operator],
            ["Referenceudstyr", context.referenceEquipment],
            ["Bemærkninger", context.notes],
          ]
        : []),
    ]);
    info.getRow(1).font = { bold: true };
  }
  return book;
}
export function certificate(res: any, c: any) {
  const i = c.instrument as Instrument;
  const result = evaluate(i, c.points, c.uncertainty);
  res.type("pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="kalibrering-${c.id}.pdf"`,
  );
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  doc.pipe(res);
  doc.rect(0, 0, 595, 125).fill("#173f38");
  doc
    .fillColor("white")
    .fontSize(11)
    .text("KALIBRERING / INSTRUMENTSTYRING", 48, 36)
    .fontSize(26)
    .text("Kalibreringscertifikat", 48, 61)
    .fontSize(11)
    .text(`Certifikat KAL-${String(c.id).padStart(6, "0")}`, 48, 98);
  doc
    .fillColor("#172c29")
    .fontSize(11)
    .text(`Instrument: ${i.name}`, 48, 152)
    .text(`Serienummer: ${i.serial}   |   Type: ${i.type}`)
    .text(`Placering: ${i.location}`)
    .text(`Dato: ${c.date}   |   Udført af: ${c.operator}`)
    .text(`Referenceudstyr: ${c.referenceEquipment}`)
    .text(`Område: ${i.rangeMin} til ${i.rangeMax} ${i.unit}`)
    .text(
      `Tolerance: ±${result.limit} ${i.unit}   |   Udvidet usikkerhed: ${c.uncertainty} ${i.unit}`,
    );
  doc
    .moveDown()
    .fontSize(9)
    .text(
      "Beslutningsregel: |afvigelse| + oplyst usikkerhed <= tolerance. Ingen akkreditering er angivet.",
    );
  doc
    .moveDown()
    .fontSize(10)
    .text(
      "Reference       Før             Efter           Afv. før        Afv. efter       Status",
    );
  for (const p of result.rows) {
    if (doc.y > 720) doc.addPage();
    doc
      .moveDown(0.5)
      .font("Courier")
      .fontSize(9)
      .text(
        [p.reference, p.before, p.after, p.beforeDeviation, p.afterDeviation]
          .map((v) =>
            (v === null ? "—" : Number(v.toPrecision(8)).toString()).padEnd(14),
          )
          .join("") +
          (p.afterPass === null ? "Ikke målt" : p.afterPass ? "OK" : "Afvist"),
      );
  }
  doc
    .font("Helvetica")
    .moveDown(1.5)
    .fontSize(12)
    .text(
      `Før: ${result.beforePass ? "Godkendt" : "Afvist"}  /  Efter: ${result.afterPass === null ? "Ikke afsluttet" : result.afterPass ? "Godkendt" : "Afvist"}`,
    );
  doc
    .moveDown()
    .fontSize(10)
    .text("Bemærkninger: " + c.notes);
  doc
    .moveDown()
    .fontSize(9)
    .text(
      "Certifikatet er en registrering af de indtastede målinger. Sporbarhed og referenceudstyrets gyldighed skal verificeres af den ansvarlige.",
    );
  const range = doc.bufferedPageRange();
  for (let n = 0; n < range.count; n++) {
    doc.switchToPage(n);
    doc
      .fontSize(8)
      .fillColor("#667772")
      .text(`KAL-${c.id} · Side ${n + 1} af ${range.count}`, 48, 790, {
        lineBreak: false,
      });
  }
  doc.end();
}
