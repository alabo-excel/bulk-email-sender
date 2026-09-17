import { SenderSettings } from "~/components/sender-settings";
import { initializeLocalState } from "~/lib/store";
export async function clientLoader() { await initializeLocalState(false); return null; }
export function meta() { return [{ title: "Settings · Cold Email Sender" }]; }
export default function Settings() { return <SenderSettings />; }
export function HydrateFallback() { return <p className="hint">Loading settings…</p>; }
