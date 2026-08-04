import { NextResponse } from "next/server";
import { SERVICE_CATALOG } from "@/lib/service-catalog";

export function GET() {
  return NextResponse.json({ services: SERVICE_CATALOG });
}
