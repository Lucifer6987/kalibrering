import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resistance,
  temperature,
  transmitter,
  heater,
  evaluate,
  instrumentSchema,
  calibrationSchema,
} from "../server/calculations.ts";
import { workbook } from "../server/reports.ts";
const i = {
  id: 1,
  name: "Test",
  serial: "T1",
  type: "PT100" as const,
  unit: "°C",
  rangeMin: 0,
  rangeMax: 100,
  tolerance: 1,
  toleranceMode: "absolute" as const,
  location: "Lab",
  intervalMonths: 12,
};
test("IEC 60751 reference points and inverse at negative/positive temperatures", () => {
  assert.equal(resistance(0), 100);
  assert.ok(Math.abs(resistance(100) - 138.5055) < 1e-6);
  assert.ok(Math.abs(resistance(-100) - 60.25584) < 0.0001);
  assert.equal(resistance(0, 1000), 1000);
  for (const t of [-200, -100, 0, 100, 850])
    assert.ok(Math.abs(temperature(resistance(t)) - t) < 1e-8);
  assert.throws(() => resistance(851));
  assert.throws(() => temperature(0));
});
test("linear transmitter and heater engineering values", () => {
  assert.equal(transmitter(0, 0, 100), 4);
  assert.equal(transmitter(50, 0, 100), 12);
  assert.equal(transmitter(100, 0, 100), 20);
  assert.throws(() => transmitter(1, 2, 2));
  assert.deepEqual(heater(230, 10), { power: 2300, resistance: 23 });
  assert.throws(() => heater(230, 0));
});
test("guard band, limits, percent of span, incomplete after data", () => {
  let r = evaluate(i, [{ reference: 50, before: 51, after: 50.8 }], 0.3);
  assert.equal(r.beforePass, false);
  assert.equal(r.afterPass, false);
  assert.equal(
    evaluate(i, [{ reference: 50, before: 51, after: 51 }]).afterPass,
    true,
  );
  assert.equal(
    evaluate(i, [{ reference: 1, before: 1, after: null }]).afterPass,
    null,
  );
  assert.equal(
    evaluate(
      { ...i, rangeMin: 20, rangeMax: 220, toleranceMode: "percentSpan" },
      [{ reference: 50, before: 52, after: 52 }],
    ).limit,
    2,
  );
});
test("validation rejects invalid ranges, dates and insufficient measurements", () => {
  assert.equal(
    instrumentSchema.safeParse({ ...i, rangeMax: 0 }).success,
    false,
  );
  assert.equal(
    calibrationSchema.safeParse({
      instrumentId: 1,
      date: "2026-02-30",
      operator: "A",
      referenceEquipment: "R",
      uncertainty: 0,
      points: [],
    }).success,
    false,
  );
});
test("Excel roundtrip retains numbers and guarded decision formulas", async () => {
  const book = await workbook(
    [{ reference: 50, before: 51, after: 50.8 }],
    i,
    0.3,
  );
  const bytes = await book.xlsx.writeBuffer();
  const ExcelJS = (await import("exceljs")).default;
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(bytes);
  const row = read.worksheets[0].getRow(2);
  assert.equal(row.getCell(1).value, 50);
  assert.equal(row.getCell(8).value, 0.3);
  assert.ok((row.getCell(7).value as any).formula.includes("+H2"));
});
