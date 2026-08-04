import { OpportunitiesClient } from "@/components/OpportunitiesClient";
import { SERVICE_CATALOG } from "@/lib/service-catalog";

export default function OpportunitiesPage() {
  return <>
    <header className="page-header"><p className="eyebrow">Evidence before outreach</p><h2>Client opportunities</h2><p className="lede">Every card explains the observed signal, the inferred or explicit need, who owns it, and what you should say.</p></header>
    <OpportunitiesClient services={SERVICE_CATALOG} />
  </>;
}
