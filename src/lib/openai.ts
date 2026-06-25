import OpenAI, { toFile } from "openai";
import { assertOpenAIReady, isRealMode } from "@/lib/config";
import type {
  BotPolicy,
  InboundAnalysis,
  NormalizedWhatsappMessage,
} from "@/lib/types";

let cachedOpenAI: OpenAI | null = null;

function getOpenAI() {
  assertOpenAIReady();

  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return cachedOpenAI;
}

export async function analyzeWithOpenAI(
  message: NormalizedWhatsappMessage,
  policy?: BotPolicy,
): Promise<InboundAnalysis> {
  const client = getOpenAI();
  if (!client) {
    return mockAnalysis(message.text, policy);
  }

  const model = getTextModel();

  try {
    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "mendy_inbound_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "intent",
              "policyDecision",
              "summary",
              "detectedYouthNames",
              "milestones",
              "followUpNeeded",
              "suggestedReply",
              "suggestedOwnerReply",
              "escalationReason",
              "riskLabels",
              "confidence",
            ],
            properties: {
              intent: {
                type: "string",
                enum: [
                  "work_update",
                  "work_question",
                  "unrelated",
                  "personal",
                  "sensitive",
                  "unknown",
                ],
              },
              policyDecision: {
                type: "string",
                enum: ["answer", "review", "escalate", "block"],
              },
              summary: { type: "string" },
              detectedYouthNames: {
                type: "array",
                items: { type: "string" },
              },
              milestones: {
                type: "array",
                items: { type: "string" },
              },
              followUpNeeded: { type: "boolean" },
              suggestedReply: { type: "string" },
              suggestedOwnerReply: { type: "string" },
              escalationReason: { type: "string" },
              riskLabels: {
                type: "array",
                items: { type: "string" },
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },
      input: [
        {
          role: "system",
          content: [
            "You analyze work-only WhatsApp updates for a warm Chasidic outreach CRM.",
            "Classify whether the message is allowed, needs review, should be escalated to the human owner, or must be blocked.",
            "Never suggest that the bot should answer unrelated, personal, medical, legal, financial, political, or sensitive questions directly.",
            "When you suggest a reply to a contact, write it in Mendy's natural first-person WhatsApp voice: warm, short, human, Chasidic, and conversational.",
            "Do not mention AI, bot, automation, CRM, dashboard, policy, system, assistant, or that a message was generated.",
            "Do not falsely claim a human is manually typing right now, and do not answer questions about whether this is automated.",
            "If the contact asks who is writing, whether this is a bot, whether this is AI, or anything about automation/identity, set policyDecision to escalate, leave suggestedReply empty, and explain that Mendy should answer personally.",
            "Return only valid JSON matching the schema.",
            policy
              ? `Policy:\n${JSON.stringify(policy, null, 2)}`
              : "No explicit policy was provided; use a conservative work-only policy.",
          ].join("\n\n"),
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Incoming WhatsApp update:\n${message.text || "(no text)"}`,
            },
          ],
        },
      ],
    } as never);

    return normalizeAnalysis(JSON.parse(response.output_text));
  } catch (error) {
    if (isRealMode()) {
      throw new Error(`OpenAI analysis failed: ${errorMessage(error)}`);
    }

    return mockAnalysis(message.text, policy);
  }
}

export async function transcribeAudioUrl(mediaUrl: string) {
  const client = getOpenAI();
  if (!client) {
    return "";
  }

  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Could not download audio: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "audio/ogg";
  const file = await toFile(
    new Uint8Array(await response.arrayBuffer()),
    `whatsapp-audio.${extensionFromContentType(contentType)}`,
    { type: contentType },
  );
  const transcription = await client.audio.transcriptions.create({
    file,
    model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe",
    language: process.env.OPENAI_TRANSCRIBE_LANGUAGE || "he",
    prompt:
      "תמלל הודעות וואטסאפ בענייני שליחות, נערים, ברית, תפילין, שבת ושיעורי תורה. שמור שמות כפי שנאמרו.",
    response_format: "json",
  });

  return transcription.text.trim();
}

export async function describeImageUrl(mediaUrl: string, caption = "") {
  const client = getOpenAI();
  if (!client) {
    return caption;
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_VISION_MODEL || getTextModel(),
      reasoning: { effort: "low" },
      max_output_tokens: 260,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "תאר בקצרה את התמונה שהתקבלה בוואטסאפ עבור מערכת מעקב שליחות.",
                "חלץ רק מידע ענייני שיכול לעזור להבין עדכון עבודה. אם אין מידע ברור, אמור זאת בקצרה.",
                caption ? `כיתוב שהגיע עם התמונה: ${caption}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              type: "input_image",
              image_url: mediaUrl,
              detail: "auto",
            },
          ],
        },
      ],
    } as never);

    return response.output_text.trim();
  } catch (error) {
    if (isRealMode()) {
      throw new Error(`OpenAI image analysis failed: ${errorMessage(error)}`);
    }

    return caption;
  }
}

function mockAnalysis(text: string, policy?: BotPolicy): InboundAnalysis {
  const milestones: string[] = [];
  if (text.includes("ברית")) {
    milestones.push("ברית");
  }
  if (text.includes("תפילין")) {
    milestones.push("תפילין");
  }
  if (text.includes("שבת")) {
    milestones.push("שבת");
  }
  if (text.includes("שיעור")) {
    milestones.push("שיעור");
  }

  const forbidden = Boolean(
    policy?.forbiddenTopics.some((topic) => text.includes(topic)),
  );
  const identityQuestion = [
    "אתה בוט",
    "זה בוט",
    "רובוט",
    "אוטומטי",
    "מענה אוטומטי",
    "בינה מלאכותית",
    "מי כותב",
  ].some((term) => text.includes(term));
  const unrelatedQuestion =
    identityQuestion ||
    text.includes("?") ||
    text.includes("אפשר לשאול") ||
    text.includes("לא קשור") ||
    text.includes("אישי");
  const intent = forbidden
    ? "sensitive"
    : milestones.length > 0
      ? "work_update"
      : unrelatedQuestion
        ? "unrelated"
        : "unknown";
  const policyDecision =
    intent === "sensitive"
      ? "block"
      : intent === "unrelated" || intent === "unknown"
        ? "escalate"
        : "review";

  return {
    intent,
    policyDecision,
    summary: text
      ? `זוהה עדכון: ${text.slice(0, 120)}`
      : "התקבלה הודעה ללא טקסט.",
    detectedYouthNames: [],
    milestones,
    followUpNeeded: milestones.length === 0,
    suggestedReply:
      policyDecision === "escalate" || policyDecision === "block"
        ? ""
        : "תודה רבה על העדכון, משמח לשמוע. אם יש עוד פרט קטן על ההתקדמות שלו אשמח לדעת כדי שנוכל להמשיך לעקוב כמו שצריך.",
    suggestedOwnerReply:
      "שלום וברכה, ראיתי את ההודעה. אענה לך אישית בעזרת השם.",
    escalationReason:
      policyDecision === "review"
        ? ""
        : "ההודעה אינה בתחום העבודה המותר לבוט או דורשת שיקול דעת אישי.",
    riskLabels:
      policyDecision === "block"
        ? ["forbidden_topic"]
        : policyDecision === "escalate"
          ? ["needs_owner"]
          : [],
    confidence: process.env.OPENAI_API_KEY ? 0.5 : 0.35,
  };
}

function normalizeAnalysis(value: unknown): InboundAnalysis {
  const analysis = value as Partial<InboundAnalysis>;
  return {
    intent: analysis.intent || "unknown",
    policyDecision: analysis.policyDecision || "review",
    summary: analysis.summary || "התקבלה הודעה וצריך לבדוק אותה.",
    detectedYouthNames: Array.isArray(analysis.detectedYouthNames)
      ? analysis.detectedYouthNames
      : [],
    milestones: Array.isArray(analysis.milestones) ? analysis.milestones : [],
    followUpNeeded: Boolean(analysis.followUpNeeded),
    suggestedReply: analysis.suggestedReply || "",
    suggestedOwnerReply:
      analysis.suggestedOwnerReply ||
      "שלום וברכה, ראיתי את ההודעה. אענה לך אישית בעזרת השם.",
    escalationReason: analysis.escalationReason || "",
    riskLabels: Array.isArray(analysis.riskLabels) ? analysis.riskLabels : [],
    confidence:
      typeof analysis.confidence === "number" ? analysis.confidence : 0.4,
  };
}

function getTextModel() {
  return process.env.OPENAI_MODEL || "gpt-5.5";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown OpenAI error";
}

function extensionFromContentType(contentType: string) {
  const lower = contentType.toLowerCase();
  if (lower.includes("mpeg") || lower.includes("mp3")) {
    return "mp3";
  }
  if (lower.includes("mp4") || lower.includes("m4a")) {
    return "m4a";
  }
  if (lower.includes("wav")) {
    return "wav";
  }
  if (lower.includes("webm")) {
    return "webm";
  }
  if (lower.includes("ogg") || lower.includes("opus")) {
    return "ogg";
  }
  return "ogg";
}
