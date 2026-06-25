import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { approveAndSendReview } from "@/lib/bot-engine";
import { updateReviewItem } from "@/lib/data-store";

const reviewActionSchema = z.object({
  id: z.string(),
  action: z.enum(["approve", "reject", "send", "edit"]),
  draftMessage: z.string().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = reviewActionSchema.parse(await request.json());

  if (payload.action === "send" || payload.action === "approve") {
    const review = await approveAndSendReview(payload.id);
    return NextResponse.json({ review });
  }

  if (payload.action === "reject") {
    const review = await updateReviewItem(payload.id, "rejected");
    return NextResponse.json({ review });
  }

  const review = await updateReviewItem(
    payload.id,
    "pending",
    payload.draftMessage,
  );
  return NextResponse.json({ review });
}
