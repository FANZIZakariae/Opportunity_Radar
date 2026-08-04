import { NextResponse } from "next/server";
import { dashboardSnapshot } from "@/lib/db";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json(dashboardSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
