import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";
let child: ChildProcess, dir: string;
const base = "http://127.0.0.1:3198";
let output = "";
before(async () => {
  dir = await mkdtemp(tmpdir() + "/kalibrering-test-");
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DB_PATH: dir + "/test.sqlite",
      PORT: "3198",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (b) => (output += b));
  child.stderr?.on("data", (b) => (output += b));
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch(base + "/api/instruments");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(output || "Server startede ikke");
});
after(async () => {
  child?.kill();
  if (child && child.exitCode === null)
    await new Promise((r) => child.once("exit", r));
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function post(url: string, body: any) {
  return fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
test("persistent instrument → calibration → report, guarded assessment and import", async () => {
  const input = {
    name: "PT100 Lab",
    serial: "TEST-001",
    type: "PT100",
    unit: "°C",
    rangeMin: 0,
    rangeMax: 100,
    tolerance: 1,
    toleranceMode: "absolute",
    location: "Lab",
    intervalMonths: 12,
  };
  let r = await post("/api/instruments", input);
  assert.equal(r.status, 201);
  const { id } = (await r.json()) as any;
  assert.equal((await post("/api/instruments", input)).status, 409);
  assert.equal(
    (await post("/api/instruments", { ...input, serial: "bad", rangeMax: 0 }))
      .status,
    400,
  );
  const calibration = {
    instrumentId: id,
    date: "2026-11-03",
    operator: "Testoperatør",
    referenceEquipment: "REF-123",
    uncertainty: 0.2,
    notes: "Sporbar test",
    points: [
      { reference: 0, before: 1.1, after: 0.1 },
      { reference: 100, before: 101.2, after: 100.3 },
    ],
  };
  r = await post("/api/calibrations", calibration);
  assert.equal(r.status, 201);
  const saved = (await r.json()) as any;
  assert.equal(saved.result.beforePass, false);
  assert.equal(saved.result.afterPass, true);
  assert.equal(
    (
      await post("/api/calibrations", {
        ...calibration,
        points: [
          ...calibration.points,
          { reference: 101, before: 101, after: null },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (await post("/api/calibrations", { ...calibration, instrumentId: 999 }))
      .status,
    404,
  );
  const history = (await (
    await fetch(base + "/api/calibrations")
  ).json()) as any[];
  assert.equal(history[0].instrument.serial, "TEST-001");
  assert.equal(history[0].result.afterPass, true);
  const pdf = await fetch(base + `/api/calibrations/${saved.id}/pdf`);
  assert.equal(pdf.status, 200);
  const buffer = Buffer.from(await pdf.arrayBuffer());
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buffer.length > 1000);
  const excel = await fetch(base + `/api/calibrations/${saved.id}/excel`);
  assert.equal(excel.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await excel.arrayBuffer()) as any);
  assert.equal(book.worksheets[0].getRow(2).getCell(8).value, 0.2);
  const template = await fetch(base + "/api/template");
  const bytes = await template.arrayBuffer();
  const imported = await fetch(base + "/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  assert.equal(imported.status, 200);
  assert.equal(((await imported.json()) as any).points.length, 5);
  assert.equal(
    (
      await fetch(base + "/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "broken",
      })
    ).status,
    400,
  );
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/api/calibrations/999/pdf")).status, 404);
});
