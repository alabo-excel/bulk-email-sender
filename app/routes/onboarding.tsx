import { redirect } from "react-router";
import { SenderSettings } from "~/components/sender-settings";
import { SetupSteps } from "~/components/setup-steps";
import { getState, initializeLocalState } from "~/lib/store";
export async function clientLoader() {
  await initializeLocalState(false);
  if (getState().sender) return redirect("/");
  return null;
}
export function meta() { return [{ title: "Set up your sender · Cold Email Sender" }]; }
export default function Onboarding() {
  return <div className="mx-auto max-w-2xl space-y-5">
    <SetupSteps current={1} />
    <SenderSettings onboarding />
  </div>;
}
export function HydrateFallback() { return <p className="hint">Loading setup…</p>; }
