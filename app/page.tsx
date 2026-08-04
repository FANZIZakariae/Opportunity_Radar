import { DashboardClient } from "@/components/DashboardClient";
import { RadarLauncher } from "@/components/RadarLauncher";
import { SERVICE_CATALOG } from "@/lib/service-catalog";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <>
    <header className="page-header split-header">
      <div><p className="eyebrow">Evidence-grounded client acquisition</p><h1>Find the signal.<br/><span>Reach the right person.</span></h1></div>
      <p className="header-copy">Monitor public business signals, turn them into defensible opportunity hypotheses, and prepare a hook tied to what the company is doing now.</p>
    </header>
    <RadarLauncher services={SERVICE_CATALOG} />
    <DashboardClient />
  </>;
}
