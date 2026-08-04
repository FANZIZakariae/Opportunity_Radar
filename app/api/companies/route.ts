import { NextResponse } from "next/server";
import { listActiveOpportunityCountries, listOrganizations } from "@/lib/db";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({
    organizations: listOrganizations(),
    countries: listActiveOpportunityCountries(),
  }, { headers: { "Cache-Control": "no-store" } });
}
