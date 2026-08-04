import { NextRequest, NextResponse } from "next/server";
import { listOpportunities } from "@/lib/db";

export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  return NextResponse.json({
    opportunities: listOpportunities({
      status: search.get("status") || undefined,
      service: search.get("service") || undefined,
      country: search.get("country") || undefined,
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}
