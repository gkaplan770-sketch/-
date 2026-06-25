import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { updateOwnerAlertStatus } from "@/lib/data-store";

const alertActionSchema = z.object({
  id: z.string(),
  status: z.enum(["open", "handled", "dismissed"]),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = alertActionSchema.parse(await request.json());
  const alert = await updateOwnerAlertStatus(payload.id, payload.status);
  return NextResponse.json({ alert });
}
