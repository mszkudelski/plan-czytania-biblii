import type { ImportedRow } from "../types";

const DATE_HEADERS = ["date", "data"];
const TITLE_HEADERS = [
  "title",
  "tytuł",
  "tytul",
  "temat",
  "name",
  "nazwa",
  "dzień",
  "dzien",
  "day",
];
const GENERIC_READING_HEADERS = [
  "fragments",
  "fragmenty",
  "fragment",
  "reading",
  "readings",
  "czytanie",
  "tekst",
  "passage",
];

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase("pl").replace(/\s+/g, " ");
}

function detectDelimiter(line: string) {
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: line.split(delimiter).length - 1,
    }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCsvTable(input: string): {
  headers: string[];
  rows: string[][];
  delimiter: string;
} {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return { headers: [], rows: [], delimiter: "," };

  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0]);
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) table.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) table.push(row);

  return {
    headers: table[0] ?? [],
    rows: table.slice(1),
    delimiter,
  };
}

function splitGenericReadings(value: string) {
  return value
    .split(/\s*(?:\||\n|\s\/\s|\s\+\s)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDate(value: string): string | undefined {
  if (!value) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  if (iso) return iso;

  const polish = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!polish) return undefined;
  const [, day, month, year] = polish;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parsePlanCsv(input: string): ImportedRow[] {
  const { headers, rows } = parseCsvTable(input);
  if (!headers.length) return [];

  const normalized = headers.map(normalizeHeader);
  const dateIndex = normalized.findIndex((header) => DATE_HEADERS.includes(header));
  const titleIndex = normalized.findIndex((header) => TITLE_HEADERS.includes(header));

  const contentColumns = normalized
    .map((header, index) => ({ header, original: headers[index], index }))
    .filter(({ header, index }) => {
      return (
        index !== dateIndex &&
        index !== titleIndex &&
        !["nr", "lp", "id", "index", "numer"].includes(header)
      );
    });

  return rows
    .map((row, rowIndex) => {
      const segments = contentColumns.flatMap(({ header, original, index }) => {
        const value = row[index]?.trim();
        if (!value) return [];
        const labels = GENERIC_READING_HEADERS.includes(header)
          ? splitGenericReadings(value)
          : [value];
        return labels.map((label) => ({
          label,
          section: GENERIC_READING_HEADERS.includes(header)
            ? "Fragment"
            : original.trim(),
        }));
      });

      return {
        title: row[titleIndex]?.trim() || `Dzień ${rowIndex + 1}`,
        date: normalizeDate(row[dateIndex]?.trim() ?? ""),
        segments,
      };
    })
    .filter((row) => row.segments.length > 0);
}

export const SAMPLE_CSV = `Dzień;Stary Testament;Nowy Testament;Psalm
Początek;Rdz 1–3;Mt 1;Ps 1
Obietnica;Rdz 4–6;Mt 2;Ps 2
Nowy początek;Rdz 7–9;Mt 3;Ps 3
Powołanie;Rdz 10–12;Mt 4;Ps 4
Zaufanie;Rdz 13–15;Mt 5,1–26;Ps 5
Przymierze;Rdz 16–18;Mt 5,27–48;Ps 6
Gościnność;Rdz 19–21;Mt 6;Ps 7`;
