import { useState } from "react";
import { useAtomValue } from "jotai";
import { stateAtom } from "~/lib/store";
import { SenderForm } from "./sender-form";
import { UnlockPanel } from "./unlock-panel";
import { TestEmailForm } from "./test-email-form";
import { NoticeRegions, type Notice } from "./notice";

export function SenderSettings({ onboarding = false }: { onboarding?: boolean }) {
  const { sender, suppression } = useAtomValue(stateAtom);
  // One notice for the whole screen: competing live regions talk over each other.
  const [notice, setNotice] = useState<Notice | null>(null);

  // Full-bleed to the shell's width. Onboarding keeps its own narrow wrapper,
  // since that screen is a single focused task.
  return <div className="space-y-6">
    <SenderForm onboarding={onboarding} onNotice={setNotice} />

    {sender && !onboarding && <section className="card space-y-4">
      <UnlockPanel sender={sender} onNotice={setNotice} />
      <TestEmailForm onNotice={setNotice} />
      <p className="hint">{suppression.length} suppressed addresses. Add addresses from a campaign screen.</p>
    </section>}

    <NoticeRegions notice={notice} />
  </div>;
}
