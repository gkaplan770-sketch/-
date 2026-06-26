import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api-guard";
import { dispatchScheduledOutbound } from "@/lib/bot-engine";

async function run(request: Request) {
  const guard = requireCronSecret(request);
  if (guard) {
    return guard;
  }

  const dispatch = await dispatchScheduledOutbound();
  return NextResponse.json({ dispatch });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
