import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const path = process.env.DB_PATH || "data/kalibrering.sqlite";
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS instruments(id INTEGER PRIMARY KEY, name TEXT NOT NULL, serial TEXT NOT NULL UNIQUE, type TEXT NOT NULL, unit TEXT NOT NULL, rangeMin REAL NOT NULL, rangeMax REAL NOT NULL, tolerance REAL NOT NULL, toleranceMode TEXT NOT NULL, location TEXT NOT NULL, intervalMonths INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS calibrations(id INTEGER PRIMARY KEY,instrumentId INTEGER NOT NULL REFERENCES instruments(id),date TEXT NOT NULL,operator TEXT NOT NULL,referenceEquipment TEXT NOT NULL,uncertainty REAL NOT NULL,notes TEXT NOT NULL,points TEXT NOT NULL,instrumentSnapshot TEXT NOT NULL,createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
