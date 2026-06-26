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
  updateBotPolicy,
  updateBotSettings,
  updateOwnerAlertStatus,
  updateReviewItem,
  updateReviewSchedule,
  upsertContact,
  upsertYouth,
} from "@/lib/data-store";
import { canContactNow } from "@/lib/calendar";
import { sendWhatsappMessage } from "@/lib/gnapi";
import { mergeOwnerCommandRoutes } from "@/lib/owner-command-routes";
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
  settings: BotSettings,
  policy?: BotPolicy,
) {
  const selectedYouths = youths.slice(0, settings.maxYouthsPerMessage);
  const names = selectedYouths.map((youth) => youth.name).join(" / ");
  const focus = names ? `בפרט על ${names}` : "על הנערים שאצלכם";
  const nextActions = selectedYouths
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
    dashboard.settings,
  );
  const created: ReviewItem[] = [];

  for (const contact of dueContacts) {
    const youths = getContactYouthFromDashboard(dashboard, contact.id);
    const schedule = canContactNow(contact, dashboard.settings, dashboard.policy);
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
      draftMessage: composeFollowUpMessage(
        contact,
        youths,
        dashboard.settings,
        dashboard.policy,
      ),
      aiReason: `האיש קשר הגיע לתור החודשי. סגנון אישי: ${contact.preferredTone}. זמן מקומי: ${schedule.localTime}.`,
      scheduledFor: nextAutomatedSlot(new Date(), dashboard.settings, created.length).toISOString(),
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

  const sentReview = await sendReviewToContact(review, contact);
  await addSystemMessage(`נשלחה הודעה אל ${contact.name}.`);

  return sentReview;
}

export async function dispatchScheduledOutbound(now = new Date()) {
  const dashboard = await getDashboardData();
  const intervalMinutes = Math.max(30, dashboard.settings.sendIntervalMinutes);
  const dailyLimit = Math.max(1, dashboard.settings.dailyContactLimit);
  const dailySent = automatedOutboundCountToday(dashboard, now);

  if (!dashboard.settings.isEnabled) {
    return {
      sent: false,
      reason: "הבוט כבוי.",
      dailySent,
      dailyLimit,
    };
  }

  if (dashboard.settings.automationLevel !== "full_auto") {
    return {
      sent: false,
      reason: "השליחה האוטומטית ממתינה למצב אוטומטי מלא.",
      dailySent,
      dailyLimit,
    };
  }

  if (dailySent >= dailyLimit) {
    return {
      sent: false,
      reason: "המכסה היומית כבר נוצלה.",
      dailySent,
      dailyLimit,
    };
  }

  const lastOutbound = latestAutomatedOutbound(dashboard);
  if (lastOutbound) {
    const nextEligibleAt = new Date(
      new Date(lastOutbound.createdAt).getTime() + intervalMinutes * 60000,
    );
    if (nextEligibleAt > now) {
      return {
        sent: false,
        reason: "נשלחה הודעה לאחרונה, ממתין למרווח הבא.",
        nextEligibleAt: nextEligibleAt.toISOString(),
        dailySent,
        dailyLimit,
      };
    }
  }

  const dueReviews = dashboard.reviews
    .filter(
      (review) =>
        review.type === "outbound_message" &&
        review.contactId &&
        review.status === "pending" &&
        new Date(review.scheduledFor) <= now,
    )
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  for (const review of dueReviews) {
    const contact = dashboard.contacts.find((item) => item.id === review.contactId);
    if (!contact) {
      continue;
    }

    if (!contact.allowAutoSend) {
      await updateReviewSchedule(
        review.id,
        nextAutomatedSlot(now, dashboard.settings, 1).toISOString(),
      );
      continue;
    }

    const schedule = canContactNow(contact, dashboard.settings, dashboard.policy, now);
    if (!schedule.allowed) {
      await updateReviewSchedule(
        review.id,
        nextAutomatedSlot(now, dashboard.settings, 1).toISOString(),
      );
      continue;
    }

    const sentReview = await sendReviewToContact(review, contact);
    await addSystemMessage(
      `שליחה מתוזמנת נשלחה אל ${contact.name}. הודעה הבאה לא לפני ${intervalMinutes} דקות.`,
    );
    return {
      sent: true,
      reason: "נשלחה הודעה מתוזמנת אחת.",
      review: sentReview,
      dailySent: dailySent + 1,
      dailyLimit,
    };
  }

  return {
    sent: false,
    reason: "אין כרגע הודעה שמותר לשלוח בסלוט הזה.",
    dailySent,
    dailyLimit,
  };
}

export async function runDailyAutomation() {
  const reviews = await createDailyReviewQueue();
  const dispatch = await dispatchScheduledOutbound();
  const report = await sendOwnerReportToWhatsapp();

  return {
    createdReviews: reviews.length,
    dispatch,
    report,
  };
}

async function sendReviewToContact(review: ReviewItem, contact: Contact) {
  const sent = await sendWhatsappMessage({
    to: contact.phone,
    text: review.draftMessage,
  });
  await addOutboundMessage({
    contactId: contact.id,
    body: review.draftMessage,
    providerMessageId: sent.providerMessageId,
  });

  const sentReview = await updateReviewItem(
    review.id,
    "sent",
    review.draftMessage,
  );
  await markContactContacted(contact.id);
  return sentReview;
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
    : await analyzeWithOpenAI(
        analyzedMessage,
        policy,
        buildConversationMemoryContext(contact, dashboard),
      );
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
  const analysis = await analyzeWithOpenAI(
    message,
    dashboard.policy,
    buildConversationMemoryContext(contact, dashboard),
  );
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
  const normalized = normalizeOwnerCommand(command);

  if (
    !normalized ||
    ownerCommandMatches(dashboard.settings, normalized, "menu", [
      "תפריט",
      "עזרה",
      "פקודות",
    ])
  ) {
    return ownerMenu(dashboard);
  }

  const editReview = normalized.match(/^ערוך\s+(\d+)\s*[:：-]\s*(.+)$/);
  if (editReview) {
    const review = pendingReviewByNumber(dashboard, Number(editReview[1]));
    if (!review) {
      return "לא מצאתי טיוטה במספר הזה. כתוב טיוטות כדי לראות את הרשימה.";
    }
    await updateReviewItem(review.id, "pending", editReview[2].trim());
    return `עדכנתי את טיוטה ${editReview[1]} עבור ${review.contactName}.`;
  }

  const sendReview = normalized.match(/^שלח\s+(\d+)$/);
  if (sendReview) {
    const review = pendingReviewByNumber(dashboard, Number(sendReview[1]));
    if (!review) {
      return "לא מצאתי טיוטה במספר הזה. כתוב טיוטות כדי לראות את הרשימה.";
    }
    await approveAndSendReview(review.id);
    return `נשלחה הטיוטה ל-${review.contactName}.`;
  }

  const rejectReview = normalized.match(/^(?:מחק|בטל|דחה)\s+(\d+)$/);
  if (rejectReview) {
    const review = pendingReviewByNumber(dashboard, Number(rejectReview[1]));
    if (!review) {
      return "לא מצאתי טיוטה במספר הזה. כתוב טיוטות כדי לראות את הרשימה.";
    }
    await updateReviewItem(review.id, "rejected");
    return `סגרתי את הטיוטה של ${review.contactName}.`;
  }

  const scheduleReview = normalized.match(/^דחה\s+(\d+)\s+(.+)$/);
  if (scheduleReview) {
    const review = pendingReviewByNumber(dashboard, Number(scheduleReview[1]));
    if (!review) {
      return "לא מצאתי טיוטה במספר הזה. כתוב טיוטות כדי לראות את הרשימה.";
    }
    const scheduledFor = ownerScheduleTime(scheduleReview[2], dashboard.settings);
    await updateReviewSchedule(review.id, scheduledFor);
    return `דחיתי את ${review.contactName} ל-${formatOwnerDateTime(scheduledFor)}.`;
  }

  const handleAlert = normalized.match(/^(?:טפל|סגור)\s+(?:התראה\s+)?(\d+)$/);
  if (handleAlert) {
    const alert = openAlertByNumber(dashboard, Number(handleAlert[1]));
    if (!alert) {
      return "לא מצאתי התראה במספר הזה. כתוב התראות כדי לראות רשימה.";
    }
    await updateOwnerAlertStatus(alert.id, "handled");
    return `סימנתי את ההתראה של ${alert.contactName} כטופלה.`;
  }

  const settingsReply = await applyOwnerSettingsCommand(normalized, dashboard);
  if (settingsReply) {
    return settingsReply;
  }

  const policyReply = await applyOwnerPolicyCommand(normalized, dashboard);
  if (policyReply) {
    return policyReply;
  }

  const contactReply = await applyOwnerContactCommand(normalized, dashboard);
  if (contactReply) {
    return contactReply;
  }

  const youthReply = await applyOwnerYouthCommand(normalized, dashboard);
  if (youthReply) {
    return youthReply;
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "stop_today", [
      "עצור להיום",
      "אל תשלח היום",
    ])
  ) {
    return postponePendingReviewsToTomorrow(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "run_daily_now", [
      "הפעל הרצה יומית",
      "הרצה יומית עכשיו",
      "הפעל עכשיו",
    ])
  ) {
    const result = await runDailyAutomation();
    return [
      "הפעלתי עכשיו הרצה יומית.",
      `טיוטות חדשות: ${result.createdReviews}`,
      result.dispatch.sent
        ? "שליחה מתוזמנת: נשלחה הודעה אחת."
        : `שליחה מתוזמנת: ${result.dispatch.reason}`,
      "דוח מנהל: נבדק ונשלח אם חלון השליחה מאפשר.",
    ].join("\n");
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "stop_bot", [
      "עצור",
      "הפסק",
      "כבה",
    ])
  ) {
    await setBotEnabled(false);
    return "מנדי בוטי נעצר. לא אשלח הודעות חדשות עד שתפעיל אותי שוב.";
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "start_bot", [
      "הפעל",
      "תדליק",
      "הדלק",
    ])
  ) {
    await setBotEnabled(true);
    return "מנדי בוטי הופעל. אמשיך לעבוד לפי התור היומי והביקורות.";
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "status", [
      "סטטוס",
      "מצב מערכת",
    ])
  ) {
    return ownerStatus(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "today", [
      "היום",
      "מה היום",
      "משימות",
    ])
  ) {
    return ownerTodaySummary(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "drafts", [
      "טיוטות",
      "אישורים",
      "ביקורות",
    ])
  ) {
    return ownerDrafts(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "alerts", [
      "התראות",
      "מענה אישי",
      "אישי",
    ])
  ) {
    return ownerAlerts(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "scheduled", [
      "שליחות היום",
      "יומן שליחות",
      "מתוזמן",
    ])
  ) {
    return ownerScheduledSends(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "unresponsive", [
      "מי לא מגיב",
      "לא מגיבים",
    ])
  ) {
    return ownerUnresponsiveContacts(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "stale_youths", [
      "נערים בלי עדכון",
      "נערים ישנים",
    ])
  ) {
    return ownerStaleYouths(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "blocked_reasons", [
      "למה לא נשלח",
      "חסימות",
    ])
  ) {
    return ownerBlockedReasons(dashboard);
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "schedule_all", [
      "אשר הכל",
      "תזמן הכל",
    ])
  ) {
    return scheduleAllPendingReviews(dashboard);
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

  if (
    ownerCommandMatches(dashboard.settings, normalized, "policy", [
      "מדיניות",
      "מה מותר",
      "מה אסור",
    ])
  ) {
    return [
      "מדיניות מנדי בוטי:",
      `מותר: ${dashboard.policy.allowedTopics.join(", ")}`,
      `אסור: ${dashboard.policy.forbiddenTopics.join(", ")}`,
      "כל שאלה לא קשורה או רגישה נשלחת אליך להתראה ומענה אישי.",
    ].join("\n");
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "weekly_report", [
      "דוח שבועי",
      "סיכום שבועי",
    ])
  ) {
    const report = await createWeeklyReport();
    return report.body;
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "report", [
      "סיכום",
      "דוח",
      "מה קורה",
    ])
  ) {
    const body = ownerStatus(dashboard);
    await addOwnerReport("סיכום לפי בקשת מנהל", body);
    return body;
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "daily_queue", [
      "תור יומי",
      "שלח היום",
      "היום",
    ])
  ) {
    const created = await createDailyReviewQueue();
    return `פתחתי ${created.length} הודעות בתור ביקורת להיום.`;
  }

  const searchQuery = ownerCommandPayload(dashboard.settings, normalized, "search", [
    "חפש",
  ]);
  if (searchQuery) {
    return ownerSearch(dashboard, searchQuery);
  }

  const cardQuery = ownerCommandPayload(dashboard.settings, normalized, "card", [
    "כרטיס",
  ]);
  if (cardQuery) {
    const query = cardQuery;
    const contact = findContactByLooseText(dashboard, query);
    if (contact) {
      return ownerContactCard(dashboard, contact);
    }
    const youth = findYouthByLooseText(dashboard, query);
    if (youth) {
      return ownerYouthCard(dashboard, youth);
    }
    return "לא מצאתי כרטיס בשם הזה. אפשר לכתוב: חפש משה";
  }

  const contact = findContactByLooseText(dashboard, normalized);
  if (contact) {
    return ownerContactCard(dashboard, contact);
  }

  const youth = findYouthByLooseText(dashboard, normalized);
  if (youth) {
    return ownerYouthCard(dashboard, youth);
  }

  return "לא זיהיתי פקודה מדויקת. כתוב תפריט כדי לקבל רשימת פקודות מלאה.";
}

function ownerMenu(dashboard: DashboardData) {
  const pending = dashboard.reviews.filter((review) => review.status === "pending").length;
  const alerts = dashboard.alerts.filter((alert) => alert.status === "open").length;
  const routes = mergeOwnerCommandRoutes(dashboard.settings.ownerCommandRoutes).filter(
    (route) => route.enabled,
  );
  return [
    "תפריט מנהל:",
    `מצב כרגע: ${pending} טיוטות, ${alerts} התראות.`,
    "פקודות אישור קבועות: שלח 1 / דחה 1 מחר / ערוך 1: טקסט חדש / טפל התראה 1",
    "מילים מוגדרות:",
    ...routes.map(
      (route, index) =>
        `${index + 1}. ${route.label}: ${route.triggers.join(" / ")} -> ${route.destination}`,
    ),
  ].join("\n");
}

function ownerStatus(dashboard: DashboardData) {
  const pending = dashboard.reviews.filter((review) => review.status === "pending").length;
  const alerts = dashboard.alerts.filter((alert) => alert.status === "open").length;
  const due = getDueContactsFromDashboard(dashboard, 99).length;
  const sentToday = dashboard.messages.filter(
    (message) =>
      message.direction === "outbound" &&
      message.channel === "whatsapp" &&
      isSameDay(message.createdAt, new Date().toISOString()),
  ).length;

  return [
    "סטטוס מנדי בוטי:",
    `מצב: ${dashboard.settings.isEnabled ? "פעיל" : "כבוי"}`,
    `אוטומציה: ${automationLabel(dashboard.settings.automationLevel)}`,
    `היום: ${sentToday}/${dashboard.settings.dailyContactLimit} נשלחו`,
    `תור: ${due} אנשי קשר`,
    `טיוטות: ${pending}`,
    `מענה אישי: ${alerts}`,
    `חלון שליחה: ${dashboard.settings.sendWindowStart}-${dashboard.settings.sendWindowEnd}`,
    `Cron יומי: ${dashboard.settings.dailyCronTime}`,
    `מרווח: ${dashboard.settings.sendIntervalMinutes} דקות`,
  ].join("\n");
}

function ownerTodaySummary(dashboard: DashboardData) {
  const due = getDueContactsFromDashboard(dashboard, 8);
  const pending = dashboard.reviews
    .filter((review) => review.status === "pending")
    .slice(0, 6);
  const alerts = dashboard.alerts
    .filter((alert) => alert.status === "open")
    .slice(0, 4);

  return [
    "משימות היום:",
    due.length
      ? `תור קשר:\n${due.map((contact, index) => `${index + 1}. ${contact.name} (${contact.bestContactTime})`).join("\n")}`
      : "תור קשר: אין",
    pending.length
      ? `טיוטות:\n${pending.map(formatOwnerReviewLine).join("\n")}`
      : "טיוטות: אין",
    alerts.length
      ? `מענה אישי:\n${alerts.map((alert, index) => `${index + 1}. ${alert.contactName} - ${alert.reason}`).join("\n")}`
      : "מענה אישי: אין",
  ].join("\n\n");
}

function ownerDrafts(dashboard: DashboardData) {
  const pending = dashboard.reviews
    .filter((review) => review.status === "pending")
    .slice(0, 10);
  if (!pending.length) {
    return "אין טיוטות פתוחות.";
  }

  return [
    "טיוטות לאישור:",
    ...pending.map(formatOwnerReviewLine),
    "",
    "פקודות: שלח 1 / דחה 1 מחר / דחה 1 חצי שעה / ערוך 1: טקסט",
  ].join("\n");
}

function ownerAlerts(dashboard: DashboardData) {
  const alerts = dashboard.alerts
    .filter((alert) => alert.status === "open")
    .slice(0, 10);
  if (!alerts.length) {
    return "אין כרגע התראות פתוחות שמחכות למענה אישי.";
  }

  return [
    "התראות מענה אישי:",
    ...alerts.map(
      (alert, index) =>
        `${index + 1}. ${alert.contactName} - ${alert.reason}\n${alert.incomingText}`,
    ),
    "",
    "פקודה: טפל התראה 1",
  ].join("\n");
}

function ownerScheduledSends(dashboard: DashboardData) {
  const pending = dashboard.reviews
    .filter((review) => review.status === "pending")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 12);
  if (!pending.length) {
    return "אין הודעות מתוזמנות כרגע.";
  }

  return [
    "יומן שליחות:",
    ...pending.map(
      (review, index) =>
        `${index + 1}. ${formatOwnerDateTime(review.scheduledFor)} - ${review.contactName}`,
    ),
  ].join("\n");
}

function ownerUnresponsiveContacts(dashboard: DashboardData) {
  const contacts = dashboard.contacts
    .filter((contact) =>
      isUnresponsiveContact(
        contact,
        dashboard.messages,
        dashboard.settings.noResponseFollowupDays,
      ),
    )
    .slice(0, 10);
  if (!contacts.length) {
    return "אין כרגע אנשי קשר שעברו את זמן ההמתנה לתגובה.";
  }

  return [
    "מי לא מגיב:",
    ...contacts.map(
      (contact, index) =>
        `${index + 1}. ${contact.name} - נשלח לאחרונה ${formatOwnerDateTime(contact.lastContactedAt)}`,
    ),
  ].join("\n");
}

function ownerStaleYouths(dashboard: DashboardData) {
  const youths = dashboard.youths
    .filter((youth) => {
      const last = youth.lastUpdateAt || youth.updatedAt || youth.createdAt;
      return !last || daysBetween(new Date(last), new Date()) >= dashboard.settings.staleYouthDays;
    })
    .slice(0, 10);
  if (!youths.length) {
    return "כל הנערים עודכנו במסגרת הזמן שהוגדרה.";
  }

  return [
    "נערים בלי עדכון:",
    ...youths.map((youth, index) => {
      const contact = dashboard.contacts.find((item) => item.id === youth.contactId);
      return `${index + 1}. ${youth.name} (${contact?.name || "ללא איש קשר"}) - ${youth.nextAction || "אין פעולה הבאה"}`;
    }),
  ].join("\n");
}

function ownerBlockedReasons(dashboard: DashboardData) {
  const blocked = dashboard.reviews
    .filter((review) => review.aiReason.includes("לא נשלח"))
    .slice(0, 8);
  if (!blocked.length) {
    return "אין כרגע חסימות מתועדות. אם הודעה לא נשלחת, בדוק שבת/חג, שעות שקט, חלון שליחה, מכסה יומית ואישור אוטומטי לאיש הקשר.";
  }

  return [
    "למה לא נשלח:",
    ...blocked.map(
      (review, index) =>
        `${index + 1}. ${review.contactName}: ${review.aiReason}`,
    ),
  ].join("\n");
}

async function applyOwnerSettingsCommand(
  normalized: string,
  dashboard: DashboardData,
) {
  const dailyLimit = ownerCommandNumber(
    dashboard.settings,
    normalized,
    "set_daily_limit",
    ["כמה ביום"],
  );
  if (dailyLimit !== null) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      dailyContactLimit: dailyLimit,
    });
    return `עודכן: ${settings.dailyContactLimit} אנשי קשר ביום.`;
  }

  const youthsPerMessage = ownerCommandNumber(
    dashboard.settings,
    normalized,
    "set_youths_per_message",
    ["נערים בהודעה"],
  );
  if (youthsPerMessage !== null) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      maxYouthsPerMessage: youthsPerMessage,
    });
    return `עודכן: עד ${settings.maxYouthsPerMessage} נערים בכל הודעה.`;
  }

  const interval = ownerCommandNumber(
    dashboard.settings,
    normalized,
    "set_send_interval",
    ["מרווח שליחה"],
  );
  if (interval !== null) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      sendIntervalMinutes: interval,
    });
    return `עודכן: הודעה אחת כל ${settings.sendIntervalMinutes} דקות לפחות.`;
  }

  const dailyCronTime = ownerCommandPayload(
    dashboard.settings,
    normalized,
    "set_daily_cron_time",
    ["שעת הרצה", "שעת קרון", "שעת cron"],
  );
  if (dailyCronTime && /^\d{1,2}:\d{2}$/.test(dailyCronTime)) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      dailyCronTime: normalizeClock(dailyCronTime),
    });
    return [
      `עודכן במערכת: שעת ההרצה היומית הרצויה היא ${settings.dailyCronTime}.`,
      "ב־Vercel Hobby השעה האוטומטית בפועל נקבעת ב־vercel.json ודורשת פריסה מחדש.",
      "להרצה נוספת בכל רגע כתוב: הפעל הרצה יומית",
    ].join("\n");
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "set_daily_cron_time", [
      "שעת הרצה",
      "שעת קרון",
      "שעת cron",
    ])
  ) {
    return "כתוב כך: שעת הרצה 01:00";
  }

  const sendWindow = ownerCommandTimeRange(
    dashboard.settings,
    normalized,
    "set_send_window",
    ["שעות שליחה"],
  );
  if (sendWindow) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      sendWindowStart: normalizeClock(sendWindow[0]),
      sendWindowEnd: normalizeClock(sendWindow[1]),
    });
    return `עודכן חלון שליחה: ${settings.sendWindowStart}-${settings.sendWindowEnd}.`;
  }

  const quietHours = ownerCommandTimeRange(
    dashboard.settings,
    normalized,
    "set_quiet_hours",
    ["שעות שקט"],
  );
  if (quietHours) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      quietHoursStart: normalizeClock(quietHours[0]),
      quietHoursEnd: normalizeClock(quietHours[1]),
    });
    return `עודכנו שעות שקט: ${settings.quietHoursStart}-${settings.quietHoursEnd}.`;
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "automation_drafts", [
      "טיוטות בלבד",
      "מצב טיוטות",
    ])
  ) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      automationLevel: "drafts",
    });
    return `עודכן מצב אוטומציה: ${automationLabel(settings.automationLevel)}.`;
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "automation_review", [
      "אוטומטי עם אישור",
      "עם אישור",
    ])
  ) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      automationLevel: "auto_with_review",
    });
    return `עודכן מצב אוטומציה: ${automationLabel(settings.automationLevel)}.`;
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "automation_full", [
      "אוטומטי מלא",
      "מצב אוטומטי",
    ])
  ) {
    const settings = await updateBotSettings({
      ...dashboard.settings,
      automationLevel: "full_auto",
    });
    return `עודכן מצב אוטומציה: ${automationLabel(settings.automationLevel)}.`;
  }

  return "";
}

async function applyOwnerPolicyCommand(
  normalized: string,
  dashboard: DashboardData,
) {
  if (
    ownerCommandMatches(dashboard.settings, normalized, "shabbat_block", [
      "שבת חסום",
    ])
  ) {
    await updateBotPolicy({ ...dashboard.policy, avoidShabbat: true });
    return "עודכן: שבת וערב שבת חסומים לשליחה אוטומטית.";
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "shabbat_open", [
      "שבת פתוח",
    ])
  ) {
    await updateBotPolicy({ ...dashboard.policy, avoidShabbat: false });
    return "עודכן: חסימת שבת כבויה. מומלץ להשאיר חסום.";
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "holidays_block", [
      "חגים חסום",
    ])
  ) {
    await updateBotPolicy({ ...dashboard.policy, avoidJewishHolidays: true });
    return "עודכן: חגים חסומים לשליחה אוטומטית.";
  }

  if (
    ownerCommandMatches(dashboard.settings, normalized, "holidays_open", [
      "חגים פתוח",
    ])
  ) {
    await updateBotPolicy({ ...dashboard.policy, avoidJewishHolidays: false });
    return "עודכן: חסימת חגים כבויה. מומלץ להשאיר חסום.";
  }

  return "";
}

async function applyOwnerContactCommand(
  normalized: string,
  dashboard: DashboardData,
) {
  const attention = normalized.match(/^סמן\s+(.+?)\s+צריך תשומת לב$/);
  if (attention) {
    const contact = findContactByLooseText(dashboard, attention[1]);
    if (!contact) {
      return "לא מצאתי איש קשר בשם הזה.";
    }
    await upsertContact({ ...contact, status: "needs_attention" });
    return `${contact.name} סומן כצריך תשומת לב.`;
  }

  const pause = normalized.match(/^השהה\s+(.+)$/);
  if (pause) {
    const contact = findContactByLooseText(dashboard, pause[1]);
    if (!contact) {
      return "לא מצאתי איש קשר בשם הזה.";
    }
    await upsertContact({ ...contact, status: "paused" });
    return `${contact.name} הושהה.`;
  }

  const activate = normalized.match(/^הפעל\s+(.+)$/);
  if (activate) {
    const contact = findContactByLooseText(dashboard, activate[1]);
    if (!contact) {
      return "";
    }
    await upsertContact({ ...contact, status: "active" });
    return `${contact.name} הופעל.`;
  }

  const autoAllow = normalized.match(/^אפשר שליחה אוטומטית ל(.+)$/);
  if (autoAllow) {
    const contact = findContactByLooseText(dashboard, autoAllow[1]);
    if (!contact) {
      return "לא מצאתי איש קשר בשם הזה.";
    }
    await upsertContact({ ...contact, allowAutoSend: true });
    return `אושרה שליחה אוטומטית עבור ${contact.name}.`;
  }

  const autoBlock = normalized.match(/^בטל שליחה אוטומטית ל(.+)$/);
  if (autoBlock) {
    const contact = findContactByLooseText(dashboard, autoBlock[1]);
    if (!contact) {
      return "לא מצאתי איש קשר בשם הזה.";
    }
    await upsertContact({ ...contact, allowAutoSend: false });
    return `בוטלה שליחה אוטומטית עבור ${contact.name}.`;
  }

  return "";
}

async function applyOwnerYouthCommand(
  normalized: string,
  dashboard: DashboardData,
) {
  const addYouth = normalized.match(/^הוסף נער\s+(.+?)\s+לאיש קשר\s+(.+)$/);
  if (addYouth) {
    const contact = findContactByLooseText(dashboard, addYouth[2]);
    if (!contact) {
      return "לא מצאתי את איש הקשר לשיוך הנער.";
    }
    const youth = await upsertYouth({
      contactId: contact.id,
      name: addYouth[1].trim(),
      stage: "new",
      milestones: [],
      nextAction: "לקבל פרטים ראשוניים ולהמשיך מעקב.",
    });
    return `הוספתי את ${youth.name} לאיש הקשר ${contact.name}.`;
  }

  const updateYouth = normalized.match(/^עדכן\s+(.+?)\s*[:：-]\s*(.+)$/);
  if (updateYouth) {
    const youth = findYouthByLooseText(dashboard, updateYouth[1]);
    if (!youth) {
      return "לא מצאתי נער בשם הזה.";
    }
    const note = updateYouth[2].trim();
    await upsertYouth({
      ...youth,
      milestones: youth.milestones.includes(note)
        ? youth.milestones
        : [...youth.milestones, note],
      lastUpdateAt: new Date().toISOString(),
    });
    return `עדכנתי את ${youth.name}: ${note}`;
  }

  const nextAction = normalized.match(/^פעולה הבאה ל(.+?)\s*[:：-]\s*(.+)$/);
  if (nextAction) {
    const youth = findYouthByLooseText(dashboard, nextAction[1]);
    if (!youth) {
      return "לא מצאתי נער בשם הזה.";
    }
    await upsertYouth({
      ...youth,
      nextAction: nextAction[2].trim(),
      lastUpdateAt: new Date().toISOString(),
    });
    return `עודכנה פעולה הבאה עבור ${youth.name}.`;
  }

  return "";
}

async function scheduleAllPendingReviews(dashboard: DashboardData) {
  const pending = dashboard.reviews.filter((review) => review.status === "pending");
  if (!pending.length) {
    return "אין טיוטות פתוחות לתזמון.";
  }

  for (const [index, review] of pending.entries()) {
    await updateReviewSchedule(
      review.id,
      ownerSlotFromNow(dashboard.settings, index).toISOString(),
    );
  }

  return `תזמנתי ${pending.length} טיוטות לפי קצב שליחה של ${dashboard.settings.sendIntervalMinutes} דקות.`;
}

async function postponePendingReviewsToTomorrow(dashboard: DashboardData) {
  const pending = dashboard.reviews.filter((review) => review.status === "pending");
  if (!pending.length) {
    return "אין טיוטות פתוחות לדחייה.";
  }

  for (const [index, review] of pending.entries()) {
    const date = new Date(tomorrowOwnerIso(dashboard.settings.sendWindowStart));
    date.setMinutes(date.getMinutes() + index * dashboard.settings.sendIntervalMinutes);
    await updateReviewSchedule(review.id, date.toISOString());
  }

  return `עצור להיום: דחיתי ${pending.length} טיוטות למחר לפי חלון השליחה.`;
}

function ownerSearch(dashboard: DashboardData, query: string) {
  const term = query.trim();
  if (!term) {
    return "כתוב מה לחפש, לדוגמה: חפש משה";
  }

  const contacts = dashboard.contacts
    .filter((contact) => looseIncludes(contact.name, term) || looseIncludes(contact.phone, term))
    .slice(0, 5);
  const youths = dashboard.youths
    .filter((youth) => looseIncludes(youth.name, term) || looseIncludes(youth.city, term))
    .slice(0, 5);

  if (!contacts.length && !youths.length) {
    return "לא מצאתי תוצאות.";
  }

  return [
    `תוצאות עבור "${term}":`,
    contacts.length
      ? `אנשי קשר:\n${contacts.map((contact) => `- ${contact.name} (${contact.phone})`).join("\n")}`
      : "",
    youths.length
      ? `נערים:\n${youths.map((youth) => {
          const contact = dashboard.contacts.find((item) => item.id === youth.contactId);
          return `- ${youth.name} (${contact?.name || "ללא איש קשר"})`;
        }).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function ownerContactCard(dashboard: DashboardData, contact: Contact) {
  const youths = getContactYouthFromDashboard(dashboard, contact.id);
  const lastMessage = dashboard.messages.find((message) => message.contactId === contact.id);
  return [
    `כרטיס ${contact.name}`,
    `טלפון: ${contact.phone}`,
    `סטטוס: ${contact.status}`,
    `נערים: ${youths.length}`,
    `שליחה אוטומטית: ${contact.allowAutoSend ? "מאושרת" : "לא מאושרת"}`,
    `קשר אחרון: ${formatOwnerDateTime(contact.lastContactedAt)}`,
    `מעקב הבא: ${formatOwnerDateTime(contact.nextDueAt)}`,
    youths.length
      ? `נערים:\n${youths.map((youth) => `- ${youth.name}: ${youth.nextAction || "אין פעולה הבאה"}`).join("\n")}`
      : "אין נערים משויכים.",
    lastMessage ? `הודעה אחרונה: ${lastMessage.aiSummary || lastMessage.body}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function ownerYouthCard(dashboard: DashboardData, youth: Youth) {
  const contact = dashboard.contacts.find((item) => item.id === youth.contactId);
  return [
    `כרטיס נער: ${youth.name}`,
    `איש קשר: ${contact?.name || "לא ידוע"}`,
    `עיר: ${youth.city || "לא ידוע"}`,
    `שלב: ${youth.stage}`,
    `עודכן: ${formatOwnerDateTime(youth.lastUpdateAt || youth.updatedAt || youth.createdAt)}`,
    `אבני דרך: ${youth.milestones.join(", ") || "אין"}`,
    `פעולה הבאה: ${youth.nextAction || "לא הוגדרה"}`,
  ].join("\n");
}

function pendingReviewByNumber(dashboard: DashboardData, number: number) {
  return dashboard.reviews
    .filter((review) => review.status === "pending")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[number - 1];
}

function openAlertByNumber(dashboard: DashboardData, number: number) {
  return dashboard.alerts
    .filter((alert) => alert.status === "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[number - 1];
}

function formatOwnerReviewLine(review: ReviewItem, index: number) {
  return `${index + 1}. ${review.contactName} - ${formatOwnerDateTime(review.scheduledFor)}\n${review.draftMessage.slice(0, 180)}`;
}

function findContactByLooseText(dashboard: DashboardData, text: string) {
  const query = cleanLooseText(text);
  return dashboard.contacts.find((contact) => {
    const name = cleanLooseText(contact.name);
    const phone = cleanLooseText(contact.phone);
    return query.includes(name) || name.includes(query) || phone.includes(query);
  });
}

function findYouthByLooseText(dashboard: DashboardData, text: string) {
  const query = cleanLooseText(text);
  return dashboard.youths.find((youth) => {
    const name = cleanLooseText(youth.name);
    return query.includes(name) || name.includes(query);
  });
}

function ownerScheduleTime(text: string, settings: BotSettings) {
  const normalized = normalizeOwnerCommand(text);
  if (includesAny(normalized, ["חצי שעה", "30", "שלושים"])) {
    return new Date(Date.now() + 30 * 60000).toISOString();
  }
  if (includesAny(normalized, ["שעה"])) {
    return new Date(Date.now() + 60 * 60000).toISOString();
  }
  if (includesAny(normalized, ["מחר"])) {
    return tomorrowOwnerIso(settings.sendWindowStart);
  }
  const time = normalized.match(/(\d{1,2}:\d{2})/);
  if (time) {
    const date = new Date();
    const [hours, minutes] = normalizeClock(time[1]).split(":").map(Number);
    date.setHours(hours || 9, minutes || 0, 0, 0);
    if (date.getTime() <= Date.now()) {
      date.setDate(date.getDate() + 1);
    }
    return date.toISOString();
  }
  return ownerSlotFromNow(settings, 1).toISOString();
}

function ownerSlotFromNow(settings: BotSettings, offset: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + offset * settings.sendIntervalMinutes);
  return date;
}

function tomorrowOwnerIso(time: string) {
  const date = new Date();
  const [hours, minutes] = normalizeClock(time).split(":").map(Number);
  date.setDate(date.getDate() + 1);
  date.setHours(hours || 9, minutes || 0, 0, 0);
  return date.toISOString();
}

function normalizeClock(value: string) {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Math.max(0, Math.min(23, Number(rawHours) || 0));
  const minutes = Math.max(0, Math.min(59, Number(rawMinutes) || 0));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function automationLabel(level: BotSettings["automationLevel"]) {
  if (level === "drafts") {
    return "טיוטות בלבד";
  }
  if (level === "full_auto") {
    return "אוטומטי מלא";
  }
  return "אוטומטי עם אישור";
}

function formatOwnerDateTime(value?: string | null) {
  if (!value) {
    return "לא ידוע";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "לא ידוע";
  }

  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function isSameDay(value: string, compare: string) {
  const a = new Date(value);
  const b = new Date(compare);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysBetween(earlier: Date, later: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function normalizeOwnerCommand(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function looseIncludes(value: string, query: string) {
  return cleanLooseText(value).includes(cleanLooseText(query));
}

function cleanLooseText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, "")
    .trim();
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
  const slot = await automaticSendSlotStatus(new Date());

  if (shouldSendDirectly && schedule.allowed && slot.allowed) {
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

  const blockedReason = !schedule.allowed
    ? schedule.reason
    : shouldSendDirectly && !slot.allowed
      ? slot.reason
      : "";

  return createReviewItem({
    type: "outbound_message",
    contactId: input.contact.id,
    contactName: input.contact.name,
    youthId: null,
    youthName: input.youthName || null,
    priority: input.priority,
    draftMessage: input.body,
    aiReason: blockedReason
      ? `${input.reason} לא נשלח אוטומטית כי ${blockedReason}`
      : input.reason,
    scheduledFor: nextAutomatedSlot(new Date(), input.settings, 1).toISOString(),
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

  const newMilestones = analysis.milestones.filter(
    (milestone) => !youth.milestones.includes(milestone),
  );
  if (newMilestones.length === 0) {
    return;
  }

  const nextMilestones = new Set([
    ...youth.milestones,
    ...newMilestones,
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

function ownerCommandTriggers(
  settings: BotSettings,
  id: string,
  fallback: string[],
) {
  const route = mergeOwnerCommandRoutes(settings.ownerCommandRoutes).find(
    (candidate) => candidate.id === id,
  );

  if (route && !route.enabled) {
    return [];
  }

  return route?.triggers?.length ? route.triggers : fallback;
}

function ownerCommandMatches(
  settings: BotSettings,
  normalized: string,
  id: string,
  fallback: string[],
) {
  return includesAny(normalized, ownerCommandTriggers(settings, id, fallback));
}

function ownerCommandNumber(
  settings: BotSettings,
  normalized: string,
  id: string,
  fallback: string[],
) {
  for (const trigger of ownerCommandTriggers(settings, id, fallback)) {
    const match = normalized.match(
      new RegExp(`^${escapeRegex(trigger)}\\s+(\\d+)$`),
    );
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function ownerCommandTimeRange(
  settings: BotSettings,
  normalized: string,
  id: string,
  fallback: string[],
) {
  for (const trigger of ownerCommandTriggers(settings, id, fallback)) {
    const match = normalized.match(
      new RegExp(
        `^${escapeRegex(trigger)}\\s+(\\d{1,2}:\\d{2})\\s*[-–]\\s*(\\d{1,2}:\\d{2})$`,
      ),
    );
    if (match) {
      return [match[1], match[2]] as const;
    }
  }

  return null;
}

function ownerCommandPayload(
  settings: BotSettings,
  normalized: string,
  id: string,
  fallback: string[],
) {
  const triggers = ownerCommandTriggers(settings, id, fallback).sort(
    (a, b) => b.length - a.length,
  );

  for (const trigger of triggers) {
    if (normalized.startsWith(`${trigger} `)) {
      return normalized.slice(trigger.length).trim();
    }
  }

  return null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getContactYouthFromDashboard(dashboard: DashboardData, contactId: string) {
  return dashboard.youths.filter((youth) => youth.contactId === contactId);
}

function buildConversationMemoryContext(
  contact: Contact | null | undefined,
  dashboard: DashboardData,
) {
  if (!contact) {
    return "";
  }

  const youths = getContactYouthFromDashboard(dashboard, contact.id);
  const recentMessages = dashboard.messages
    .filter((message) => message.contactId === contact.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15)
    .reverse();

  const youthContext = youths
    .map((youth) =>
      [
        youth.name,
        `שלב: ${youth.stage}`,
        youth.milestones.length ? `אבני דרך: ${youth.milestones.join(", ")}` : "",
        youth.nextAction ? `פעולה הבאה: ${youth.nextAction}` : "",
        youth.lastUpdateAt ? `עודכן: ${youth.lastUpdateAt}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");

  const messageContext = recentMessages
    .map((message) => {
      const direction = message.direction === "inbound" ? "contact" : "mendy";
      const body = (message.aiSummary || message.body).replace(/\s+/g, " ").trim();
      return `${message.createdAt} ${direction}: ${body.slice(0, 360)}`;
    })
    .join("\n");

  return [
    `Contact: ${contact.name}`,
    `Notes: ${contact.notes || "none"}`,
    `Preferred tone: ${contact.preferredTone || dashboard.settings.tone}`,
    youthContext ? `Tracked youths:\n${youthContext}` : "Tracked youths: none",
    messageContext
      ? `Last ${recentMessages.length} messages, oldest first:\n${messageContext}`
      : "No previous messages with this contact.",
  ].join("\n\n");
}

function isUnresponsiveContact(
  contact: Contact,
  messages: DashboardData["messages"],
  waitDays: number,
  now = new Date(),
) {
  if (!contact.lastContactedAt || contact.status === "paused") {
    return false;
  }

  const lastContactedAt = new Date(contact.lastContactedAt);
  const inboundAfterLastContact = messages.some((message) => {
    return (
      message.contactId === contact.id &&
      message.direction === "inbound" &&
      new Date(message.createdAt) > lastContactedAt
    );
  });

  return (
    !inboundAfterLastContact &&
    Math.floor((now.getTime() - lastContactedAt.getTime()) / 86400000) >=
      waitDays
  );
}

function getDueContactsFromDashboard(
  dashboard: DashboardData,
  limit: number,
  settings = dashboard.settings,
) {
  const now = new Date();
  return dashboard.contacts
    .filter(
      (contact) =>
        contact.status !== "paused" &&
        (new Date(contact.nextDueAt) <= now ||
          isUnresponsiveContact(
            contact,
            dashboard.messages,
            settings.noResponseFollowupDays,
            now,
          )),
    )
    .sort((a, b) => {
      if (a.status === "needs_attention" && b.status !== "needs_attention") {
        return -1;
      }
      if (a.status !== "needs_attention" && b.status === "needs_attention") {
        return 1;
      }
      const aUnresponsive = isUnresponsiveContact(
        a,
        dashboard.messages,
        settings.noResponseFollowupDays,
        now,
      );
      const bUnresponsive = isUnresponsiveContact(
        b,
        dashboard.messages,
        settings.noResponseFollowupDays,
        now,
      );
      if (aUnresponsive && !bUnresponsive) {
        return -1;
      }
      if (!aUnresponsive && bUnresponsive) {
        return 1;
      }
      return a.nextDueAt.localeCompare(b.nextDueAt);
    })
    .slice(0, limit);
}

function latestAutomatedOutbound(dashboard: DashboardData) {
  return dashboard.messages
    .filter(
      (message) =>
        message.direction === "outbound" &&
        message.channel === "whatsapp" &&
        Boolean(message.contactId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

async function automaticSendSlotStatus(now: Date) {
  const dashboard = await getDashboardData();
  const intervalMinutes = Math.max(30, dashboard.settings.sendIntervalMinutes);
  const dailySent = automatedOutboundCountToday(dashboard, now);
  const dailyLimit = Math.max(1, dashboard.settings.dailyContactLimit);

  if (dailySent >= dailyLimit) {
    return {
      allowed: false,
      reason: "המכסה היומית נוצלה",
    };
  }

  const lastOutbound = latestAutomatedOutbound(dashboard);
  if (!lastOutbound) {
    return {
      allowed: true,
      reason: "יש סלוט פנוי",
    };
  }

  const nextEligibleAt = new Date(
    new Date(lastOutbound.createdAt).getTime() + intervalMinutes * 60000,
  );

  return {
    allowed: nextEligibleAt <= now,
    reason:
      nextEligibleAt <= now
        ? "יש סלוט פנוי"
        : `ממתין עד ${nextEligibleAt.toISOString()} בגלל מרווח שליחה`,
  };
}

function automatedOutboundCountToday(dashboard: DashboardData, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  return dashboard.messages.filter((message) => {
    if (
      message.direction !== "outbound" ||
      message.channel !== "whatsapp" ||
      !message.contactId
    ) {
      return false;
    }

    const createdAt = new Date(message.createdAt);
    return createdAt >= start && createdAt <= now;
  }).length;
}

function nextAutomatedSlot(now: Date, settings: BotSettings, offset = 0) {
  const interval = Math.max(30, settings.sendIntervalMinutes);
  let slot = roundUpToInterval(now, interval);

  if (!isInsideSendWindow(slot, settings)) {
    slot = nextWindowStart(slot, settings);
  }

  for (let i = 0; i < offset; i += 1) {
    slot = addMinutes(slot, interval);
    if (!isInsideSendWindow(slot, settings)) {
      slot = nextWindowStart(slot, settings);
    }
  }

  return slot;
}

function roundUpToInterval(date: Date, intervalMinutes: number) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const nextMinutes = Math.ceil(minutes / intervalMinutes) * intervalMinutes;
  if (nextMinutes >= 60) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  } else {
    rounded.setMinutes(nextMinutes, 0, 0);
  }
  return rounded;
}

function nextWindowStart(date: Date, settings: BotSettings) {
  const start = timeOnDate(date, settings.sendWindowStart);
  if (date <= start) {
    return start;
  }

  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return timeOnDate(tomorrow, settings.sendWindowStart);
}

function isInsideSendWindow(date: Date, settings: BotSettings) {
  const current = date.getHours() * 60 + date.getMinutes();
  const start = minutes(settings.sendWindowStart);
  const end = minutes(settings.sendWindowEnd);

  if (start === end) {
    return true;
  }

  if (start < end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

function timeOnDate(date: Date, value: string) {
  const next = new Date(date);
  const [hours, mins] = value.split(":").map(Number);
  next.setHours(hours || 0, mins || 0, 0, 0);
  return next;
}

function addMinutes(date: Date, minutesToAdd: number) {
  return new Date(date.getTime() + minutesToAdd * 60000);
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return (hours || 0) * 60 + (mins || 0);
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
