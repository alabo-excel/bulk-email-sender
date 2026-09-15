export type CsvTable = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * RFC 4180-ish CSV parser: handles quoted fields, escaped quotes (""),
 * embedded newlines/commas, and CRLF. Auto-detects comma/semicolon/tab
 * delimiters from the header line.
 */
export function parseCsv(input: string): CsvTable {
  const text = stripBom(input).replace(/\r\n?/g, "\n");
  if (!text.trim()) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(text);
  const records = parseRecords(text, delimiter);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = dedupeHeaders(records[0].map((h) => h.trim()));
  const rows: Record<string, string>[] = [];

  for (const record of records.slice(1)) {
    // Skip blank lines that produce a single empty field.
    if (record.length === 1 && record[0].trim() === "") continue;
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (record[i] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function detectDelimiter(text: string): string {
  const firstLine = firstLogicalLine(text);
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = countOutsideQuotes(firstLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** The header line, respecting quoted newlines. */
function firstLogicalLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "\n" && !inQuotes) return text.slice(0, i);
  }
  return text;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === delimiter && !inQuotes) count++;
  }
  return count;
}

function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/** Column names must be unique to key rows by header. */
function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}
