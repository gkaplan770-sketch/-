import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { handleOwnerCommand } from "@/lib/bot-engine";

const commandSchema = z.object({
  command: z.string(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = commandSchema.parse(await request.json());
  const reply = await handleOwnerCommand(payload.command);
  return NextResponse.json({ reply });
}
