import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  evaluate,
  resistance,
  temperature,
  transmitter,
  heater,
  types,
  type Instrument,
} from "../server/calculations";
import "./style.css";
const num = (n: number) =>
  new Intl.NumberFormat("da-DK", { maximumFractionDigits: 4 }).format(n);
async function api(url: string, body?: any) {
  const r = await fetch(
    "/api/" + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Kunne ikke hente data");
  return d;
}
function App() {
  const [page, setPage] = useState("Overblik"),
    [instruments, setInstruments] = useState<Instrument[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [selected, setSelected] = useState(0),
    [search, setSearch] = useState(""),
    [showInstrument, setShowInstrument] = useState(false),
    [points, setPoints] = useState<any[]>([]),
    [report, setReport] = useState<any>(null),
    [uncertainty, setUncertainty] = useState(0);
  const load = async () => {
    try {
      const [i, h] = await Promise.all([
        api("instruments"),
        api("calibrations"),
      ]);
      setInstruments(i);
      setHistory(h);
      if (!selected && i.length) setSelected(i[0].id);
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const instrument = instruments.find((i) => i.id === selected);
  useEffect(() => {
    if (instrument)
      setPoints(
        Array.from({ length: 5 }, (_, n) => ({
          reference: Number(
            (
              instrument.rangeMin +
              ((instrument.rangeMax - instrument.rangeMin) * n) / 4
            ).toFixed(6),
          ),
          before: null,
          after: null,
        })),
      );
  }, [selected]);
  const result =
    instrument && points.length
      ? evaluate(instrument, points, uncertainty)
      : null;
  const navigate = (p: string) => {
    setPage(p);
    setError("");
    setSuccess("");
    setReport(null);
  };
  async function addInstrument(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f);
    try {
      await api("instruments", {
        ...body,
        rangeMin: Number(body.rangeMin),
        rangeMax: Number(body.rangeMax),
        tolerance: Number(body.tolerance),
        intervalMonths: Number(body.intervalMonths),
      });
      setShowInstrument(false);
      await load();
      setSuccess("Instrumentet er oprettet");
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function saveCalibration(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      await api("calibrations", {
        ...f,
        instrumentId: selected,
        uncertainty,
        points,
      });
      await load();
      navigate("Historik & rapporter");
      setSuccess("Kalibrering gemt. Certifikat og Excel er klar.");
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setPoints(d.points);
      setSuccess(`${d.points.length} målepunkter importeret`);
    } catch (e: any) {
      setError(e.message);
    }
  }
  const overdue = instruments.filter((i) => {
    const latest = history.find((h) => h.instrumentId === i.id);
    if (!latest) return true;
    const d = new Date(latest.date);
    d.setUTCMonth(d.getUTCMonth() + i.intervalMonths);
    return d < new Date();
  }).length;
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">k.</span> kalibrering
          <span className="brandSub">PRÆCISION I PRAKSIS</span>
        </div>
        <div className="navlabel">ARBEJDSOMRÅDE</div>
        {[
          "Overblik",
          "Instrumenter",
          "Ny kalibrering",
          "Historik & rapporter",
          "Beregnere",
        ].map((p, n) => (
          <button
            key={p}
            className={"nav " + (page === p ? "active" : "")}
            onClick={() => navigate(p)}
          >
            <span aria-hidden="true">{["◫", "▤", "＋", "◷", "∿"][n]}</span>
            {p}
          </button>
        ))}
        <div className="asideBottom">
          <span className="dot" /> Lokal SQLite-database
          <br />
          <small>Kalibrering · version 1.0</small>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Arbejdsområde <span className="muted">/ {page}</span>
          </span>
          <span className="user">
            DK <span>Dansk</span> <b>KA</b>
          </span>
        </header>
        <section className="content">
          <div className="heading">
            <div>
              <div className="eyebrow">KVALITET & DOKUMENTATION</div>
              <h1>
                {page === "Overblik" ? "Styr på hver eneste måling." : page}
              </h1>
              <p className="muted">
                {page === "Overblik"
                  ? "Dit samlede overblik over instrumenter, kalibreringer og dokumentation."
                  : "Præcise målinger. Sporbare resultater. Enkel dokumentation."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => navigate("Ny kalibrering")}
            >
              ＋ Ny kalibrering
            </button>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {success && (
            <div role="status" className="alert success">
              {success}
            </div>
          )}
          {page === "Overblik" && (
            <>
              <div className="stats">
                {[
                  [
                    instruments.length,
                    "Registrerede instrumenter",
                    "Samlet instrumentpark",
                  ],
                  [
                    history.length,
                    "Udførte kalibreringer",
                    "Dokumenteret og gemt",
                  ],
                  [
                    overdue,
                    "Kræver kalibrering",
                    "Uden måling eller overskredet interval",
                  ],
                ].map(([v, t, s]) => (
                  <div className="stat" key={t}>
                    <span>{t}</span>
                    <strong>{v}</strong>
                    <small>{s}</small>
                  </div>
                ))}
              </div>
              <div className="welcome">
                <div className="eyebrow">FRA MÅLING TIL DOKUMENTATION</div>
                <h2>Præcision, du kan dokumentere.</h2>
                <p>
                  Registrér før- og efterværdier, vurder tolerancer og saml
                  <br /> resultaterne i et professionelt kalibreringscertifikat.
                </p>
                <button onClick={() => navigate("Ny kalibrering")}>
                  Start en kalibrering →
                </button>
                <div className="wave">∿</div>
              </div>
              <div className="sectionTitle">
                <h2>Seneste kalibreringer</h2>
                <button
                  className="text"
                  onClick={() => navigate("Historik & rapporter")}
                >
                  Se alle →
                </button>
              </div>
              <History
                rows={history.slice(0, 5)}
                onView={(r) => {
                  setReport(r);
                  setPage("Historik & rapporter");
                }}
              />
            </>
          )}
          {page === "Instrumenter" && (
            <>
              <div className="toolbar">
                <input
                  aria-label="Søg instrumenter"
                  placeholder="Søg navn, serienummer eller type…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  className="primary"
                  onClick={() => setShowInstrument(!showInstrument)}
                >
                  ＋ Opret instrument
                </button>
              </div>
              {showInstrument && (
                <form className="card formgrid" onSubmit={addInstrument}>
                  <h2 className="wide">Nyt instrument</h2>
                  {[
                    ["name", "Instrumentnavn", "text", ""],
                    ["serial", "Serienummer", "text", ""],
                    ["unit", "Måleenhed", "text", "°C"],
                    ["location", "Placering", "text", ""],
                    ["rangeMin", "Område minimum", "number", "0"],
                    ["rangeMax", "Område maksimum", "number", "100"],
                    ["tolerance", "Tolerance ±", "number", "0.5"],
                    ["intervalMonths", "Interval (måneder)", "number", "12"],
                  ].map(([name, label, type, value]) => (
                    <label key={name}>
                      {label}
                      <input
                        required={name !== "location"}
                        name={name}
                        type={type}
                        step="any"
                        defaultValue={value}
                      />
                    </label>
                  ))}
                  <label>
                    Instrumenttype
                    <select name="type">
                      {types.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tolerancetype
                    <select name="toleranceMode">
                      <option value="absolute">Absolut (måleenhed)</option>
                      <option value="percentSpan">Procent af målespænd</option>
                    </select>
                  </label>
                  <button className="primary">Gem instrument</button>
                </form>
              )}
              <div className="card tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>INSTRUMENT</th>
                      <th>TYPE</th>
                      <th>OMRÅDE</th>
                      <th>TOLERANCE</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {instruments
                      .filter((i) =>
                        `${i.name} ${i.serial} ${i.type}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((i) => (
                        <tr key={i.id}>
                          <td>
                            <b>{i.name}</b>
                            <small>
                              {i.serial} · {i.location}
                            </small>
                          </td>
                          <td>{i.type}</td>
                          <td>
                            {i.rangeMin}–{i.rangeMax} {i.unit}
                          </td>
                          <td>
                            ±{i.tolerance}{" "}
                            {i.toleranceMode === "absolute"
                              ? i.unit
                              : "% spænd"}
                          </td>
                          <td>
                            <button
                              onClick={() => {
                                setSelected(i.id);
                                navigate("Ny kalibrering");
                              }}
                            >
                              Kalibrér →
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!instruments.length && (
                  <p>Opret dit første instrument for at komme i gang.</p>
                )}
              </div>
            </>
          )}
          {page === "Ny kalibrering" && (
            <form onSubmit={saveCalibration}>
              <div className="card formgrid">
                <h2 className="wide">01 · Instrument og sporbarhed</h2>
                <label className="wide">
                  Instrument
                  <select
                    required
                    value={selected || ""}
                    onChange={(e) => setSelected(Number(e.target.value))}
                  >
                    <option value="" disabled>
                      Vælg instrument
                    </option>
                    {instruments.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} · {i.serial}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kalibreringsdato
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  Udført af
                  <input
                    name="operator"
                    required
                    placeholder="Navn på ansvarlig"
                  />
                </label>
                <label>
                  Referenceudstyr / certifikatnummer
                  <input
                    name="referenceEquipment"
                    required
                    placeholder="Identifikation af sporbar reference"
                  />
                </label>
                <label>
                  Udvidet usikkerhed ({instrument?.unit})
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={uncertainty}
                    onChange={(e) => setUncertainty(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="card">
                <div className="sectionTitle">
                  <h2>02 · Målepunkter</h2>
                  <div>
                    <a href="/api/template">Hent Excel-skabelon</a>
                    <label className="fileButton">
                      Importér Excel
                      <input
                        type="file"
                        accept=".xlsx"
                        onChange={(e) => importFile(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>
                <p className="muted">
                  Alle værdier i {instrument?.unit}. Tomme efterværdier betyder,
                  at efterkalibrering ikke er afsluttet.
                </p>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>REFERENCE</th>
                        <th>FØR</th>
                        <th>EFTER</th>
                        <th>AFVIGELSE FØR / EFTER</th>
                        <th>VURDERING</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((p, n) => (
                        <tr key={n}>
                          {["reference", "before", "after"].map((k) => (
                            <td key={k}>
                              <input
                                aria-label={`${k} punkt ${n + 1}`}
                                required={k !== "after"}
                                type="number"
                                step="any"
                                value={p[k] ?? ""}
                                onChange={(e) =>
                                  setPoints(
                                    points.map((x, j) =>
                                      j === n
                                        ? {
                                            ...x,
                                            [k]:
                                              e.target.value === ""
                                                ? null
                                                : Number(e.target.value),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            </td>
                          ))}
                          <td>
                            {result?.rows[n].beforeDeviation == null
                              ? "—"
                              : num(result.rows[n].beforeDeviation)}{" "}
                            /{" "}
                            {result?.rows[n].afterDeviation === null
                              ? "—"
                              : num(result?.rows[n].afterDeviation ?? 0)}
                          </td>
                          <td>
                            <Badge pass={result?.rows[n].afterPass ?? null} />
                          </td>
                          <td>
                            <button
                              type="button"
                              aria-label="Fjern punkt"
                              disabled={points.length <= 2}
                              onClick={() =>
                                setPoints(points.filter((_, j) => j !== n))
                              }
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPoints([
                      ...points,
                      { reference: 0, before: 0, after: null },
                    ])
                  }
                >
                  ＋ Tilføj målepunkt
                </button>
              </div>
              {result && (
                <div className="card">
                  <h2>03 · Afvigelser og tolerance</h2>
                  <Chart result={result} />
                  <p className="muted">
                    Godkendt når |afvigelse| + usikkerhed ≤ {num(result.limit)}{" "}
                    {instrument?.unit}. Før:{" "}
                    {result.beforePass === null
                      ? "Ikke afsluttet"
                      : result.beforePass
                        ? "Godkendt"
                        : "Afvist"}
                    .
                  </p>
                </div>
              )}
              <div className="card">
                <label>
                  Bemærkninger
                  <textarea
                    name="notes"
                    rows={3}
                    placeholder="Justeringer, miljøforhold og øvrige observationer"
                  />
                </label>
                <p className="muted">
                  Gemte rapporter er uforanderlige. Registrér en ny kalibrering
                  ved rettelser.
                </p>
                <button className="primary" disabled={!instrument}>
                  Gem kalibrering og opret rapport →
                </button>
              </div>
            </form>
          )}
          {page === "Historik & rapporter" && (
            <>
              {report ? (
                <div className="card">
                  <button onClick={() => setReport(null)}>
                    ← Alle rapporter
                  </button>
                  <h2>{report.instrument.name}</h2>
                  <p>
                    {report.date} · {report.operator} · KAL-{report.id}
                  </p>
                  <Chart result={report.result} />
                  <Downloads id={report.id} />
                </div>
              ) : (
                <History rows={history} onView={setReport} />
              )}
            </>
          )}
          {page === "Beregnere" && <Calculators />}
          <footer>
            Kalibrering / Instrumentstyring{" "}
            <span>Data gemmes lokalt · Ingen akkreditering angivet</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
function Badge({ pass }: { pass: boolean | null }) {
  return (
    <span
      className={"badge " + (pass === null ? "neutral" : pass ? "good" : "bad")}
    >
      {pass === null ? "Ikke afsluttet" : pass ? "Godkendt" : "Afvist"}
    </span>
  );
}
function Downloads({ id }: { id: number }) {
  return (
    <div className="downloads">
      <a href={`/api/calibrations/${id}/pdf`}>↓ PDF-certifikat</a>
      <a href={`/api/calibrations/${id}/excel`}>↓ Excel</a>
    </div>
  );
}
function History({ rows, onView }: { rows: any[]; onView: (r: any) => void }) {
  return (
    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>INSTRUMENT / CERTIFIKAT</th>
            <th>DATO</th>
            <th>UDFØRT AF</th>
            <th>EFTERKALIBRERING</th>
            <th>RAPPORT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <button className="text" onClick={() => onView(r)}>
                  {r.instrument.name}
                </button>
                <small>
                  {r.instrument.serial} · KAL-{String(r.id).padStart(6, "0")}
                </small>
              </td>
              <td>{new Date(r.date).toLocaleDateString("da-DK")}</td>
              <td>{r.operator}</td>
              <td>
                <Badge pass={r.result.afterPass} />
              </td>
              <td>
                <Downloads id={r.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p>
          Ingen kalibreringer endnu. Opret en kalibrering for at se historik og
          rapporter.
        </p>
      )}
    </div>
  );
}
function Chart({ result }: { result: any }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={result.rows}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="reference" />
          <YAxis domain={["auto", "auto"]} />
          <Tooltip />
          <Legend />
          <ReferenceLine
            ifOverflow="extendDomain"
            y={result.limit}
            stroke="#cc8142"
            strokeDasharray="5 5"
            label="+ tolerance"
          />
          <ReferenceLine
            ifOverflow="extendDomain"
            y={-result.limit}
            stroke="#cc8142"
            strokeDasharray="5 5"
            label="− tolerance"
          />
          <Line
            name="Afvigelse før"
            dataKey="beforeDeviation"
            stroke="#d19b62"
            strokeWidth={2}
          />
          <Line
            name="Afvigelse efter"
            dataKey="afterDeviation"
            stroke="#187a67"
            strokeWidth={3}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function Calculators() {
  const [t, setT] = useState(100),
    [ohm, setOhm] = useState(138.5055),
    [r0, setR0] = useState(100),
    [v, setV] = useState(50),
    [ma, setMa] = useState(12),
    [min, setMin] = useState(0),
    [max, setMax] = useState(100),
    [volt, setVolt] = useState(230),
    [amp, setAmp] = useState(10);
  const safe = (fn: () => string) => {
    try {
      return fn();
    } catch (e: any) {
      return e.message;
    }
  };
  return (
    <div className="calculatorGrid">
      <div className="card">
        <h2>PT100 / PT1000</h2>
        <p className="muted">IEC 60751 · α = 0,00385 · −200 til 850 °C</p>
        <label>
          Følertype
          <select value={r0} onChange={(e) => setR0(Number(e.target.value))}>
            <option value={100}>PT100</option>
            <option value={1000}>PT1000</option>
          </select>
        </label>
        <label>
          Temperatur (°C)
          <input
            type="number"
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
          />
        </label>
        <output>{safe(() => num(resistance(t, r0)) + " Ω")}</output>
        <label>
          Modstand (Ω)
          <input
            type="number"
            value={ohm}
            onChange={(e) => setOhm(Number(e.target.value))}
          />
        </label>
        <output>{safe(() => num(temperature(ohm, r0)) + " °C")}</output>
      </div>
      <div className="card">
        <h2>Transmitter · 4–20 mA</h2>
        <p className="muted">
          Lineær konvertering fra procesværdi til strømsignal.
        </p>
        {[
          ["Minimum", min, setMin],
          ["Maksimum", max, setMax],
          ["Procesværdi", v, setV],
        ].map(([l, x, s]: any) => (
          <label key={l}>
            {l}
            <input
              type="number"
              value={x}
              onChange={(e) => s(Number(e.target.value))}
            />
          </label>
        ))}
        <output>{safe(() => num(transmitter(v, min, max)) + " mA")}</output>
        <label>
          Strømsignal (mA)
          <input
            type="number"
            step="any"
            value={ma}
            onChange={(e) => setMa(Number(e.target.value))}
          />
        </label>
        <output>
          {safe(() => {
            if (max <= min) throw Error("Ugyldigt måleområde");
            return num(transmitter(ma, 4, 20, min, max)) + " procesenheder";
          })}
        </output>
      </div>
      <div className="card">
        <h2>Varmelegeme</h2>
        <p className="muted">Resistiv belastning · P = U × I · R = U / I</p>
        <label>
          Spænding (V)
          <input
            type="number"
            value={volt}
            onChange={(e) => setVolt(Number(e.target.value))}
          />
        </label>
        <label>
          Strøm (A)
          <input
            type="number"
            value={amp}
            onChange={(e) => setAmp(Number(e.target.value))}
          />
        </label>
        <output>
          {safe(() => {
            const h = heater(volt, amp);
            return `${num(h.power)} W / ${num(h.resistance)} Ω`;
          })}
        </output>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
