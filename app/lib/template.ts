/**
 * Mustache-lite personalization: `{{Column}}` with an optional fallback,
 * `{{Column|there}}`. Column lookup is case- and space-insensitive so
 * `{{first name}}` matches a `First Name` CSV header.
 */
const TOKEN = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export type RenderResult = {
  text: string;
  /** Tokens with no matching column and no fallback — left as-is in `text`. */
  missing: string[];
};

export function renderTemplate(
  template: string,
  row: Record<string, string>,
): RenderResult {
  const lookup = normalizeKeys(row);
  const missing: string[] = [];

  const text = template.replace(TOKEN, (match, rawName, fallback) => {
    const value = lookup.get(normalizeKey(rawName));
    if (value) return value;
    if (fallback !== undefined) return fallback;
    missing.push(String(rawName).trim());
    return match;
  });

  return { text, missing: [...new Set(missing)] };
}

/** Token names used in a template, for the "available variables" UI. */
export function extractTokens(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(TOKEN)) {
    names.add(match[1].trim());
  }
  return [...names];
}

function normalizeKeys(row: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    map.set(normalizeKey(key), value);
  }
  return map;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Minimal HTML email body from plain text, preserving paragraph breaks. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">${paragraphs}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
