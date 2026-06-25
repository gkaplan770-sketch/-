import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { setBotEnabled } from "@/lib/data-store";

const statusSchema = z.object({
  isEnabled: z.boolean(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = statusSchema.parse(await request.json());
  const settings = await setBotEnabled(payload.isEnabled);
  return NextResponse.json({ settings });
}
