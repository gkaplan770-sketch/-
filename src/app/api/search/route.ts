import { NextResponse } from "next/server";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { searchDashboard } from "@/lib/data-store";

export async function GET(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  return NextResponse.json({ results: await searchDashboard(q) });
}
