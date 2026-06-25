import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api-guard";
import { createDailyReviewQueue, sendOwnerReportToWhatsapp } from "@/lib/bot-engine";

export async function POST(request: Request) {
  const guard = requireCronSecret(request);
  if (guard) {
    return guard;
  }

  const reviews = await createDailyReviewQueue();
  const report = await sendOwnerReportToWhatsapp();

  return NextResponse.json({
    createdReviews: reviews.length,
    report,
  });
}
