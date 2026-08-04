import { SettingsClient } from "@/components/SettingsClient";
import { SERVICE_CATALOG } from "@/lib/service-catalog";

export default function SettingsPage() {
  return <>
    <header className="page-header"><p className="eyebrow">Local configuration</p><h2>Sources and boundaries</h2><p className="lede">Select the intelligence provider, check live connectors, review the commercial service catalogue and understand the evidence rules.</p></header>
    <SettingsClient services={SERVICE_CATALOG} />
  </>;
}

