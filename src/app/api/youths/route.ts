import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { deleteYouth, upsertYouth } from "@/lib/data-store";

const youthSchema = z.object({
  id: z.string().optional(),
  contactId: z.string(),
  name: z.string().min(1),
  city: z.string().optional(),
  stage: z
    .enum(["new", "warming", "learning", "mitzvah", "needs_followup"])
    .optional(),
  milestones: z.array(z.string()).optional(),
  lastUpdateAt: z.string().nullable().optional(),
  nextAction: z.string().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = youthSchema.parse(await request.json());
  const youth = await upsertYouth(payload);
  return NextResponse.json({ youth });
}

export async function DELETE(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await deleteYouth(id);
  return NextResponse.json({ ok: true });
}
