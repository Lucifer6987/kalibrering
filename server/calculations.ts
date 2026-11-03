import { z } from "zod";
export const types = [
  "Transmitter",
  "PT100",
  "PT1000",
  "Temperaturføler",
  "Varmelegeme",
] as const;
export const instrumentSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    serial: z.string().trim().min(1).max(100),
    type: z.enum(types),
    unit: z.string().trim().min(1).max(15),
    rangeMin: z.number().finite(),
    rangeMax: z.number().finite(),
    tolerance: z.number().finite().positive(),
    toleranceMode: z.enum(["absolute", "percentSpan"]),
    location: z.string().max(150).default(""),
    intervalMonths: z.number().int().min(1).max(120).default(12),
  })
  .refine((i) => i.rangeMax > i.rangeMin, {
    message: "Maksimum skal være større end minimum",
  });
export type Instrument = z.infer<typeof instrumentSchema> & { id: number };
export const pointSchema = z.object({
  reference: z.number().finite(),
  before: z.number().finite(),
  after: z.number().finite().nullable(),
});
export const calibrationSchema = z.object({
  instrumentId: z.number().int().positive(),
  operator: z.string().trim().min(1).max(120),
  referenceEquipment: z.string().trim().min(1).max(200),
  uncertainty: z.number().finite().nonnegative(),
  notes: z.string().max(4000).default(""),
  points: z.array(pointSchema).min(2).max(100),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Ugyldig dato",
    ),
});
export function tolerance(
  i: Pick<Instrument, "tolerance" | "toleranceMode" | "rangeMin" | "rangeMax">,
) {
  return i.toleranceMode === "absolute"
    ? i.tolerance
    : ((i.rangeMax - i.rangeMin) * i.tolerance) / 100;
}
export function evaluate(
  i: Instrument,
  points: { reference: number; before: number | null; after: number | null }[],
  uncertainty = 0,
) {
  const limit = tolerance(i);
  const rows = points.map((p) => ({
    ...p,
    beforeDeviation: p.before === null ? null : p.before - p.reference,
    afterDeviation: p.after === null ? null : p.after - p.reference,
    beforePass:
      p.before === null
        ? null
        : Math.abs(p.before - p.reference) + uncertainty <= limit,
    afterPass:
      p.after === null
        ? null
        : Math.abs(p.after - p.reference) + uncertainty <= limit,
  }));
  return {
    limit,
    rows,
    beforePass: rows.every((p) => p.beforePass !== null)
      ? rows.every((p) => p.beforePass)
      : null,
    afterPass: rows.every((p) => p.afterPass !== null)
      ? rows.every((p) => p.afterPass)
      : null,
  };
}
export function transmitter(
  value: number,
  inMin: number,
  inMax: number,
  outMin = 4,
  outMax = 20,
) {
  if (
    ![value, inMin, inMax, outMin, outMax].every(Number.isFinite) ||
    inMax <= inMin
  )
    throw Error("Ugyldigt måleområde");
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}
// IEC 60751 Callendar–Van Dusen, standard platinum alpha=0.00385.
export function resistance(temp: number, r0 = 100) {
  if (
    !Number.isFinite(temp) ||
    temp < -200 ||
    temp > 850 ||
    ![100, 1000].includes(r0)
  )
    throw Error("Temperatur skal være -200 til 850 °C");
  return (
    r0 *
    (1 +
      3.9083e-3 * temp -
      5.775e-7 * temp ** 2 +
      (temp < 0 ? -4.183e-12 * (temp - 100) * temp ** 3 : 0))
  );
}
export function temperature(ohms: number, r0 = 100) {
  if (
    !Number.isFinite(ohms) ||
    ohms < resistance(-200, r0) ||
    ohms > resistance(850, r0)
  )
    throw Error("Modstand uden for IEC 60751-området");
  let lo = -200,
    hi = 850;
  for (let j = 0; j < 70; j++) {
    const mid = (lo + hi) / 2;
    if (resistance(mid, r0) < ohms) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function heater(voltage: number, current: number) {
  if (
    ![voltage, current].every(Number.isFinite) ||
    voltage <= 0 ||
    current <= 0
  )
    throw Error("Spænding og strøm skal være positive");
  return { power: voltage * current, resistance: voltage / current };
}
