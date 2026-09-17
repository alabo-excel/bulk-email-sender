import { atom, createStore, type WritableAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { redirect } from "react-router";
import type { CsvTable } from "./csv";
import type { ContactList, SendReport } from "./types";

export type Sender = {
  email: string; name: string; host: string; port: number;
  /**
   * The SMTP password in plaintext. It is written to localStorage with the rest
   * of the local state and is readable by anything with access to this browser
   * profile, including any script running on the page. This is a deliberate
   * product decision to avoid an unlock prompt on every page load.
   */
  password: string;
};
type LocalState = { sender: Sender | null; lists: ContactList[]; reports: SendReport[]; suppression: string[] };
const empty: LocalState = { sender: null, lists: [], reports: [], suppression: [] };
export const localStore = createStore();
const activeAtom = atom<WritableAtom<LocalState, [LocalState], void>>(atom<LocalState>(empty));
export const stateAtom = atom((get) => get(get(activeAtom)));
let currentUser = "";
export function clearSession() {
  currentUser = "";
  localStore.set(activeAtom, atom<LocalState>(empty));
}
export function userId() { return currentUser; }
export async function initializeLocalState(requireSender = true) {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (response.status === 401) { clearSession(); throw redirect("/sign-in"); }
  if (!response.ok) throw new Error("Unable to check your session. Please reload.");
  const { userId: id } = await response.json() as { userId: string };
  if (id !== currentUser) {
    clearSession();
    const storage = createJSONStorage<LocalState>(() => localStorage);
    const saved = atomWithStorage<LocalState>(`email-sender:v2:${id}`, empty, storage, { getOnInit: true });
    localStore.set(activeAtom, saved);
    currentUser = id;
  }
  if (requireSender && !getState().sender) throw redirect("/onboarding");
}
export function getState() { return localStore.get(stateAtom); }
export function updateState(update: (state: LocalState) => LocalState) {
  if (!currentUser) throw new Error("Sign in before saving data.");
  const next = update(getState());
  // Write first so quota/privacy failures cannot silently lose a saved report.
  try { localStorage.setItem(`email-sender:v2:${currentUser}`, JSON.stringify(next)); }
  catch { throw new Error("Browser storage is full or unavailable. Free up space and try again."); }
  localStore.set(localStore.get(activeAtom), next);
}
export function readSmtpConfig() {
  const sender = getState().sender;
  return { config: sender ? { fromEmail: sender.email } : null, issues: sender ? [] : [{ message: "Set up your sender in Settings.", key: "sender" }] };
}
export function saveList(name: string, table: CsvTable): ContactList {
  const list = { id: crypto.randomUUID(), name, uploadedAt: Date.now(), ...table };
  updateState((state) => ({ ...state, lists: [list, ...state.lists] }));
  return list;
}
export function getList(id: string) { return getState().lists.find((list) => list.id === id); }
export function listLists() { return getState().lists; }
export function deleteList(id: string) {
  updateState((state) => ({ ...state, lists: state.lists.filter((list) => list.id !== id), reports: state.reports.filter((report) => report.listId !== id) }));
}
export function saveReport(report: SendReport) {
  updateState((state) => ({ ...state, reports: [report, ...state.reports.filter((item) => item.id !== report.id)] }));
}
export function getReport(id: string) { return getState().reports.find((report) => report.id === id); }
export function listReportsForList(id: string) { return getState().reports.filter((report) => report.listId === id); }
export function getSentEmails(id: string) {
  return new Set(listReportsForList(id).filter((report) => !report.dryRun).flatMap((report) => report.attempts.filter((attempt) => attempt.status === "sent").map((attempt) => attempt.email)));
}
export function getSuppression() { return new Set(getState().suppression); }
export function addToSuppression(emails: Iterable<string>) {
  updateState((state) => ({ ...state, suppression: [...new Set([...state.suppression, ...emails])] }));
}
export async function smtpRequest(payload: Record<string, unknown>) {
  const sender = getState().sender;
  if (!sender) throw new Error("Set up your sender in Settings before sending.");
  const response = await fetch("/api/smtp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, expectedUserId: currentUser, sender: { email: sender.email, name: sender.name, host: sender.host, port: sender.port, password: sender.password } }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "SMTP request failed.");
  return result as { ok: boolean; message: string };
}
