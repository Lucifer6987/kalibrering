import { db } from "./db.ts";
export function seed() {
  if (
    Number(
      (db.prepare("SELECT COUNT(*) as n FROM instruments").get() as any).n,
    ) > 0
  )
    return;
  const insert = db.prepare(
    "INSERT INTO instruments(name,serial,type,unit,rangeMin,rangeMax,tolerance,toleranceMode,location,intervalMonths) VALUES (?,?,?,?,?,?,?,?,?,?)",
  );
  insert.run(
    "Tryktransmitter · proceslinje 01",
    "PT-2026-041",
    "Transmitter",
    "bar",
    0,
    10,
    0.5,
    "percentSpan",
    "Produktion · Hal A",
    12,
  );
  insert.run(
    "Temperaturføler · blandetank",
    "TT-2026-018",
    "PT100",
    "°C",
    0,
    200,
    0.5,
    "absolute",
    "Produktion · Hal B",
    12,
  );
  insert.run(
    "Varmelegeme · tørreovn",
    "HT-2026-006",
    "Varmelegeme",
    "W",
    0,
    3000,
    2,
    "percentSpan",
    "Laboratorium",
    6,
  );
  const i = db.prepare("SELECT * FROM instruments WHERE id=1").get();
  db.prepare(
    "INSERT INTO calibrations(instrumentId,date,operator,referenceEquipment,uncertainty,notes,points,instrumentSnapshot) VALUES (?,?,?,?,?,?,?,?)",
  ).run(
    1,
    "2026-10-20",
    "Demo · Anna Nielsen",
    "Demo-reference REF-001 (eksempeldata)",
    0.01,
    "Eksempelrapport — ikke et gyldigt kalibreringscertifikat.",
    JSON.stringify(
      [0, 2.5, 5, 7.5, 10].map((reference) => ({
        reference,
        before: reference + 0.08,
        after: reference + 0.01,
      })),
    ),
    JSON.stringify(i),
  );
}
seed();
console.log("Database og eksempeldata klar");
