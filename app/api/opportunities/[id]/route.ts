import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateOpportunity } from "@/lib/db";

const schema = z.object({
  status: z.enum(["new", "reviewed", "contacted", "replied", "discovery_call", "pilot", "proposal", "won", "lost", "snoozed", "eliminated"]),
  note: z.string().max(2000).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    updateOpportunity(id, body.status, body.note || "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update opportunity." }, { status: 400 });
  }
}
