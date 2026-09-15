import { randomUUID } from "node:crypto";
import type { CsvTable } from "./csv";

export type ContactList = {
  id: string;
  name: string;
  uploadedAt: number;
  headers: string[];
  rows: Record<string, string>[];
};

export type SendAttempt = {
  email: string;
  rowNumber: number;
  subject: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  reason?: string;
  sentAt: number;
};

export type SendReport = {
  id: string;
  listId: string;
  listName: string;
  startedAt: number;
  finishedAt: number;
  dryRun: boolean;
  attempts: SendAttempt[];
};

/**
 * In-memory only: everything is lost on restart, which is intentional for a
 * local single-operator tool. Kept on globalThis so Vite's dev HMR does not
 * wipe uploaded lists on every server reload.
 */
type Store = {
  lists: Map<string, ContactList>;
  reports: Map<string, SendReport>;
  /** Lowercased addresses already mailed in this process, per list. */
  sentByList: Map<string, Set<string>>;
  suppression: Set<string>;
};

const globalStore = globalThis as unknown as { __emailSenderStore?: Store };

const store: Store = (globalStore.__emailSenderStore ??= {
  lists: new Map(),
  reports: new Map(),
  sentByList: new Map(),
  suppression: new Set(),
});

const MAX_LISTS = 20;

export function saveList(name: string, table: CsvTable): ContactList {
  const list: ContactList = {
    id: randomUUID(),
    name,
    uploadedAt: Date.now(),
    headers: table.headers,
    rows: table.rows,
  };
  store.lists.set(list.id, list);
  evictOldestLists();
  return list;
}

export function getList(id: string): ContactList | undefined {
  return store.lists.get(id);
}

export function listLists(): ContactList[] {
  return [...store.lists.values()].sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export function deleteList(id: string): void {
  store.lists.delete(id);
  store.sentByList.delete(id);
  for (const [reportId, report] of store.reports) {
    if (report.listId === id) store.reports.delete(reportId);
  }
}

export function saveReport(report: Omit<SendReport, "id">): SendReport {
  const saved: SendReport = { ...report, id: randomUUID() };
  store.reports.set(saved.id, saved);
  return saved;
}

export function getReport(id: string): SendReport | undefined {
  return store.reports.get(id);
}

export function listReportsForList(listId: string): SendReport[] {
  return [...store.reports.values()]
    .filter((report) => report.listId === listId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function getSentEmails(listId: string): Set<string> {
  return store.sentByList.get(listId) ?? new Set();
}

export function markSent(listId: string, email: string): void {
  const existing = store.sentByList.get(listId);
  if (existing) existing.add(email);
  else store.sentByList.set(listId, new Set([email]));
}

export function getSuppression(): Set<string> {
  return store.suppression;
}

export function addToSuppression(emails: Iterable<string>): void {
  for (const email of emails) store.suppression.add(email);
}

/** Bound memory use: drop the least recently uploaded lists. */
function evictOldestLists(): void {
  if (store.lists.size <= MAX_LISTS) return;
  const oldest = [...store.lists.values()].sort(
    (a, b) => a.uploadedAt - b.uploadedAt,
  );
  for (const list of oldest.slice(0, store.lists.size - MAX_LISTS)) {
    deleteList(list.id);
  }
}
