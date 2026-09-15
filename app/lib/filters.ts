export const OPERATORS = [
  { value: "equals", label: "equals", needsValue: true },
  { value: "not_equals", label: "does not equal", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "not_contains", label: "does not contain", needsValue: true },
  { value: "starts_with", label: "starts with", needsValue: true },
  { value: "ends_with", label: "ends with", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
  { value: "gt", label: "greater than (number)", needsValue: true },
  { value: "lt", label: "less than (number)", needsValue: true },
  { value: "in_list", label: "is one of (comma separated)", needsValue: true },
] as const;

export type Operator = (typeof OPERATORS)[number]["value"];

export type FilterRule = {
  column: string;
  operator: Operator;
  value: string;
};

export type FilterMatch = "all" | "any";

export function operatorNeedsValue(operator: Operator): boolean {
  return OPERATORS.find((o) => o.value === operator)?.needsValue ?? true;
}

export function matchesRules(
  row: Record<string, string>,
  rules: FilterRule[],
  match: FilterMatch,
): boolean {
  const active = rules.filter((rule) => rule.column);
  if (active.length === 0) return true;

  const results = active.map((rule) => matchesRule(row, rule));
  return match === "all" ? results.every(Boolean) : results.some(Boolean);
}

function matchesRule(row: Record<string, string>, rule: FilterRule): boolean {
  const cell = (row[rule.column] ?? "").trim();
  const needle = rule.value.trim();
  const a = cell.toLowerCase();
  const b = needle.toLowerCase();

  switch (rule.operator) {
    case "equals":
      return a === b;
    case "not_equals":
      return a !== b;
    case "contains":
      return a.includes(b);
    case "not_contains":
      return !a.includes(b);
    case "starts_with":
      return a.startsWith(b);
    case "ends_with":
      return a.endsWith(b);
    case "is_empty":
      return cell === "";
    case "is_not_empty":
      return cell !== "";
    case "gt":
    case "lt": {
      const cellNumber = toNumber(cell);
      const target = toNumber(needle);
      if (cellNumber === null || target === null) return false;
      return rule.operator === "gt" ? cellNumber > target : cellNumber < target;
    }
    case "in_list":
      return needle
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .includes(a);
    default:
      return true;
  }
}

/** Tolerates currency symbols, thousands separators and stray spaces. */
function toNumber(value: string): number | null {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
