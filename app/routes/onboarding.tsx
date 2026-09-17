import { redirect } from "react-router";
import { SenderSettings } from "~/components/sender-settings";
import { getState, initializeLocalState } from "~/lib/store";
export async function clientLoader() {
  await initializeLocalState(false);
  if (getState().sender) return redirect("/");
  return null;
}
export function meta() { return [{ title: "Set up your sender · Cold Email Sender" }]; }
export default function Onboarding() { return <SenderSettings onboarding />; }
export function HydrateFallback() { return <p className="hint">Loading setup…</p>; }
