import { OutreachClient } from "@/components/OutreachClient";

export default function OutreachPage() {
  return <>
    <header className="page-header"><p className="eyebrow">Human-approved prospecting</p><h2>Outreach workspace</h2><p className="lede">Review the exact signal, choose the message and contact route, then record the result. This release never sends automatically.</p></header>
    <OutreachClient />
  </>;
}
