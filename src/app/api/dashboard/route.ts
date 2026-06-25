import { NextResponse } from "next/server";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { getDashboardData } from "@/lib/data-store";

export async function GET() {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const dashboard = await getDashboardData();
  return NextResponse.json(dashboard);
}
