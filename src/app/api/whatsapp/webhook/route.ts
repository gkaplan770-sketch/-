import { NextResponse } from "next/server";
import { requireRealSystemReady } from "@/lib/api-guard";
import {
  enrichWhatsappMessage,
  handleIncomingWhatsapp,
  handleOwnerCommand,
} from "@/lib/bot-engine";
import { normalizeWhatsappPayload, sendWhatsappMessage } from "@/lib/gnapi";
import { getDashboardData } from "@/lib/data-store";

export async function POST(request: Request) {
  const setupGuard = requireRealSystemReady();
  if (setupGuard) {
    return setupGuard;
  }

  const webhookSecret = process.env.GNAPI_WEBHOOK_SECRET;
  if (
    webhookSecret &&
    request.headers.get("x-webhook-token") !== webhookSecret &&
    request.headers.get("x-gnapi-secret") !== webhookSecret
  ) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const payload = await request.json();
  const normalized = normalizeWhatsappPayload(payload);
  const dashboard = await getDashboardData();
  const ownerPhone = dashboard.settings.ownerWhatsapp.replace(
    /[^\d+]/g,
    "",
  );
  const incomingPhone = normalized.from.replace(/[^\d+]/g, "");

  if (ownerPhone && incomingPhone === ownerPhone) {
    const ownerMessage = await enrichWhatsappMessage(normalized).catch(
      () => normalized,
    );

    if (!ownerMessage.text && ownerMessage.mediaType === "audio") {
      const reply =
        "קיבלתי הקלטה, אבל עדיין לא הגיע תמלול מ-GNAPI. ברגע שנחבר תמלול מדיה מלא אוכל לבצע גם פקודות קוליות.";
      await sendWhatsappMessage({
        to: ownerMessage.from,
        text: reply,
      });
      return NextResponse.json({ handledAs: "owner_voice_pending", reply });
    }

    const reply = await handleOwnerCommand(ownerMessage.text);
    await sendWhatsappMessage({
      to: ownerMessage.from,
      text: reply,
    });
    return NextResponse.json({ handledAs: "owner_command", reply });
  }

  const result = await handleIncomingWhatsapp(normalized);
  return NextResponse.json({
    handledAs: "contact_message",
    contactId: result.contact?.id || null,
    analysis: result.analysis,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get("hub.challenge") || searchParams.get("challenge");
  const verifyToken = searchParams.get("hub.verify_token") || searchParams.get("token");

  if (
    process.env.WHATSAPP_VERIFY_TOKEN &&
    verifyToken !== process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse("Invalid verify token", { status: 403 });
  }

  return new NextResponse(challenge || "ok");
}
