import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api-guard";
import { runDailyAutomation } from "@/lib/bot-engine";

async function run(request: Request) {
  const guard = requireCronSecret(request);
  if (guard) {
    return guard;
  }

  return NextResponse.json(await runDailyAutomation());
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
