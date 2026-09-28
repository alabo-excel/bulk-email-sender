import { useState } from "react";
import { useAtomValue } from "jotai";
import { stateAtom } from "~/lib/store";
import { SenderForm } from "./sender-form";
import { ConnectionPanel } from "./connection-panel";
import { TestEmailForm } from "./test-email-form";
import { NoticeRegions, type Notice } from "./notice";

export function SenderSettings({ onboarding = false }: { onboarding?: boolean }) {
  const { sender, suppression } = useAtomValue(stateAtom);
  // One notice for the whole screen: competing live regions talk over each other.
  const [notice, setNotice] = useState<Notice | null>(null);

  // Full-bleed to the shell's width. Onboarding keeps its own narrow wrapper,
  // since that screen is a single focused task.
  if (onboarding) return <div className="space-y-6">
    <SenderForm onboarding onNotice={setNotice} />
    <NoticeRegions notice={notice} />
  </div>;

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="hint mt-1 text-sm">The mailbox your campaigns are sent from.</p>
    </div>
    <NoticeRegions notice={notice} />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <SenderForm onboarding={false} onNotice={setNotice} />
      {sender && <div className="space-y-6">
        <section className="card"><ConnectionPanel onNotice={setNotice} /></section>
        <section className="card space-y-3">
          <h2 className="font-semibold">Test email</h2>
          <p className="hint">Sends one short message so you can confirm it arrives.</p>
          <TestEmailForm onNotice={setNotice} />
        </section>
        <section className="card">
          <h2 className="section-title">Suppression list</h2>
          <p className="mt-2 text-sm"><span className="text-2xl font-semibold tabular-nums">{suppression.length}</span> address{suppression.length === 1 ? "" : "es"} will never be emailed.</p>
          <p className="hint mt-1">Add addresses from a campaign's send step.</p>
        </section>
      </div>}
    </div>
  </div>;
}
