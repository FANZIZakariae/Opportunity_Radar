import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { activeResearchRun, createResearchRun, listResearchRuns } from "@/lib/db";
import { kickResearchRun } from "@/lib/engine";
import { SERVICE_CATALOG } from "@/lib/service-catalog";

export const dynamic = "force-dynamic";
const schema = z.object({
  query: z.string().max(1000).default(""),
  countries: z.array(z.string().min(2).max(80)).min(1).max(12),
  services: z.array(z.string()).max(8),
  manualUrls: z.array(z.string()).max(100).default([]),
  targetOpportunities: z.number().int().min(1).max(200).optional(),
  maxOrganizations: z.number().int().min(1).max(200).optional(),
});

export function GET() {
  return NextResponse.json({ runs: listResearchRuns(), activeRun: activeResearchRun() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const active = activeResearchRun();
    if (active) throw new Error(`A research run is already ${active.status}. Pause, stop or finish it before starting another.`);
    const body = schema.parse(await request.json());
    const allowed = new Set(SERVICE_CATALOG.map((service) => service.id));
    const services = body.services.filter((service) => allowed.has(service));
    const run = createResearchRun({
      ...body,
      targetOpportunities: body.targetOpportunities ?? body.maxOrganizations ?? 30,
      services: services.length ? services : [...allowed],
    });
    kickResearchRun(run.id);
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start research." }, { status: 400 });
  }
}
