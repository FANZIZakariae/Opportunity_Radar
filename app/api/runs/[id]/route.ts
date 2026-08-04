import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getResearchRun, listRunEvents, listRunQueue, setRunControl } from "@/lib/db";
import { kickResearchRun, stopResearchWorker } from "@/lib/engine";

export const dynamic = "force-dynamic";
const schema = z.object({ action: z.enum(["pause", "resume", "stop"]) });

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = getResearchRun(id);
  if (!run) return NextResponse.json({ error: "Research run not found." }, { status: 404 });
  return NextResponse.json({ run, queue: listRunQueue(id), events: listRunEvents(id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    if (!getResearchRun(id)) return NextResponse.json({ error: "Research run not found." }, { status: 404 });
    if (body.action === "resume") {
      const run = setRunControl(id, "running");
      kickResearchRun(id);
      return NextResponse.json({ run });
    }
    const run = setRunControl(id, body.action === "pause" ? "paused" : "stopped");
    stopResearchWorker(id);
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not control research." }, { status: 400 });
  }
}
