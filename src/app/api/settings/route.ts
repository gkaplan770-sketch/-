import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { updateBotSettings } from "@/lib/data-store";

const ownerCommandRouteSchema = z.object({
  id: z.string(),
  label: z.string(),
  destination: z.string(),
  triggers: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

const settingsSchema = z.object({
  id: z.string().default("main"),
  isEnabled: z.boolean(),
  automationLevel: z.enum(["drafts", "auto_with_review", "full_auto"]),
  dailyContactLimit: z.number().int().min(1).max(10),
  maxYouthsPerMessage: z.number().int().min(1).max(10),
  noResponseFollowupDays: z.number().int().min(1).max(60),
  staleYouthDays: z.number().int().min(1).max(365),
  sendWindowStart: z.string(),
  sendWindowEnd: z.string(),
  sendIntervalMinutes: z.number().int().min(30).max(240),
  dailyCronTime: z.string(),
  projectName: z.string(),
  managerDisplayName: z.string(),
  followupQuestionGuide: z.string(),
  ownerWhatsapp: z.string(),
  tone: z.string(),
  quietHoursStart: z.string(),
  quietHoursEnd: z.string(),
  ownerCommandRoutes: z.array(ownerCommandRouteSchema).default([]),
  updatedAt: z.string().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = settingsSchema.parse(await request.json());
  const settings = await updateBotSettings({
    ...payload,
    updatedAt: payload.updatedAt || new Date().toISOString(),
  });
  return NextResponse.json({ settings });
}
