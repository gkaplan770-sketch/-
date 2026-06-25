import { NextResponse } from "next/server";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { getContactManagementTimeline } from "@/lib/data-store";

export async function GET(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  if (!contactId) {
    return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
  }
  return NextResponse.json({
    timeline: await getContactManagementTimeline(contactId),
  });
}
