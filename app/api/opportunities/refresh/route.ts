import { NextResponse } from "next/server";
import { activeResearchRun, createOpportunityRefreshRun } from "@/lib/db";
import { kickResearchRun } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const active = activeResearchRun();
    if (active) throw new Error(`A research run is already ${active.status}. Finish, pause or stop it before refreshing existing cards.`);
    const run = createOpportunityRefreshRun();
    kickResearchRun(run.id);
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not refresh existing cards." }, { status: 400 });
  }
}