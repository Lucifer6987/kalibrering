import express from "express";
import ExcelJS from "exceljs";
import { db } from "./db.ts";
import {
  instrumentSchema,
  calibrationSchema,
  pointSchema,
  evaluate,
  type Instrument,
} from "./calculations.ts";
import { certificate, workbook } from "./reports.ts";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
const getCalibration = (id: string) => {
  const row = db
    .prepare("SELECT * FROM calibrations WHERE id=?")
    .get(id) as any;
  if (!row) return null;
  return {
    ...row,
    points: JSON.parse(row.points),
    instrument: JSON.parse(row.instrumentSnapshot),
  };
};
app.get("/api/instruments", (_req, res) =>
  res.json(db.prepare("SELECT * FROM instruments ORDER BY id DESC").all()),
);
app.post("/api/instruments", (req, res, next) => {
  try {
    const i = instrumentSchema.parse(req.body);
    const r = db
      .prepare(
        "INSERT INTO instruments(name,serial,type,unit,rangeMin,rangeMax,tolerance,toleranceMode,location,intervalMonths) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        i.name,
        i.serial,
        i.type,
        i.unit,
        i.rangeMin,
        i.rangeMax,
        i.tolerance,
        i.toleranceMode,
        i.location,
        i.intervalMonths,
      );
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (e) {
    next(e);
  }
});
app.get("/api/calibrations", (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,instrumentId,date,operator,notes,points,instrumentSnapshot FROM calibrations ORDER BY date DESC,id DESC",
      )
      .all()
      .map((r: any) => {
        const instrument = JSON.parse(r.instrumentSnapshot);
        const full = getCalibration(String(r.id));
        return {
          ...r,
          instrument,
          points: JSON.parse(r.points),
          result: evaluate(instrument, full.points, full.uncertainty),
        };
      }),
  ),
);
app.post("/api/calibrations", (req, res, next) => {
  try {
    const c = calibrationSchema.parse(req.body);
    const i = db
      .prepare("SELECT * FROM instruments WHERE id=?")
      .get(c.instrumentId) as Instrument | undefined;
    if (!i) return res.status(404).json({ error: "Instrument findes ikke" });
    if (
      c.points.some((p) => p.reference < i.rangeMin || p.reference > i.rangeMax)
    )
      return res.status(400).json({
        error: "Referencepunkter skal ligge i instrumentets måleområde",
      });
    if (new Set(c.points.map((p) => p.reference)).size !== c.points.length)
      return res
        .status(400)
        .json({ error: "Referencepunkter skal være forskellige" });
    const r = db
      .prepare(
        "INSERT INTO calibrations(instrumentId,date,operator,referenceEquipment,uncertainty,notes,points,instrumentSnapshot) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        c.instrumentId,
        c.date,
        c.operator,
        c.referenceEquipment,
        c.uncertainty,
        c.notes,
        JSON.stringify(c.points),
        JSON.stringify(i),
      );
    res.status(201).json({
      id: Number(r.lastInsertRowid),
      result: evaluate(i, c.points, c.uncertainty),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/calibrations/:id/pdf", (req, res) => {
  const c = getCalibration(req.params.id);
  if (!c) return res.sendStatus(404);
  certificate(res, c);
});
app.get("/api/calibrations/:id/excel", async (req, res, next) => {
  try {
    const c = getCalibration(req.params.id);
    if (!c) return res.sendStatus(404);
    const book = await workbook(c.points, c.instrument, c.uncertainty, c);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="kalibrering-${c.id}.xlsx"`,
    );
    res.type(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await book.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});
app.get("/api/template", async (_req, res, next) => {
  try {
    const b = await workbook(
      [0, 25, 50, 75, 100].map((reference) => ({
        reference,
        before: reference,
        after: null,
      })),
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="maaleskabelon.xlsx"',
    );
    res.type(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await b.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/import",
  express.raw({ type: "application/octet-stream", limit: "2mb" }),
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body))
        return res.status(400).json({ error: "Upload en .xlsx-fil" });
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(req.body as any);
      const sheet = book.worksheets[0];
      if (!sheet || sheet.rowCount > 101)
        throw Error("Filen skal have 2–100 målepunkter");
      if (
        ["Reference", "Før", "Efter"].some(
          (s, n) => sheet.getRow(1).getCell(n + 1).text !== s,
        )
      )
        throw Error("Kolonner skal hedde Reference, Før og Efter");
      const points: any[] = [];
      sheet.eachRow((row, n) => {
        if (n === 1) return;
        const a = row.getCell(1).value,
          b = row.getCell(2).value,
          c = row.getCell(3).value;
        if (a === null && b === null && c === null) return;
        if (
          typeof a !== "number" ||
          typeof b !== "number" ||
          (c !== null && typeof c !== "number")
        )
          throw Error(
            `Række ${n}: måleværdier skal være tal, efter kan være tom`,
          );
        points.push(pointSchema.parse({ reference: a, before: b, after: c }));
      });
      if (points.length < 2) throw Error("Mindst to målepunkter kræves");
      res.json({ points });
    } catch (e) {
      next(e);
    }
  },
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Ukendt API-adresse" }),
);
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static("dist"));
  app.get("/{*path}", (_req, res) =>
    res.sendFile("index.html", { root: "dist" }),
  );
}
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.message);
    res.status(err.message?.includes("UNIQUE") ? 409 : 400).json({
      error: err.message?.includes("UNIQUE")
        ? "Serienummer findes allerede"
        : err.issues?.map((x: any) => x.message).join(", ") ||
          err.message ||
          "Ugyldig forespørgsel",
    });
  },
);
const port = Number(process.env.PORT || 3000);
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Kalibrering klar på port ${port}`),
);
