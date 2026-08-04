import { MonitorClient } from "@/components/MonitorClient";

export default function MonitorPage() {
  return <>
    <header className="page-header"><p className="eyebrow">No silent background work</p><h2>Research monitor</h2><p className="lede">See every source, queued company, Codex analysis, rejection and failure. Pause, resume or stop at safe checkpoints.</p></header>
    <MonitorClient />
  </>;
}
