import { NextResponse } from "next/server";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { createWeeklyReport } from "@/lib/data-store";

export async function POST() {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const report = await createWeeklyReport();
  return NextResponse.json({ report });
}
