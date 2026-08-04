import { CompaniesClient } from "@/components/CompaniesClient";

export default function CompaniesPage() {
  return <>
    <header className="page-header"><p className="eyebrow">Company intelligence</p><h2>Monitored organizations</h2><p className="lede">A deduplicated map of agencies, integrators and companies discovered from public sources.</p></header>
    <CompaniesClient />
  </>;
}
