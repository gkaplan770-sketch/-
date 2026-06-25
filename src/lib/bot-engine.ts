import {
  addInboundMessage,
  addOutboundMessage,
  addOwnerReport,
  addSystemMessage,
  createWeeklyReport,
  createOwnerAlert,
  createReviewItem,
  getDashboardData,
  markContactContacted,
  setBotEnabled,
  updateReviewItem,
  upsertYouth,
} from "@/lib/data-store";
import { canContactNow } from "@/lib/calendar";
import { sendWhatsappMessage } from "@/lib/gnapi";
import {
  analyzeWithOpenAI,
  describeImageUrl,
  transcribeAudioUrl,
} from "@/lib/openai";
import type {
  BotPolicy,
  BotSettings,
  Contact,
  DashboardData,
  InboundAnalysis,
  NormalizedWhatsappMessage,
  OwnerAlert,
  PolicyDecision,
  ReviewItem,
  Youth,
} from "@/lib/types";

type PolicyGate = {
  decision: PolicyDecision;
  reason: string;
  urgency: "normal" | "high";
  suppressHoldingReply?: boolean;
};

const identityEscalationTerms = [
  "אתה בוט",
  "זה בוט",
  "בוט?",
  "רובוט",
  "אוטומטי",
  "מענה אוטומטי",
  "זה ai",
  "זה AI",
  "בינה מלאכותית",
  "מי כותב",
  "מי זה",
  "אתה מנדי",
  "זה מנדי",
];

export function composeFollowUpMessage(
  contact: Contact,
  youths: Youth[],
  policy?: BotPolicy,
) {
  const names = youths.map((youth) => youth.name).join(" / ");
  const focus = names ? `בפרט על ${names}` : "על הנערים שאצלכם";
  const nextActions = youths
    .map((youth) => youth.nextAction)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  const message = [
    `שלום וברכה ${contact.name}, מה שלומכם?`,
    `רציתי לשאול בעדינות אם יש עדכון טוב ${focus}.`,
    "האם היה משהו חדש בענייני יהדות, תפילין, שבת, שיעור, ברית או קשר נוסף?",
    nextActions ? `אם מתאים, אשמח לשמוע גם: ${nextActions}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return trimToPolicy(message, policy);
}

export async function createDailyReviewQueue() {
  const dashboard = await getDashboardData();

  if (!dashboard.settings.isEnabled) {
    await addSystemMessage("התזמון היומי דילג כי מנדי בוטי כבוי.");
    return [];
  }

  const dueContacts = getDueContactsFromDashboard(
    dashboard,
    dashboard.settings.dailyContactLimit,
  );
  const created: ReviewItem[] = [];

  for (const contact of dueContacts) {
    const youths = getContactYouthFromDashboard(dashboard, contact.id);
    const schedule = canContactNow(contact, dashboard.settings, dashboard.policy);
    if (!schedule.allowed) {
      await addSystemMessage(
        `דילגתי על ${contact.name}: ${schedule.reason} שעה מקומית ${schedule.localTime}.`,
      );
      continue;
    }
    const alreadyPending = dashboard.reviews.some(
      (review) =>
        review.contactId === contact.id && review.status === "pending",
    );

    if (alreadyPending) {
      continue;
    }

    const review = await createReviewItem({
      type: "outbound_message",
      contactId: contact.id,
      contactName: contact.name,
      youthId: youths[0]?.id || null,
      youthName: youths[0]?.name || null,
      priority: contact.status === "needs_attention" ? "high" : "normal",
      draftMessage: composeFollowUpMessage(contact, youths, dashboard.policy),
      aiReason: `האיש קשר הגיע לתור החודשי. סגנון אישי: ${contact.preferredTone}. זמן מקומי: ${schedule.localTime}.`,
      scheduledFor: new Date().toISOString(),
    });
    created.push(review);
  }

  await addSystemMessage(`נוצרו ${created.length} פריטי ביקורת בתור היומי.`);
  return created;
}

export async function approveAndSendReview(id: string) {
  const dashboard = await getDashboardData();
  const review = dashboard.reviews.find((item) => item.id === id);

  if (!review || !review.contactId) {
    throw new Error("Review item cannot be sent");
  }

  const contact = dashboard.contacts.find((item) => item.id === review.contactId);
  if (!contact) {
    throw new Error("Contact not found");
  }

  const schedule = canContactNow(contact, dashboard.settings, dashboard.policy);
  if (!schedule.allowed) {
    throw new Error(`Message blocked by schedule policy: ${schedule.reason}`);
  }

  const sent = await sendWhatsappMessage({
    to: contact.phone,
    text: review.draftMessage,
  });
  await addOutboundMessage({
    contactId: contact.id,
    body: review.draftMessage,
    providerMessageId: sent.providerMessageId,
  });

  review.status = "sent";

  await updateReviewItem(id, "sent", review.draftMessage);
  await markContactContacted(contact.id);
  await addSystemMessage(`נשלחה הודעה אל ${contact.name}.`);

  return review;
}

export async function handleIncomingWhatsapp(message: NormalizedWhatsappMessage) {
  const dashboard = await getDashboardData();
  const policy = dashboard.policy;
  const contact = findContactByPhoneFromDashboard(dashboard, message.from);
  let analyzedMessage = message;
  let mediaFailureReason = "";

  try {
    analyzedMessage = await enrichWhatsappMessage(message);
  } catch (error) {
    mediaFailureReason = `פענוח המדיה נכשל: ${errorMessage(error)}`;
  }

  const analysis = mediaFailureReason
    ? mediaFailureAnalysis(analyzedMessage, mediaFailureReason)
    : await analyzeWithOpenAI(analyzedMessage, policy);
  const gate = evaluatePolicy(analyzedMessage, analysis, policy);

  await addInboundMessage({
    contactId: contact?.id || null,
    body:
      analyzedMessage.text ||
      `[${analyzedMessage.mediaType}] ${analyzedMessage.mediaUrl || ""}`,
    mediaType: analyzedMessage.mediaType,
    mediaUrl: analyzedMessage.mediaUrl,
    rawPayload: analyzedMessage.raw,
    aiSummary: `${analysis.summary} | החלטה: ${gate.decision}`,
  });

  if (!contact) {
    const alert = await escalateToOwner({
      settings: dashboard.settings,
      contact: null,
      message: analyzedMessage,
      analysis,
      policy,
      reason: "התקבלה הודעה ממספר שאינו מזוהה במערכת.",
      urgency: "high",
    });
    return { contact, analysis, decision: "escalate", alert };
  }

  if (gate.decision === "block" || gate.decision === "escalate") {
    const alert = await escalateToOwner({
      settings: dashboard.settings,
      contact,
      message: analyzedMessage,
      analysis,
      policy,
      reason: gate.reason,
      urgency: gate.urgency,
    });

    if (policy.sendHoldingReplyOnEscalation && !gate.suppressHoldingReply) {
      const holdingReply =
        gate.decision === "block"
          ? policy.forbiddenHoldingReply
          : policy.unrelatedHoldingReply;
      await queueOrSendReply({
        settings: dashboard.settings,
        policy,
        contact,
        body: holdingReply,
        reason: `תגובה שמורה לאחר הסלמה למנהל: ${gate.reason}`,
        priority: "high",
      });
    }

    return { contact, analysis, decision: gate.decision, alert };
  }

  await applyDetectedProgress(contact, analysis, dashboard);

  if (analysis.suggestedReply) {
    await queueOrSendReply({
      settings: dashboard.settings,
      policy,
      contact,
      body: trimToPolicy(analysis.suggestedReply, policy),
      reason: `תגובה מוצעת לפי הודעה נכנסת. ביטחון: ${Math.round(
        analysis.confidence * 100,
      )}%. החלטת מדיניות: ${gate.decision}.`,
      priority: analysis.followUpNeeded ? "high" : "normal",
      youthName: analysis.detectedYouthNames[0] || null,
    });
  }

  return {
    contact,
    analysis,
    decision: gate.decision,
    alert: null,
  };
}

export async function enrichWhatsappMessage(
  message: NormalizedWhatsappMessage,
): Promise<NormalizedWhatsappMessage> {
  if (message.mediaType === "audio" && message.mediaUrl && !message.text.trim()) {
    const transcription = await transcribeAudioUrl(message.mediaUrl);
    return {
      ...message,
      text: transcription,
      raw: { original: message.raw, openaiTranscription: transcription },
    };
  }

  if (message.mediaType === "image" && message.mediaUrl) {
    const description = await describeImageUrl(message.mediaUrl, message.text);
    const text = [message.text, description ? `תיאור תמונה: ${description}` : ""]
      .filter(Boolean)
      .join("\n\n");
    return {
      ...message,
      text,
      raw: { original: message.raw, openaiImageDescription: description },
    };
  }

  return message;
}

export async function simulateIncomingMessage(input: {
  from?: string;
  text: string;
  mediaType?: NormalizedWhatsappMessage["mediaType"];
}) {
  const dashboard = await getDashboardData();
  const message: NormalizedWhatsappMessage = {
    from: input.from || dashboard.contacts[0]?.phone || "",
    text: input.text,
    mediaType: input.mediaType || "text",
    raw: input,
  };
  const contact = findContactByPhoneFromDashboard(dashboard, message.from) || null;
  const analysis = await analyzeWithOpenAI(message, dashboard.policy);
  const gate = evaluatePolicy(message, analysis, dashboard.policy);
  const suggestedDraft =
    gate.suppressHoldingReply
      ? ""
      : gate.decision === "block"
      ? dashboard.policy.forbiddenHoldingReply
      : gate.decision === "escalate"
        ? dashboard.policy.unrelatedHoldingReply
        : trimToPolicy(analysis.suggestedReply, dashboard.policy);

  return {
    message,
    contact,
    analysis,
    decision: gate.decision,
    reason: gate.reason,
    wouldCreateAlert: gate.decision === "block" || gate.decision === "escalate",
    wouldCreateReview:
      Boolean(suggestedDraft) &&
      (dashboard.policy.requireReviewForAllReplies || gate.decision !== "answer"),
    suggestedDraft,
  };
}

export async function handleOwnerCommand(command: string) {
  const dashboard = await getDashboardData();
  const normalized = command.trim();

  if (!normalized) {
    return "כתוב לי פקודה קצרה, למשל: הפעל, עצור, סיכום, התראות, מדיניות, כמה בריתות, או כמה תפילין.";
  }

  if (includesAny(normalized, ["עצור", "הפסק", "כבה"])) {
    await setBotEnabled(false);
    return "מנדי בוטי נעצר. לא אשלח הודעות חדשות עד שתפעיל אותי שוב.";
  }

  if (includesAny(normalized, ["הפעל", "תדליק", "הדלק"])) {
    await setBotEnabled(true);
    return "מנדי בוטי הופעל. אמשיך לעבוד לפי התור היומי והביקורות.";
  }

  if (normalized.includes("כמה") && normalized.includes("ברית")) {
    const count = dashboard.youths.filter((youth) =>
      youth.milestones.some((milestone) => milestone.includes("ברית")),
    ).length;
    return `כרגע רשומים ${count} נערים עם עדכון ברית במערכת.`;
  }

  if (normalized.includes("כמה") && normalized.includes("תפילין")) {
    const count = dashboard.youths.filter((youth) =>
      youth.milestones.some((milestone) => milestone.includes("תפילין")),
    ).length;
    return `כרגע רשומים ${count} נערים עם התקדמות בתפילין.`;
  }

  if (includesAny(normalized, ["התראות", "מענה אישי", "אישי"])) {
    const openAlerts = dashboard.alerts.filter((alert) => alert.status === "open");
    const latest = openAlerts[0];
    if (!latest) {
      return "אין כרגע התראות פתוחות שמחכות למענה אישי.";
    }
    return `יש ${openAlerts.length} התראות פתוחות. האחרונה: ${latest.contactName} - ${latest.reason}`;
  }

  if (includesAny(normalized, ["מדיניות", "מה מותר", "מה אסור"])) {
    return [
      "מדיניות מנדי בוטי:",
      `מותר: ${dashboard.policy.allowedTopics.join(", ")}`,
      `אסור: ${dashboard.policy.forbiddenTopics.join(", ")}`,
      "כל שאלה לא קשורה או רגישה נשלחת אליך להתראה ומענה אישי.",
    ].join("\n");
  }

  if (includesAny(normalized, ["דוח שבועי", "סיכום שבועי"])) {
    const report = await createWeeklyReport();
    return report.body;
  }

  if (includesAny(normalized, ["סיכום", "דוח", "מה קורה"])) {
    const pending = dashboard.reviews.filter(
      (review) => review.status === "pending",
    ).length;
    const due = getDueContactsFromDashboard(dashboard, 99).length;
    const alerts = dashboard.alerts.filter((alert) => alert.status === "open").length;
    const body = `מנדי בוטי: ${dashboard.contacts.length} אנשי קשר, ${dashboard.youths.length} נערים במעקב, ${pending} פריטי ביקורת פתוחים, ${alerts} התראות מענה אישי, ${due} אנשי קשר הגיעו לתור.`;
    await addOwnerReport("סיכום לפי בקשת מנהל", body);
    return body;
  }

  if (includesAny(normalized, ["תור יומי", "שלח היום", "היום"])) {
    const created = await createDailyReviewQueue();
    return `פתחתי ${created.length} הודעות בתור ביקורת להיום.`;
  }

  const contact = dashboard.contacts.find((item) => normalized.includes(item.name));
  if (contact) {
    const youths = getContactYouthFromDashboard(dashboard, contact.id);
    return `${contact.name}: ${youths.length} נערים במעקב. עדכון אחרון: ${
      contact.lastContactedAt
        ? new Date(contact.lastContactedAt).toLocaleDateString("he-IL")
        : "אין"
    }. הפעולה הבאה: ${youths[0]?.nextAction || "לא הוגדרה"}`;
  }

  return "לא זיהיתי פקודה מדויקת. אפשר לכתוב: הפעל, עצור, סיכום, התראות, מדיניות, כמה בריתות, כמה תפילין, או שם איש קשר.";
}

export async function sendOwnerReportToWhatsapp() {
  const dashboard = await getDashboardData();
  const latestReport = dashboard.reports[0];
  const pending = dashboard.reviews.filter(
    (review) => review.status === "pending",
  ).length;
  const alerts = dashboard.alerts.filter((alert) => alert.status === "open").length;
  const body =
    latestReport?.body ||
    `יש ${pending} פריטי ביקורת פתוחים, ${alerts} התראות מענה אישי ו-${dashboard.youths.length} נערים במעקב.`;

  const ownerSchedule = canContactNow(
    ownerContact(dashboard.settings),
    dashboard.settings,
    dashboard.policy,
  );
  if (!ownerSchedule.allowed) {
    await addSystemMessage(
      `דוח מנהל לא נשלח בוואטסאפ כי ${ownerSchedule.reason}`,
    );
    return body;
  }

  await sendWhatsappMessage({
    to: dashboard.settings.ownerWhatsapp,
    text: body,
  });

  await addSystemMessage("נשלח עדכון מנהל לוואטסאפ.");
  return body;
}

function evaluatePolicy(
  message: NormalizedWhatsappMessage,
  analysis: InboundAnalysis,
  policy: BotPolicy,
): PolicyGate {
  const text = message.text || "";
  const identityHit = firstMatchingTerm(text, identityEscalationTerms);
  if (identityHit) {
    return {
      decision: "escalate",
      reason:
        "איש הקשר שאל על זהות הכותב או על אוטומציה. לא לשלוח תשובה אוטומטית; מנדי צריך לענות אישית.",
      urgency: "high",
      suppressHoldingReply: true,
    };
  }

  const forbiddenHit = firstMatchingTerm(text, policy.forbiddenTopics);
  if (forbiddenHit || analysis.policyDecision === "block") {
    return {
      decision: "block",
      reason:
        analysis.escalationReason ||
        `זוהה נושא אסור למדיניות הבוט: ${forbiddenHit || "נושא רגיש"}.`,
      urgency: "high",
    };
  }

  const escalationHit = firstMatchingTerm(text, policy.escalationTriggers);
  if (
    escalationHit ||
    analysis.policyDecision === "escalate" ||
    ["unrelated", "personal", "sensitive", "unknown"].includes(analysis.intent)
  ) {
    return {
      decision: "escalate",
      reason:
        analysis.escalationReason ||
        `ההודעה דורשת מענה אישי של מנדי: ${escalationHit || analysis.intent}.`,
      urgency:
        analysis.intent === "sensitive" || analysis.confidence < 0.45
          ? "high"
          : "normal",
    };
  }

  if (message.mediaType !== "text" && !text) {
    return {
      decision: "escalate",
      reason: "התקבלה מדיה ללא טקסט, נדרש אישור או פענוח לפני מענה.",
      urgency: "normal",
    };
  }

  if (analysis.confidence < 0.35) {
    return {
      decision: "escalate",
      reason: "רמת הביטחון של הניתוח נמוכה מדי למענה אוטומטי.",
      urgency: "normal",
    };
  }

  const allowedHit =
    firstMatchingTerm(text, policy.allowedTopics) ||
    analysis.milestones.length > 0 ||
    ["work_update", "work_question"].includes(analysis.intent);

  if (allowedHit) {
    return {
      decision: policy.requireReviewForAllReplies ? "review" : "answer",
      reason: "ההודעה בתחום המותר של הבוט.",
      urgency: "normal",
    };
  }

  return {
    decision: "escalate",
    reason: "לא נמצא קשר ברור לנושאי העבודה שמותרים לבוט.",
    urgency: "normal",
  };
}

async function escalateToOwner(input: {
  settings: BotSettings;
  contact: Contact | null;
  message: NormalizedWhatsappMessage;
  analysis: InboundAnalysis;
  policy: BotPolicy;
  reason: string;
  urgency: "normal" | "high";
}): Promise<OwnerAlert> {
  const contactName = input.contact?.name || "מספר לא מזוהה";
  const incomingText =
    input.message.text || `[${input.message.mediaType}] ${input.message.mediaUrl || ""}`;
  const alert = await createOwnerAlert({
    contactId: input.contact?.id || null,
    contactName,
    phone: input.contact?.phone || input.message.from,
    incomingText,
    reason: input.reason,
    urgency: input.urgency,
    suggestedOwnerReply: input.analysis.suggestedOwnerReply,
  });

  await addOwnerReport(
    "התראת מענה אישי",
    `${contactName}: ${input.reason}`,
  );

  if (input.policy.notifyOwnerOnEscalation && input.settings.ownerWhatsapp) {
    const ownerSchedule = canContactNow(
      ownerContact(input.settings),
      input.settings,
      input.policy,
    );
    if (ownerSchedule.allowed) {
      await sendWhatsappMessage({
        to: input.settings.ownerWhatsapp,
        text: renderOwnerAlert(input.policy.ownerAlertTemplate, {
          contactName,
          reason: input.reason,
          message: incomingText,
        }),
      });
    } else {
      await addSystemMessage(
        `לא נשלחה התראת מנהל בוואטסאפ כי ${ownerSchedule.reason}`,
      );
    }
  }

  await addSystemMessage(`נפתחה התראת מענה אישי עבור ${contactName}.`);
  return alert;
}

async function queueOrSendReply(input: {
  settings: BotSettings;
  policy: BotPolicy;
  contact: Contact;
  body: string;
  reason: string;
  priority: "normal" | "high";
  youthName?: string | null;
}) {
  const shouldSendDirectly =
    input.settings.automationLevel === "full_auto" &&
    !input.policy.requireReviewForAllReplies &&
    input.contact.allowAutoSend;

  if (!input.body.trim()) {
    return null;
  }

  const schedule = canContactNow(input.contact, input.settings, input.policy);

  if (shouldSendDirectly && schedule.allowed) {
    const sent = await sendWhatsappMessage({
      to: input.contact.phone,
      text: input.body,
    });
    await addOutboundMessage({
      contactId: input.contact.id,
      body: input.body,
      providerMessageId: sent.providerMessageId,
    });
    await addSystemMessage(`נשלחה תשובה אוטומטית אל ${input.contact.name}.`);
    return null;
  }

  return createReviewItem({
    type: "outbound_message",
    contactId: input.contact.id,
    contactName: input.contact.name,
    youthId: null,
    youthName: input.youthName || null,
    priority: input.priority,
    draftMessage: input.body,
    aiReason: schedule.allowed
      ? input.reason
      : `${input.reason} לא נשלח אוטומטית כי ${schedule.reason}`,
    scheduledFor: new Date().toISOString(),
  });
}

async function applyDetectedProgress(
  contact: Contact,
  analysis: InboundAnalysis,
  dashboard: DashboardData,
) {
  if (analysis.milestones.length === 0) {
    return;
  }

  const youths = getContactYouthFromDashboard(dashboard, contact.id);
  const youth =
    youths.find((item) =>
      analysis.detectedYouthNames.some((name) => item.name.includes(name)),
    ) || youths[0];

  if (!youth) {
    return;
  }

  const nextMilestones = new Set([
    ...youth.milestones,
    ...analysis.milestones,
  ]);
  youth.milestones = [...nextMilestones];
  youth.lastUpdateAt = new Date().toISOString();
  youth.nextAction = analysis.followUpNeeded
    ? "צריך לשאול שאלת המשך בעדינות."
    : "להמשיך מעקב בחודש הבא.";
  await upsertYouth(youth);
}

function renderOwnerAlert(
  template: string,
  values: { contactName: string; reason: string; message: string },
) {
  return template
    .replaceAll("{contactName}", values.contactName)
    .replaceAll("{reason}", values.reason)
    .replaceAll("{message}", values.message);
}

function trimToPolicy(message: string, policy?: BotPolicy) {
  const limit = policy?.maxAutoReplyLength || 420;
  if (message.length <= limit) {
    return message;
  }

  return `${message.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function firstMatchingTerm(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.find((term) => term && normalized.includes(term.toLowerCase()));
}

function includesAny(text: string, options: string[]) {
  return options.some((option) => text.includes(option));
}

function getContactYouthFromDashboard(dashboard: DashboardData, contactId: string) {
  return dashboard.youths.filter((youth) => youth.contactId === contactId);
}

function getDueContactsFromDashboard(dashboard: DashboardData, limit: number) {
  const now = new Date();
  return dashboard.contacts
    .filter(
      (contact) =>
        contact.status !== "paused" && new Date(contact.nextDueAt) <= now,
    )
    .sort((a, b) => {
      if (a.status === "needs_attention" && b.status !== "needs_attention") {
        return -1;
      }
      if (a.status !== "needs_attention" && b.status === "needs_attention") {
        return 1;
      }
      return a.nextDueAt.localeCompare(b.nextDueAt);
    })
    .slice(0, limit);
}

function findContactByPhoneFromDashboard(dashboard: DashboardData, phone: string) {
  const normalized = normalizePhone(phone);
  return dashboard.contacts.find(
    (contact) => normalizePhone(contact.phone) === normalized,
  );
}

function ownerContact(settings: BotSettings): Contact {
  return {
    id: "owner",
    name: "מנהל",
    phone: settings.ownerWhatsapp,
    country: "ישראל",
    timezone: "Asia/Jerusalem",
    language: "he",
    status: "active",
    preferredTone: settings.tone,
    responseStyle: "",
    bestContactTime: "",
    allowAutoSend: false,
    lastContactedAt: null,
    nextDueAt: new Date().toISOString(),
    notes: "",
    warmthScore: 100,
  };
}

function mediaFailureAnalysis(
  message: NormalizedWhatsappMessage,
  reason: string,
): InboundAnalysis {
  return {
    intent: "unknown",
    policyDecision: "escalate",
    summary: `${reason}. המדיה שהגיעה: ${message.mediaType}.`,
    detectedYouthNames: [],
    milestones: [],
    followUpNeeded: true,
    suggestedReply: "",
    suggestedOwnerReply:
      "שלום וברכה, ראיתי שהגיעה הודעת מדיה שלא הצלחתי לפענח אוטומטית. אענה באופן אישי בעזרת השם.",
    escalationReason: reason,
    riskLabels: ["media_processing_failed"],
    confidence: 0,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}
