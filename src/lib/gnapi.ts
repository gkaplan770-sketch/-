import type { NormalizedWhatsappMessage } from "@/lib/types";
import { assertGnapiReady } from "@/lib/config";

export function hasGnapiConfig() {
  return Boolean(process.env.GNAPI_SEND_URL && process.env.GNAPI_API_KEY);
}

export async function sendWhatsappMessage(input: {
  to: string;
  text: string;
}) {
  if (!hasGnapiConfig()) {
    assertGnapiReady();

    return {
      ok: true,
      mocked: true,
      providerMessageId: `mock-${Date.now()}`,
    };
  }

  await simulateTypingBeforeSend(input);

  const response = await fetch(process.env.GNAPI_SEND_URL || "", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GNAPI_API_KEY}`,
      "x-api-key": process.env.GNAPI_API_KEY || "",
    },
    body: JSON.stringify({
      to: input.to,
      phone: input.to,
      recipient: input.to,
      text: input.text,
      message: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GNAPI send failed: ${response.status} ${body}`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    messageId?: string;
  };

  return {
    ok: true,
    mocked: false,
    providerMessageId: payload.id || payload.messageId || null,
  };
}

async function simulateTypingBeforeSend(input: { to: string; text: string }) {
  if (process.env.GNAPI_TYPING_ENABLED === "false") {
    return;
  }

  const durationMs = calculateTypingDurationMs(input.text);
  const typingUrl = process.env.GNAPI_TYPING_URL;

  if (typingUrl) {
    await fetch(typingUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GNAPI_API_KEY}`,
        "x-api-key": process.env.GNAPI_API_KEY || "",
      },
      body: JSON.stringify({
        to: input.to,
        phone: input.to,
        recipient: input.to,
        chatId: input.to,
        action: "typing",
        state: "composing",
        status: "typing",
        durationMs,
        durationSeconds: Math.max(1, Math.ceil(durationMs / 1000)),
      }),
    }).catch(() => null);
  }

  await sleep(durationMs);
}

function calculateTypingDurationMs(text: string) {
  const minMs = numberEnv("GNAPI_TYPING_MIN_MS", 1200);
  const maxMs = numberEnv("GNAPI_TYPING_MAX_MS", 9000);
  const msPerChar = numberEnv("GNAPI_TYPING_MS_PER_CHAR", 35);
  const length = Array.from(text.replace(/\s+/g, " ").trim()).length;
  return Math.min(maxMs, Math.max(minMs, minMs + length * msPerChar));
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeWhatsappPayload(
  payload: unknown,
): NormalizedWhatsappMessage {
  const data = payload as Record<string, unknown>;
  const message = firstRecord(
    data.message,
    data.messages,
    data.data,
    data.body,
    data.notification,
  );

  const from =
    stringValue(data.from) ||
    stringValue(data.sender) ||
    stringValue(data.phone) ||
    stringValue(message?.from) ||
    stringValue(message?.sender) ||
    stringValue(message?.chatId) ||
    "";

  const text =
    stringValue(data.text) ||
    stringValue(data.transcription) ||
    stringValue(data.speechText) ||
    stringValue(data.transcript) ||
    stringValue(data.message) ||
    stringValue(data.content) ||
    stringValue(message?.text) ||
    stringValue(message?.transcription) ||
    stringValue(message?.speechText) ||
    stringValue(message?.transcript) ||
    stringValue(message?.body) ||
    stringValue(message?.caption) ||
    stringValue(message?.message) ||
    "";

  const mediaUrl =
    stringValue(data.mediaUrl) ||
    stringValue(data.url) ||
    stringValue(message?.mediaUrl) ||
    stringValue(message?.url) ||
    stringValue(message?.downloadUrl);

  const rawType =
    stringValue(data.mediaType) ||
    stringValue(data.type) ||
    stringValue(message?.mediaType) ||
    stringValue(message?.type) ||
    "text";

  return {
    from,
    text,
    mediaUrl,
    mediaType: normalizeMediaType(rawType),
    raw: payload,
  };
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
      return value[0] as Record<string, unknown>;
    }
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
  }

  return null;
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function normalizeMediaType(value: string): NormalizedWhatsappMessage["mediaType"] {
  const lower = value.toLowerCase();
  if (lower.includes("audio") || lower.includes("voice")) {
    return "audio";
  }
  if (lower.includes("image") || lower.includes("photo")) {
    return "image";
  }
  if (lower.includes("document") || lower.includes("file")) {
    return "document";
  }
  return "text";
}
