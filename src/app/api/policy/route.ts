import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { updateBotPolicy } from "@/lib/data-store";

const policySchema = z.object({
  id: z.string().default("main"),
  allowedTopics: z.array(z.string()),
  forbiddenTopics: z.array(z.string()),
  escalationTriggers: z.array(z.string()),
  blockedDates: z.array(z.string()),
  avoidShabbat: z.boolean(),
  avoidJewishHolidays: z.boolean(),
  botIdentity: z.string(),
  allowedAnswerStyle: z.string(),
  unrelatedHoldingReply: z.string(),
  forbiddenHoldingReply: z.string(),
  ownerAlertTemplate: z.string(),
  requireReviewForAllReplies: z.boolean(),
  notifyOwnerOnEscalation: z.boolean(),
  sendHoldingReplyOnEscalation: z.boolean(),
  maxAutoReplyLength: z.number().int().min(80).max(1000),
  updatedAt: z.string().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = policySchema.parse(await request.json());
  const policy = await updateBotPolicy({
    ...payload,
    updatedAt: payload.updatedAt || new Date().toISOString(),
  });
  return NextResponse.json({ policy });
}
