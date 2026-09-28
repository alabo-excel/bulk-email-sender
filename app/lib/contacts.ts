const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Best guess at which CSV column holds the email address. */
export function guessEmailColumn(
  headers: string[],
  rows: Record<string, string>[],
): string | null {
  const byName = headers.find((header) =>
    /^(e-?mail|email_?address|work_?email|contact_?email)$/i.test(header.trim()),
  );
  if (byName) return byName;

  const looksLikeEmail = headers.find((header) => /mail/i.test(header));
  if (looksLikeEmail) return looksLikeEmail;

  // Fall back to whichever column actually contains the most valid addresses.
  const sample = rows.slice(0, 50);
  let best: string | null = null;
  let bestHits = 0;
  for (const header of headers) {
    const hits = sample.filter((row) => isValidEmail(row[header] ?? "")).length;
    if (hits > bestHits) {
      best = header;
      bestHits = hits;
    }
  }
  return bestHits > 0 ? best : null;
}

/** Guess a column holding a person's first or full name, for greetings. */
export function guessNameColumn(headers: string[]): string | null {
  const patterns = [
    /^first_?name$/i,
    /^f_?name$/i,
    /^given_?name$/i,
    /^full_?name$/i,
    /^name$/i,
    /^contact_?name$/i,
  ];
  for (const pattern of patterns) {
    const found = headers.find((header) => pattern.test(header.trim()));
    if (found) return found;
  }
  return null;
}

export type Recipient = {
  /** 1-based index of the row in the original CSV, for reporting. */
  rowNumber: number;
  email: string;
  row: Record<string, string>;
};

export type SkippedRow = {
  rowNumber: number;
  email: string;
  reason: "invalid-email" | "duplicate" | "suppressed" | "already-sent";
};

export type AudienceOptions = {
  emailColumn: string;
  /** Addresses to never mail — manual suppression plus prior sends. */
  suppressed?: Set<string>;
  alreadySent?: Set<string>;
};

/**
 * Turns filtered rows into a deduped, validated send list. Rows are dropped
 * rather than failed later so the send report is accurate up front.
 */
export function buildAudience(
  rows: Record<string, string>[],
  rowNumbers: number[],
  { emailColumn, suppressed, alreadySent }: AudienceOptions,
): { recipients: Recipient[]; skipped: SkippedRow[] } {
  const recipients: Recipient[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = rowNumbers[index];
    const raw = row[emailColumn] ?? "";
    const email = normalizeEmail(raw);

    if (!isValidEmail(email)) {
      skipped.push({ rowNumber, email: raw, reason: "invalid-email" });
      return;
    }
    if (seen.has(email)) {
      skipped.push({ rowNumber, email, reason: "duplicate" });
      return;
    }
    seen.add(email);

    if (suppressed?.has(email)) {
      skipped.push({ rowNumber, email, reason: "suppressed" });
      return;
    }
    if (alreadySent?.has(email)) {
      skipped.push({ rowNumber, email, reason: "already-sent" });
      return;
    }

    recipients.push({ rowNumber, email, row });
  });

  return { recipients, skipped };
}

export function parseEmailList(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,;]+/)
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

/** Turns a free-typed column label into a merge-tag-friendly key. */
export function toColumnKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type ManualEntryResult =
  | { ok: true; headers: string[]; rows: Record<string, string>[] }
  | { ok: false; error: string };

/**
 * Validates contacts typed into the manual entry form. Fully blank rows are
 * ignored; any other row must carry a valid, unique email address.
 */
export function buildManualTable(
  headers: string[],
  rows: Record<string, string>[],
): ManualEntryResult {
  const columns = [...new Set(headers.map(toColumnKey).filter(Boolean))];
  if (!columns.includes("email")) columns.unshift("email");

  const cleaned = rows
    .map((row) =>
      Object.fromEntries(columns.map((column) => [column, String(row[column] ?? "").trim()])),
    )
    .filter((row) => columns.some((column) => row[column] !== ""));

  if (cleaned.length === 0) {
    return { ok: false, error: "Add at least one contact with an email address." };
  }

  const seen = new Set<string>();
  for (const [index, row] of cleaned.entries()) {
    const email = normalizeEmail(row.email);
    if (!isValidEmail(email)) {
      return {
        ok: false,
        error: row.email
          ? `Contact ${index + 1}: “${row.email}” is not a valid email address.`
          : `Contact ${index + 1} is missing an email address.`,
      };
    }
    if (seen.has(email)) {
      return { ok: false, error: `Contact ${index + 1}: ${email} is already in this list.` };
    }
    seen.add(email);
    row.email = email;
  }

  return { ok: true, headers: columns, rows: cleaned };
}
