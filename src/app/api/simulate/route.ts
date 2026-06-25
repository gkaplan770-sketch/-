import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { simulateIncomingMessage } from "@/lib/bot-engine";

const simulateSchema = z.object({
  from: z.string().optional(),
  text: z.string().min(1),
  mediaType: z.enum(["text", "audio", "image", "document"]).optional(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = simulateSchema.parse(await request.json());
  const result = await simulateIncomingMessage(payload);
  return NextResponse.json({ result });
}
