import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { deleteContact, upsertContact } from "@/lib/data-store";

const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().min(3),
  country: z.string().optional(),
  timezone: z.string().optional(),
  language: z.enum(["he", "en", "yi", "fr", "es"]).optional(),
  status: z.enum(["active", "paused", "needs_attention"]).optional(),
  preferredTone: z.string().optional(),
  responseStyle: z.string().optional(),
  bestContactTime: z.string().optional(),
  allowAutoSend: z.boolean().optional(),
  nextDueAt: z.string().optional(),
  notes: z.string().optional(),
  warmthScore: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = contactSchema.parse(await request.json());
  const contact = await upsertContact(payload);
  return NextResponse.json({ contact });
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
  await deleteContact(id);
  return NextResponse.json({ ok: true });
}
