import {
  seedContacts,
  seedAlerts,
  seedMessages,
  seedPolicy,
  seedReports,
  seedReviews,
  seedSettings,
  seedYouths,
} from "@/lib/mock-data";
import { mergeOwnerCommandRoutes } from "@/lib/owner-command-routes";
import { getSupabaseAdmin, hasSupabaseConfig, formatSupabaseError } from "@/lib/supabase";
import { assertRealDataStoreReady, isRealMode } from "@/lib/config";
import type {
  BotSettings,
  BotPolicy,
  Contact,
  ContactTimelineItem,
  ConversationMessage,
  DashboardData,
  DashboardStats,
  IntegrationHealth,
  ImportResult,
  OwnerAlert,
  OwnerAlertStatus,
  OwnerCommandRoute,
  OwnerReport,
  ReviewItem,
  ReviewStatus,
  SearchResult,
  Youth,
  WeeklyReport,
} from "@/lib/types";

type MemoryStore = {
  settings: BotSettings;
  policy: BotPolicy;
  contacts: Contact[];
  youths: Youth[];
  reviews: ReviewItem[];
  messages: ConversationMessage[];
  reports: OwnerReport[];
  alerts: OwnerAlert[];
};

const storeKey = "__mendy_boti_memory_store__";

function memoryStore() {
  const globalWithStore = globalThis as typeof globalThis & {
    [storeKey]?: MemoryStore;
  };

  if (!globalWithStore[storeKey]) {
    globalWithStore[storeKey] = {
      settings: { ...seedSettings },
      policy: {
        ...seedPolicy,
        allowedTopics: [...seedPolicy.allowedTopics],
        forbiddenTopics: [...seedPolicy.forbiddenTopics],
        escalationTriggers: [...seedPolicy.escalationTriggers],
        blockedDates: [...seedPolicy.blockedDates],
      },
      contacts: seedContacts.map((contact) => ({ ...contact })),
      youths: seedYouths.map((youth) => ({
        ...youth,
        milestones: [...youth.milestones],
      })),
      reviews: seedReviews.map((review) => ({ ...review })),
      messages: seedMessages.map((message) => ({ ...message })),
      reports: seedReports.map((report) => ({ ...report })),
      alerts: seedAlerts.map((alert) => ({ ...alert })),
    };
  }

  const store = globalWithStore[storeKey];
  if (!store.policy) {
    store.policy = {
      ...seedPolicy,
      allowedTopics: [...seedPolicy.allowedTopics],
      forbiddenTopics: [...seedPolicy.forbiddenTopics],
      escalationTriggers: [...seedPolicy.escalationTriggers],
    };
  }
  store.policy.blockedDates ||= [...seedPolicy.blockedDates];
  store.policy.avoidShabbat ??= seedPolicy.avoidShabbat;
  store.policy.avoidJewishHolidays ??= seedPolicy.avoidJewishHolidays;
  if (!store.alerts) {
    store.alerts = seedAlerts.map((alert) => ({ ...alert }));
  }
  store.settings.maxYouthsPerMessage ||= seedSettings.maxYouthsPerMessage;
  store.settings.noResponseFollowupDays ||= seedSettings.noResponseFollowupDays;
  store.settings.staleYouthDays ||= seedSettings.staleYouthDays;
  store.settings.sendWindowStart ||= seedSettings.sendWindowStart;
  store.settings.sendWindowEnd ||= seedSettings.sendWindowEnd;
  store.settings.sendIntervalMinutes ||= seedSettings.sendIntervalMinutes;
  store.settings.ownerCommandRoutes = mergeOwnerCommandRoutes(
    store.settings.ownerCommandRoutes,
  );
  store.contacts = store.contacts.map((contact) => ({
    ...contact,
    preferredTone: contact.preferredTone || "חם, מכבד וקצר",
    responseStyle: contact.responseStyle || "רגיל",
    bestContactTime: contact.bestContactTime || "12:00",
    allowAutoSend: contact.allowAutoSend ?? false,
  }));

  store.contacts = store.contacts.map((contact) => {
    const fallbackDate =
      contact.updatedAt ||
      contact.lastContactedAt ||
      contact.nextDueAt ||
      new Date().toISOString();

    return {
      ...contact,
      createdAt: contact.createdAt || fallbackDate,
      updatedAt: contact.updatedAt || fallbackDate,
    };
  });
  store.youths = store.youths.map((youth) => {
    const fallbackDate =
      youth.updatedAt ||
      youth.lastUpdateAt ||
      youth.createdAt ||
      new Date().toISOString();

    return {
      ...youth,
      createdAt: youth.createdAt || fallbackDate,
      updatedAt: youth.updatedAt || fallbackDate,
    };
  });

  return globalWithStore[storeKey];
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || String(Date.now());
}

function currentHealth(lastError?: string): IntegrationHealth {
  return {
    supabase: hasSupabaseConfig() ? "configured" : "mock",
    openai: process.env.OPENAI_API_KEY ? "configured" : "mock",
    gnapi:
      process.env.GNAPI_SEND_URL && process.env.GNAPI_API_KEY
        ? "configured"
        : "mock",
    lastError,
  };
}

function calculateStats(
  contacts: Contact[],
  youths: Youth[],
  reviews: ReviewItem[],
  alerts: OwnerAlert[],
  messages: ConversationMessage[],
  settings: BotSettings,
): DashboardStats {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const activeContacts = contacts.filter(
    (contact) => contact.status === "active" || contact.status === "needs_attention",
  ).length;
  const pendingReviews = reviews.filter(
    (review) => review.status === "pending",
  ).length;
  const dueContacts = contacts.filter((contact) => {
    return contact.status !== "paused" && new Date(contact.nextDueAt) <= now;
  }).length;
  const openOwnerAlerts = alerts.filter((alert) => alert.status === "open").length;
  const escalatedMessages = alerts.length;
  const outboundMessages = reviews.filter(
    (review) => review.type === "outbound_message",
  ).length;
  const sentMessages = reviews.filter((review) => review.status === "sent").length;
  const responseRate =
    outboundMessages === 0 ? 0 : Math.round((sentMessages / outboundMessages) * 100);
  const staleContacts = contacts.filter((contact) => {
    if (!contact.lastContactedAt) {
      return true;
    }
    const last = new Date(contact.lastContactedAt);
    const days = (now.getTime() - last.getTime()) / 86400000;
    return days >= 45;
  }).length;
  const unresponsiveContacts = contacts.filter((contact) =>
    isUnresponsiveContact(contact, messages, settings.noResponseFollowupDays, now),
  ).length;
  const staleYouths = youths.filter((youth) =>
    isStaleYouth(youth, settings.staleYouthDays, now),
  ).length;

  const updatedThisMonth = (youth: Youth) => {
    if (!youth.lastUpdateAt) {
      return false;
    }
    const date = new Date(youth.lastUpdateAt);
    return date.getMonth() === month && date.getFullYear() === year;
  };

  return {
    activeContacts,
    trackedYouths: youths.length,
    pendingReviews,
    britMilestonesThisMonth: youths.filter(
      (youth) =>
        updatedThisMonth(youth) &&
        youth.milestones.some((milestone) => milestone.includes("ברית")),
    ).length,
    tefillinMilestonesThisMonth: youths.filter(
      (youth) =>
        updatedThisMonth(youth) &&
        youth.milestones.some((milestone) => milestone.includes("תפילין")),
    ).length,
    dueContacts,
    openOwnerAlerts,
    escalatedMessages,
    responseRate,
    staleContacts,
    unresponsiveContacts,
    staleYouths,
  };
}

function isUnresponsiveContact(
  contact: Contact,
  messages: ConversationMessage[],
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
    daysBetween(lastContactedAt, now) >= waitDays
  );
}

function isStaleYouth(youth: Youth, staleDays: number, now = new Date()) {
  const lastUpdate = youth.lastUpdateAt || youth.updatedAt || youth.createdAt;
  if (!lastUpdate) {
    return true;
  }

  return daysBetween(new Date(lastUpdate), now) >= staleDays;
}

function daysBetween(earlier: Date, later: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function normalizeTime(value: string, fallback: string) {
  return /^\d{2}:\d{2}$/.test(value || "") ? value : fallback;
}

function dashboardFromStore(
  store: MemoryStore,
  health: IntegrationHealth = currentHealth(),
): DashboardData {
  return {
    settings: store.settings,
    policy: store.policy,
    stats: calculateStats(
      store.contacts,
      store.youths,
      store.reviews,
      store.alerts,
      store.messages,
      store.settings,
    ),
    contacts: [...store.contacts].sort((a, b) =>
      a.nextDueAt.localeCompare(b.nextDueAt),
    ),
    youths: [...store.youths].sort((a, b) => {
      const aDate = a.lastUpdateAt || "0000";
      const bDate = b.lastUpdateAt || "0000";
      return aDate.localeCompare(bDate);
    }),
    reviews: [...store.reviews].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") {
        return -1;
      }
      if (a.status !== "pending" && b.status === "pending") {
        return 1;
      }
      return a.scheduledFor.localeCompare(b.scheduledFor);
    }),
    messages: [...store.messages]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100),
    reports: [...store.reports]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    alerts: [...store.alerts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10),
    health,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    assertRealDataStoreReady();
    return dashboardFromStore(memoryStore());
  }

  try {
    const [
      settingsResult,
      policyResult,
      contactsResult,
      youthsResult,
      reviewsResult,
      messagesResult,
      reportsResult,
      alertsResult,
    ] = await Promise.all([
      supabase.from("bot_settings").select("*").eq("id", "main").maybeSingle(),
      supabase.from("bot_policies").select("*").eq("id", "main").maybeSingle(),
      supabase.from("contacts").select("*").order("next_due_at"),
      supabase.from("youths").select("*").order("last_update_at"),
      supabase.from("review_items").select("*").order("scheduled_for"),
      supabase
        .from("conversation_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("owner_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("owner_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const error =
      settingsResult.error ||
      policyResult.error ||
      contactsResult.error ||
      youthsResult.error ||
      reviewsResult.error ||
      messagesResult.error ||
      reportsResult.error ||
      alertsResult.error;

    if (error) {
      throwIfSupabaseError(error);
    }

    const settings = mapSettings(settingsResult.data);
    const policy = mapPolicy(policyResult.data);
    const contacts = (contactsResult.data || []).map(mapContact);
    const youths = (youthsResult.data || []).map(mapYouth);
    const reviews = (reviewsResult.data || []).map((review) =>
      mapReview(review, contacts, youths),
    );
    const messages = (messagesResult.data || []).map(mapMessage);
    const reports = (reportsResult.data || []).map(mapReport);
    const alerts = (alertsResult.data || []).map((alert) =>
      mapOwnerAlert(alert, contacts),
    );

    return dashboardFromStore(
      { settings, policy, contacts, youths, reviews, messages, reports, alerts },
      currentHealth(),
    );
  } catch (error) {
    const message = formatSupabaseError(error);
    if (isRealMode()) {
      throw new Error(`Supabase dashboard query failed: ${message}`);
    }

    return dashboardFromStore(memoryStore(), {
      ...currentHealth(message),
      supabase: "error",
    });
  }
}

export async function setBotEnabled(isEnabled: boolean) {
  const updatedAt = new Date().toISOString();
  const currentSettings = (await getDashboardData()).settings;
  const store = memoryStore();
  store.settings = {
    ...currentSettings,
    isEnabled,
    updatedAt,
  };

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("bot_settings").upsert({
      id: "main",
      is_enabled: isEnabled,
      automation_level: currentSettings.automationLevel,
      daily_contact_limit: currentSettings.dailyContactLimit,
      max_youths_per_message: currentSettings.maxYouthsPerMessage,
      no_response_followup_days: currentSettings.noResponseFollowupDays,
      stale_youth_days: currentSettings.staleYouthDays,
      send_window_start: currentSettings.sendWindowStart,
      send_window_end: currentSettings.sendWindowEnd,
      send_interval_minutes: currentSettings.sendIntervalMinutes,
      owner_whatsapp: currentSettings.ownerWhatsapp,
      tone: currentSettings.tone,
      quiet_hours_start: currentSettings.quietHoursStart,
      quiet_hours_end: currentSettings.quietHoursEnd,
      owner_command_routes: currentSettings.ownerCommandRoutes,
      updated_at: updatedAt,
    });
    throwIfSupabaseError(error);
  }

  await addSystemMessage(
    isEnabled ? "מנדי בוטי הופעל." : "מנדי בוטי נעצר ידנית.",
  );

  return store.settings;
}

export async function updateBotSettings(input: BotSettings) {
  const updatedAt = new Date().toISOString();
  const settings: BotSettings = {
    ...input,
    dailyContactLimit: clamp(input.dailyContactLimit, 1, 10),
    maxYouthsPerMessage: clamp(input.maxYouthsPerMessage, 1, 10),
    noResponseFollowupDays: clamp(input.noResponseFollowupDays, 1, 60),
    staleYouthDays: clamp(input.staleYouthDays, 1, 365),
    sendWindowStart: normalizeTime(input.sendWindowStart, seedSettings.sendWindowStart),
    sendWindowEnd: normalizeTime(input.sendWindowEnd, seedSettings.sendWindowEnd),
    sendIntervalMinutes: clamp(input.sendIntervalMinutes, 30, 240),
    ownerCommandRoutes: mergeOwnerCommandRoutes(input.ownerCommandRoutes),
    updatedAt,
  };
  const store = memoryStore();
  store.settings = settings;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("bot_settings").upsert({
      id: settings.id,
      is_enabled: settings.isEnabled,
      automation_level: settings.automationLevel,
      daily_contact_limit: settings.dailyContactLimit,
      max_youths_per_message: settings.maxYouthsPerMessage,
      no_response_followup_days: settings.noResponseFollowupDays,
      stale_youth_days: settings.staleYouthDays,
      send_window_start: settings.sendWindowStart,
      send_window_end: settings.sendWindowEnd,
      send_interval_minutes: settings.sendIntervalMinutes,
      owner_whatsapp: settings.ownerWhatsapp,
      tone: settings.tone,
      quiet_hours_start: settings.quietHoursStart,
      quiet_hours_end: settings.quietHoursEnd,
      owner_command_routes: settings.ownerCommandRoutes,
      updated_at: updatedAt,
    });
    throwIfSupabaseError(error);
  }

  await addSystemMessage("הגדרות המנהל עודכנו.");
  return settings;
}

export async function updateBotPolicy(input: BotPolicy) {
  const updatedAt = new Date().toISOString();
  const store = memoryStore();
  store.policy = {
    ...input,
    allowedTopics: input.allowedTopics.filter(Boolean),
    forbiddenTopics: input.forbiddenTopics.filter(Boolean),
    escalationTriggers: input.escalationTriggers.filter(Boolean),
    blockedDates: input.blockedDates.filter(Boolean),
    updatedAt,
  };

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("bot_policies").upsert({
      id: store.policy.id,
      allowed_topics: store.policy.allowedTopics,
      forbidden_topics: store.policy.forbiddenTopics,
      escalation_triggers: store.policy.escalationTriggers,
      blocked_dates: store.policy.blockedDates,
      avoid_shabbat: store.policy.avoidShabbat,
      avoid_jewish_holidays: store.policy.avoidJewishHolidays,
      bot_identity: store.policy.botIdentity,
      allowed_answer_style: store.policy.allowedAnswerStyle,
      unrelated_holding_reply: store.policy.unrelatedHoldingReply,
      forbidden_holding_reply: store.policy.forbiddenHoldingReply,
      owner_alert_template: store.policy.ownerAlertTemplate,
      require_review_for_all_replies: store.policy.requireReviewForAllReplies,
      notify_owner_on_escalation: store.policy.notifyOwnerOnEscalation,
      send_holding_reply_on_escalation: store.policy.sendHoldingReplyOnEscalation,
      max_auto_reply_length: store.policy.maxAutoReplyLength,
      updated_at: updatedAt,
    });
    throwIfSupabaseError(error);
  }

  await addSystemMessage("מדיניות הבוט עודכנה.");
  return store.policy;
}

export async function updateReviewItem(
  id: string,
  status: ReviewStatus,
  draftMessage?: string,
) {
  const dashboard = await getDashboardData();
  const existingReview = dashboard.reviews.find((item) => item.id === id);
  if (!existingReview) {
    throw new Error("Review item not found");
  }

  const store = memoryStore();
  const memoryReview = store.reviews.find((item) => item.id === id);
  const review = {
    ...existingReview,
    status,
    draftMessage: draftMessage ?? existingReview.draftMessage,
  };

  if (memoryReview) {
    Object.assign(memoryReview, review);
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase
      .from("review_items")
      .update({
        status,
        draft_message: review.draftMessage,
      })
      .eq("id", id);
    throwIfSupabaseError(error);
  }

  await addSystemMessage(`פריט ביקורת ${review.contactName} עודכן ל-${status}.`);
  return review;
}

export async function updateReviewSchedule(id: string, scheduledFor: string) {
  const dashboard = await getDashboardData();
  const existingReview = dashboard.reviews.find((item) => item.id === id);
  if (!existingReview) {
    throw new Error("Review item not found");
  }

  const store = memoryStore();
  const memoryReview = store.reviews.find((item) => item.id === id);
  const review = {
    ...existingReview,
    scheduledFor,
  };

  if (memoryReview) {
    Object.assign(memoryReview, review);
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase
      .from("review_items")
      .update({
        scheduled_for: scheduledFor,
      })
      .eq("id", id);
    throwIfSupabaseError(error);
  }

  return review;
}

export async function createOwnerAlert(
  input: Omit<OwnerAlert, "id" | "createdAt" | "status" | "handledAt"> & {
    status?: OwnerAlertStatus;
  },
) {
  const alert: OwnerAlert = {
    ...input,
    id: uid(),
    status: input.status || "open",
    createdAt: new Date().toISOString(),
    handledAt: null,
  };

  const store = memoryStore();
  store.alerts.unshift(alert);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("owner_alerts").insert({
      id: alert.id,
      contact_id: alert.contactId,
      contact_name: alert.contactName,
      phone: alert.phone,
      incoming_text: alert.incomingText,
      reason: alert.reason,
      urgency: alert.urgency,
      status: alert.status,
      suggested_owner_reply: alert.suggestedOwnerReply,
      created_at: alert.createdAt,
      handled_at: alert.handledAt,
    });
    throwIfSupabaseError(error);
  }

  return alert;
}

export async function updateOwnerAlertStatus(
  id: string,
  status: OwnerAlertStatus,
) {
  const dashboard = await getDashboardData();
  const existingAlert = dashboard.alerts.find((item) => item.id === id);
  if (!existingAlert) {
    throw new Error("Owner alert not found");
  }

  const store = memoryStore();
  const memoryAlert = store.alerts.find((item) => item.id === id);
  const alert = {
    ...existingAlert,
    status,
    handledAt: status === "open" ? null : new Date().toISOString(),
  };

  if (memoryAlert) {
    Object.assign(memoryAlert, alert);
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase
      .from("owner_alerts")
      .update({
        status: alert.status,
        handled_at: alert.handledAt,
      })
      .eq("id", id);
    throwIfSupabaseError(error);
  }

  await addSystemMessage(`התראת מנהל ${alert.contactName} עודכנה ל-${status}.`);
  return alert;
}

export async function createReviewItem(
  input: Omit<ReviewItem, "id" | "createdAt" | "status"> & {
    status?: ReviewStatus;
  },
) {
  const review: ReviewItem = {
    ...input,
    id: uid(),
    status: input.status || "pending",
    createdAt: new Date().toISOString(),
  };

  const store = memoryStore();
  store.reviews.unshift(review);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("review_items").insert({
      id: review.id,
      type: review.type,
      contact_id: review.contactId,
      contact_name: review.contactName,
      youth_id: review.youthId,
      status: review.status,
      priority: review.priority,
      draft_message: review.draftMessage,
      ai_reason: review.aiReason,
      scheduled_for: review.scheduledFor,
      created_at: review.createdAt,
    });
    throwIfSupabaseError(error);
  }

  return review;
}

export async function addInboundMessage(input: {
  contactId: string | null;
  body: string;
  mediaType: ConversationMessage["mediaType"];
  mediaUrl?: string;
  rawPayload?: unknown;
  aiSummary?: string;
}) {
  const message: ConversationMessage = {
    id: uid(),
    contactId: input.contactId,
    direction: "inbound",
    channel: "whatsapp",
    body: input.body,
    mediaType: input.mediaType,
    aiSummary: input.aiSummary,
    createdAt: new Date().toISOString(),
  };

  const store = memoryStore();
  store.messages.unshift(message);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("conversation_messages").insert({
      id: message.id,
      contact_id: message.contactId,
      direction: message.direction,
      channel: message.channel,
      body: message.body,
      media_type: message.mediaType,
      media_url: input.mediaUrl || null,
      raw_payload: input.rawPayload || null,
      ai_summary: message.aiSummary,
      created_at: message.createdAt,
    });
    throwIfSupabaseError(error);
  }

  return message;
}

export async function addOutboundMessage(input: {
  contactId: string | null;
  body: string;
  providerMessageId?: string | null;
}) {
  const message: ConversationMessage = {
    id: uid(),
    contactId: input.contactId,
    direction: "outbound",
    channel: "whatsapp",
    body: input.body,
    mediaType: "text",
    createdAt: new Date().toISOString(),
  };

  const store = memoryStore();
  store.messages.unshift(message);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("conversation_messages").insert({
      id: message.id,
      contact_id: message.contactId,
      direction: message.direction,
      channel: message.channel,
      body: message.body,
      media_type: message.mediaType,
      provider_message_id: input.providerMessageId || null,
      created_at: message.createdAt,
    });
    throwIfSupabaseError(error);
  }

  return message;
}

export async function addSystemMessage(body: string) {
  const message: ConversationMessage = {
    id: uid(),
    contactId: null,
    direction: "outbound",
    channel: "system",
    body,
    mediaType: "text",
    createdAt: new Date().toISOString(),
  };

  const store = memoryStore();
  store.messages.unshift(message);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("conversation_messages").insert({
      id: message.id,
      contact_id: message.contactId,
      direction: message.direction,
      channel: message.channel,
      body: message.body,
      media_type: message.mediaType,
      created_at: message.createdAt,
    });
    throwIfSupabaseError(error);
  }

  return message;
}

export async function addOwnerReport(title: string, body: string) {
  const report: OwnerReport = {
    id: uid(),
    title,
    body,
    createdAt: new Date().toISOString(),
  };

  const store = memoryStore();
  store.reports.unshift(report);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("owner_reports").insert({
      id: report.id,
      title: report.title,
      body: report.body,
      created_at: report.createdAt,
    });
    throwIfSupabaseError(error);
  }

  return report;
}

export async function upsertContact(
  input: Partial<Contact> & Pick<Contact, "name" | "phone">,
) {
  const dashboard = await getDashboardData();
  const store = memoryStore();
  const existing = input.id
    ? dashboard.contacts.find((contact) => contact.id === input.id)
    : dashboard.contacts.find(
        (contact) => normalizePhone(contact.phone) === normalizePhone(input.phone),
      );
  const memoryExisting = existing
    ? store.contacts.find((contact) => contact.id === existing.id)
    : null;
  const updatedAt = new Date().toISOString();
  const contact: Contact = {
    id: existing?.id || input.id || uid(),
    name: input.name,
    phone: input.phone,
    country: input.country || existing?.country || "",
    timezone: input.timezone || existing?.timezone || "Asia/Jerusalem",
    language: input.language || existing?.language || "he",
    status: input.status || existing?.status || "active",
    preferredTone:
      input.preferredTone || existing?.preferredTone || "חם, מכבד וקצר",
    responseStyle: input.responseStyle || existing?.responseStyle || "רגיל",
    bestContactTime: input.bestContactTime || existing?.bestContactTime || "12:00",
    allowAutoSend: input.allowAutoSend ?? existing?.allowAutoSend ?? false,
    lastContactedAt: input.lastContactedAt ?? existing?.lastContactedAt ?? null,
    nextDueAt: input.nextDueAt || existing?.nextDueAt || new Date().toISOString(),
    notes: input.notes || existing?.notes || "",
    warmthScore: input.warmthScore ?? existing?.warmthScore ?? 50,
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
  };

  if (memoryExisting) {
    Object.assign(memoryExisting, contact);
  } else {
    store.contacts.unshift(contact);
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("contacts").upsert({
      id: contact.id,
      display_name: contact.name,
      phone: contact.phone,
      country: contact.country,
      timezone: contact.timezone,
      language: contact.language,
      status: contact.status,
      preferred_tone: contact.preferredTone,
      response_style: contact.responseStyle,
      best_contact_time: contact.bestContactTime,
      allow_auto_send: contact.allowAutoSend,
      last_contacted_at: contact.lastContactedAt,
      next_due_at: contact.nextDueAt,
      notes: contact.notes,
      warmth_score: contact.warmthScore,
      updated_at: updatedAt,
    });
    throwIfSupabaseError(error);
  }

  await addSystemMessage(`איש קשר נשמר: ${contact.name}.`);
  return contact;
}

export async function markContactContacted(contactId: string) {
  const store = memoryStore();
  const contact = store.contacts.find((item) => item.id === contactId);
  const lastContactedAt = new Date().toISOString();
  const nextDueAt = addMonthsIso(1);

  if (contact) {
    contact.lastContactedAt = lastContactedAt;
    contact.nextDueAt = nextDueAt;
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase
      .from("contacts")
      .update({
        last_contacted_at: lastContactedAt,
        next_due_at: nextDueAt,
        updated_at: lastContactedAt,
      })
      .eq("id", contactId);
    throwIfSupabaseError(error);
  }

  return { lastContactedAt, nextDueAt };
}

export async function deleteContact(id: string) {
  const store = memoryStore();
  store.contacts = store.contacts.filter((contact) => contact.id !== id);
  store.youths = store.youths.filter((youth) => youth.contactId !== id);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    throwIfSupabaseError(error);
  }

  await addSystemMessage("איש קשר נמחק.");
}

export async function upsertYouth(
  input: Partial<Youth> & Pick<Youth, "contactId" | "name">,
) {
  const dashboard = await getDashboardData();
  const store = memoryStore();
  const existing = input.id
    ? dashboard.youths.find((youth) => youth.id === input.id)
    : dashboard.youths.find(
        (youth) =>
          youth.contactId === input.contactId &&
          youth.name.trim() === input.name.trim(),
      );
  const memoryExisting = existing
    ? store.youths.find((youth) => youth.id === existing.id)
    : null;
  const updatedAt = new Date().toISOString();
  const youth: Youth = {
    id: existing?.id || input.id || uid(),
    contactId: input.contactId,
    name: input.name,
    city: input.city || existing?.city || "",
    stage: input.stage || existing?.stage || "new",
    milestones: input.milestones || existing?.milestones || [],
    lastUpdateAt: input.lastUpdateAt ?? existing?.lastUpdateAt ?? null,
    nextAction: input.nextAction || existing?.nextAction || "",
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
  };

  if (memoryExisting) {
    Object.assign(memoryExisting, youth);
  } else {
    store.youths.unshift(youth);
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("youths").upsert({
      id: youth.id,
      contact_id: youth.contactId,
      display_name: youth.name,
      city: youth.city,
      stage: youth.stage,
      milestones: youth.milestones,
      last_update_at: youth.lastUpdateAt,
      next_action: youth.nextAction,
      updated_at: updatedAt,
    });
    throwIfSupabaseError(error);
  }

  await addSystemMessage(`נער נשמר: ${youth.name}.`);
  return youth;
}

export async function deleteYouth(id: string) {
  const store = memoryStore();
  store.youths = store.youths.filter((youth) => youth.id !== id);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("youths").delete().eq("id", id);
    throwIfSupabaseError(error);
  }

  await addSystemMessage("נער נמחק.");
}

export async function importCsvData(csv: string): Promise<ImportResult> {
  const result: ImportResult = {
    contactsCreated: 0,
    contactsUpdated: 0,
    youthsCreated: 0,
    skippedRows: 0,
    errors: [],
  };
  const rows = parseCsv(csv);
  const dashboard = await getDashboardData();
  const existingPhones = new Set(
    dashboard.contacts.map((contact) => normalizePhone(contact.phone)),
  );

  for (const [index, row] of rows.entries()) {
    const name = valueFrom(row, ["contactName", "שם איש קשר", "name", "שם"]);
    const phone = valueFrom(row, ["phone", "טלפון", "whatsapp", "וואטסאפ"]);
    if (!name || !phone) {
      result.skippedRows += 1;
      result.errors.push(`שורה ${index + 2}: חסר שם איש קשר או טלפון.`);
      continue;
    }

    const normalizedPhone = normalizePhone(phone);
    const existed = existingPhones.has(normalizedPhone);
    const contact = await upsertContact({
      name,
      phone,
      country: valueFrom(row, ["country", "מדינה"]),
      timezone: valueFrom(row, ["timezone", "אזור זמן"]) || "Asia/Jerusalem",
      notes: valueFrom(row, ["notes", "הערות"]),
      preferredTone: valueFrom(row, ["preferredTone", "סגנון"]),
      responseStyle: valueFrom(row, ["responseStyle", "זיכרון"]),
    });
    if (existed) {
      result.contactsUpdated += 1;
    } else {
      result.contactsCreated += 1;
      existingPhones.add(normalizedPhone);
    }

    const youthName = valueFrom(row, ["youthName", "שם נער", "נער"]);
    if (youthName) {
      await upsertYouth({
        contactId: contact.id,
        name: youthName,
        city: valueFrom(row, ["city", "עיר"]),
        nextAction: valueFrom(row, ["nextAction", "פעולה הבאה"]),
      });
      result.youthsCreated += 1;
    }
  }

  await addSystemMessage(
    `ייבוא הסתיים: ${result.contactsCreated} חדשים, ${result.contactsUpdated} עודכנו, ${result.youthsCreated} נערים.`,
  );
  return result;
}

export async function searchDashboard(query: string): Promise<SearchResult[]> {
  const dashboard = await getDashboardData();
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const results: SearchResult[] = [];
  const push = (
    item: Omit<SearchResult, "score">,
    haystack: string,
    baseScore = 1,
  ) => {
    const lower = haystack.toLowerCase();
    if (lower.includes(normalized)) {
      results.push({
        ...item,
        score: baseScore + Math.max(0, 30 - lower.indexOf(normalized)),
      });
    }
  };

  for (const contact of dashboard.contacts) {
    push(
      {
        id: contact.id,
        kind: "contact",
        title: contact.name,
        subtitle: `${contact.country} · ${contact.phone}`,
        body: `${contact.notes} ${contact.responseStyle}`,
      },
      `${contact.name} ${contact.phone} ${contact.country} ${contact.notes} ${contact.responseStyle}`,
      10,
    );
  }

  for (const youth of dashboard.youths) {
    const contact = dashboard.contacts.find((item) => item.id === youth.contactId);
    push(
      {
        id: youth.id,
        kind: "youth",
        title: youth.name,
        subtitle: `${youth.city} · ${contact?.name || ""}`,
        body: `${youth.nextAction} ${youth.milestones.join(", ")}`,
      },
      `${youth.name} ${youth.city} ${youth.nextAction} ${youth.milestones.join(" ")}`,
      8,
    );
  }

  for (const message of dashboard.messages) {
    push(
      {
        id: message.id,
        kind: "message",
        title: message.direction === "inbound" ? "הודעה נכנסת" : "הודעה יוצאת",
        subtitle: message.createdAt,
        body: message.aiSummary || message.body,
      },
      `${message.body} ${message.aiSummary || ""}`,
      4,
    );
  }

  for (const review of dashboard.reviews) {
    push(
      {
        id: review.id,
        kind: "review",
        title: review.contactName,
        subtitle: review.status,
        body: `${review.draftMessage} ${review.aiReason}`,
      },
      `${review.contactName} ${review.draftMessage} ${review.aiReason}`,
      5,
    );
  }

  for (const alert of dashboard.alerts) {
    push(
      {
        id: alert.id,
        kind: "alert",
        title: alert.contactName,
        subtitle: alert.reason,
        body: alert.incomingText,
      },
      `${alert.contactName} ${alert.reason} ${alert.incomingText}`,
      7,
    );
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

export async function getContactTimeline(contactId: string) {
  const dashboard = await getDashboardData();
  return [
    ...dashboard.messages
      .filter((message) => message.contactId === contactId)
      .map((message) => ({
        id: message.id,
        type: "message" as const,
        title: message.direction === "inbound" ? "הודעה נכנסת" : "הודעה יוצאת",
        body: message.aiSummary || message.body,
        createdAt: message.createdAt,
      })),
    ...dashboard.reviews
      .filter((review) => review.contactId === contactId)
      .map((review) => ({
        id: review.id,
        type: "review" as const,
        title: "פריט ביקורת",
        body: review.draftMessage,
        createdAt: review.createdAt,
        status: review.status,
      })),
    ...dashboard.alerts
      .filter((alert) => alert.contactId === contactId)
      .map((alert) => ({
        id: alert.id,
        type: "alert" as const,
        title: "התראת מענה אישי",
        body: alert.incomingText,
        createdAt: alert.createdAt,
        status: alert.status,
      })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getContactManagementTimeline(
  contactId: string,
): Promise<ContactTimelineItem[]> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const [
      contactResult,
      youthsResult,
      messagesResult,
      reviewsResult,
      alertsResult,
    ] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", contactId).maybeSingle(),
      supabase
        .from("youths")
        .select("*")
        .eq("contact_id", contactId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("conversation_messages")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("review_items")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("owner_alerts")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const error =
      contactResult.error ||
      youthsResult.error ||
      messagesResult.error ||
      reviewsResult.error ||
      alertsResult.error;
    throwIfSupabaseError(error);

    const contact = contactResult.data ? mapContact(contactResult.data) : undefined;
    const youths = (youthsResult.data || []).map(mapYouth);
    const messages = (messagesResult.data || []).map(mapMessage);
    const reviews = (reviewsResult.data || []).map((review) =>
      mapReview(review, contact ? [contact] : [], youths),
    );
    const alerts = (alertsResult.data || []).map((alert) =>
      mapOwnerAlert(alert, contact ? [contact] : []),
    );

    return buildContactManagementTimeline({
      contact,
      youths,
      messages,
      reviews,
      alerts,
    });
  }

  const dashboard = await getDashboardData();
  const contact = dashboard.contacts.find((item) => item.id === contactId);
  const youths = dashboard.youths.filter((youth) => youth.contactId === contactId);
  const messages = dashboard.messages.filter(
    (message) => message.contactId === contactId,
  );
  const reviews = dashboard.reviews.filter(
    (review) => review.contactId === contactId,
  );
  const alerts = dashboard.alerts.filter((alert) => alert.contactId === contactId);

  return buildContactManagementTimeline({
    contact,
    youths,
    messages,
    reviews,
    alerts,
  });
}

function buildContactManagementTimeline({
  contact,
  youths,
  messages,
  reviews,
  alerts,
}: {
  contact?: Contact;
  youths: Youth[];
  messages: ConversationMessage[];
  reviews: ReviewItem[];
  alerts: OwnerAlert[];
}): ContactTimelineItem[] {
  const contactItems: ContactTimelineItem[] = contact
    ? [
        {
          id: `contact-${contact.id}-created`,
          type: "contact_update",
          title: "איש קשר נכנס למערכת",
          body: contact.notes || "נפתח כרטיס איש קשר למעקב.",
          createdAt: contact.createdAt || contact.updatedAt || new Date().toISOString(),
          status: contact.status,
        },
      ]
    : [];

  return [
    ...contactItems,
    ...messages.map((message) => ({
      id: message.id,
      type: "message" as const,
      title:
        message.direction === "inbound"
          ? "הודעה נכנסת"
          : message.channel === "system"
            ? "עדכון מערכת"
            : "הודעה יוצאת",
      body: message.aiSummary || message.body,
      createdAt: message.createdAt,
      status: message.direction,
    })),
    ...reviews.map((review) => ({
      id: review.id,
      type: "review" as const,
      title: "פריט ביקורת",
      body: review.draftMessage,
      createdAt: review.createdAt,
      status: review.status,
      youthId: review.youthId || null,
      youthName: review.youthName || null,
    })),
    ...alerts.map((alert) => ({
      id: alert.id,
      type: "alert" as const,
      title: "התראת מענה אישי",
      body: alert.incomingText,
      createdAt: alert.createdAt,
      status: alert.status,
    })),
    ...youths.map((youth) => ({
      id: `youth-${youth.id}-updated`,
      type: "youth_update" as const,
      title: `עדכון נער: ${youth.name}`,
      body: [
        `שלב: ${youth.stage}`,
        youth.nextAction ? `פעולה הבאה: ${youth.nextAction}` : "",
        youth.milestones.length
          ? `אבני דרך: ${youth.milestones.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      createdAt:
        youth.lastUpdateAt ||
        youth.updatedAt ||
        youth.createdAt ||
        new Date().toISOString(),
      status: youth.stage,
      youthId: youth.id,
      youthName: youth.name,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function exportDashboardData(
  format: "json" | "csv",
  dashboard: DashboardData = dashboardFromStore(memoryStore()),
) {
  if (format === "json") {
    return JSON.stringify(dashboard, null, 2);
  }

  const rows = [
    [
      "contactName",
      "phone",
      "country",
      "timezone",
      "status",
      "youthName",
      "city",
      "stage",
      "milestones",
      "nextAction",
    ],
  ];
  for (const contact of dashboard.contacts) {
    const youths = dashboard.youths.filter((youth) => youth.contactId === contact.id);
    if (youths.length === 0) {
      rows.push([
        contact.name,
        contact.phone,
        contact.country,
        contact.timezone,
        contact.status,
        "",
        "",
        "",
        "",
        "",
      ]);
    }
    for (const youth of youths) {
      rows.push([
        contact.name,
        contact.phone,
        contact.country,
        contact.timezone,
        contact.status,
        youth.name,
        youth.city,
        youth.stage,
        youth.milestones.join("; "),
        youth.nextAction,
      ]);
    }
  }

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}

export async function createWeeklyReport(): Promise<WeeklyReport> {
  const dashboard = await getDashboardData();
  const openAlerts = dashboard.alerts.filter((alert) => alert.status === "open");
  const pending = dashboard.reviews.filter((review) => review.status === "pending");
  const stale = dashboard.contacts.filter((contact) => {
    if (!contact.lastContactedAt) {
      return true;
    }
    return Date.now() - new Date(contact.lastContactedAt).getTime() > 45 * 86400000;
  });
  const body = [
    `השבוע יש ${dashboard.contacts.length} אנשי קשר ו-${dashboard.youths.length} נערים במעקב.`,
    `${pending.length} הודעות ממתינות לביקורת, ${openAlerts.length} התראות דורשות מענה אישי.`,
    `${dashboard.stats.britMilestonesThisMonth} עדכוני ברית ו-${dashboard.stats.tefillinMilestonesThisMonth} עדכוני תפילין החודש.`,
    stale.length
      ? `צריך לשים לב ל-${stale.length} אנשי קשר שלא עודכנו זמן רב.`
      : "אין אנשי קשר ישנים במיוחד כרגע.",
  ].join("\n");
  await addOwnerReport("דוח שבועי", body);
  return {
    title: "דוח שבועי",
    body,
    stats: dashboard.stats,
    createdAt: new Date().toISOString(),
  };
}

export function findContactByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return memoryStore().contacts.find((contact) => {
    return normalizePhone(contact.phone) === normalized;
  });
}

export function getContactYouth(contactId: string) {
  return memoryStore().youths.filter((youth) => youth.contactId === contactId);
}

export function getDueContacts(limit: number) {
  const now = new Date();
  return memoryStore()
    .contacts.filter(
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

export function getMemorySnapshot() {
  return memoryStore();
}

function mapSettings(row: Record<string, unknown> | null): BotSettings {
  if (!row) {
    return {
      ...seedSettings,
      ownerCommandRoutes: mergeOwnerCommandRoutes(seedSettings.ownerCommandRoutes),
    };
  }

  return {
    id: String(row.id || "main"),
    isEnabled: Boolean(row.is_enabled),
    automationLevel:
      (row.automation_level as BotSettings["automationLevel"]) ||
      "auto_with_review",
    dailyContactLimit: Number(row.daily_contact_limit || 2),
    maxYouthsPerMessage: Number(row.max_youths_per_message || 2),
    noResponseFollowupDays: Number(row.no_response_followup_days || 4),
    staleYouthDays: Number(row.stale_youth_days || 30),
    sendWindowStart: String(row.send_window_start || seedSettings.sendWindowStart),
    sendWindowEnd: String(row.send_window_end || seedSettings.sendWindowEnd),
    sendIntervalMinutes: Number(
      row.send_interval_minutes || seedSettings.sendIntervalMinutes,
    ),
    ownerWhatsapp: String(row.owner_whatsapp || ""),
    tone: String(row.tone || seedSettings.tone),
    quietHoursStart: String(row.quiet_hours_start || "21:30"),
    quietHoursEnd: String(row.quiet_hours_end || "09:00"),
    ownerCommandRoutes: mergeOwnerCommandRoutes(
      ownerCommandRoutesFromRow(row.owner_command_routes),
    ),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function ownerCommandRoutesFromRow(value: unknown): OwnerCommandRoute[] {
  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((route) => {
      const data = route as Partial<OwnerCommandRoute>;
      return {
        id: String(data.id || ""),
        label: String(data.label || ""),
        destination: String(data.destination || ""),
        triggers: Array.isArray(data.triggers)
          ? data.triggers.map((trigger) => String(trigger))
          : [],
        enabled: data.enabled !== false,
      };
    })
    .filter((route) => route.id);
}

function mapPolicy(row: Record<string, unknown> | null): BotPolicy {
  if (!row) {
    return seedPolicy;
  }

  return {
    id: String(row.id || "main"),
    allowedTopics: stringArray(row.allowed_topics, seedPolicy.allowedTopics),
    forbiddenTopics: stringArray(
      row.forbidden_topics,
      seedPolicy.forbiddenTopics,
    ),
    escalationTriggers: stringArray(
      row.escalation_triggers,
      seedPolicy.escalationTriggers,
    ),
    blockedDates: stringArray(row.blocked_dates, seedPolicy.blockedDates),
    avoidShabbat:
      row.avoid_shabbat === undefined
        ? seedPolicy.avoidShabbat
        : Boolean(row.avoid_shabbat),
    avoidJewishHolidays:
      row.avoid_jewish_holidays === undefined
        ? seedPolicy.avoidJewishHolidays
        : Boolean(row.avoid_jewish_holidays),
    botIdentity: String(row.bot_identity || seedPolicy.botIdentity),
    allowedAnswerStyle: String(
      row.allowed_answer_style || seedPolicy.allowedAnswerStyle,
    ),
    unrelatedHoldingReply: String(
      row.unrelated_holding_reply || seedPolicy.unrelatedHoldingReply,
    ),
    forbiddenHoldingReply: String(
      row.forbidden_holding_reply || seedPolicy.forbiddenHoldingReply,
    ),
    ownerAlertTemplate: String(
      row.owner_alert_template || seedPolicy.ownerAlertTemplate,
    ),
    requireReviewForAllReplies:
      row.require_review_for_all_replies === undefined
        ? seedPolicy.requireReviewForAllReplies
        : Boolean(row.require_review_for_all_replies),
    notifyOwnerOnEscalation:
      row.notify_owner_on_escalation === undefined
        ? seedPolicy.notifyOwnerOnEscalation
        : Boolean(row.notify_owner_on_escalation),
    sendHoldingReplyOnEscalation:
      row.send_holding_reply_on_escalation === undefined
        ? seedPolicy.sendHoldingReplyOnEscalation
        : Boolean(row.send_holding_reply_on_escalation),
    maxAutoReplyLength: Number(
      row.max_auto_reply_length || seedPolicy.maxAutoReplyLength,
    ),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    name: String(row.display_name),
    phone: String(row.phone),
    country: String(row.country || ""),
    timezone: String(row.timezone || "Asia/Jerusalem"),
    language: (row.language as Contact["language"]) || "he",
    status: (row.status as Contact["status"]) || "active",
    preferredTone: String(row.preferred_tone || "חם, מכבד וקצר"),
    responseStyle: String(row.response_style || "רגיל"),
    bestContactTime: String(row.best_contact_time || "12:00"),
    allowAutoSend: Boolean(row.allow_auto_send),
    lastContactedAt: row.last_contacted_at
      ? String(row.last_contacted_at)
      : null,
    nextDueAt: String(row.next_due_at || new Date().toISOString()),
    notes: String(row.notes || ""),
    warmthScore: Number(row.warmth_score || 50),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

function mapYouth(row: Record<string, unknown>): Youth {
  return {
    id: String(row.id),
    contactId: String(row.contact_id),
    name: String(row.display_name),
    city: String(row.city || ""),
    stage: (row.stage as Youth["stage"]) || "new",
    milestones: Array.isArray(row.milestones)
      ? row.milestones.map(String)
      : [],
    lastUpdateAt: row.last_update_at ? String(row.last_update_at) : null,
    nextAction: String(row.next_action || ""),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.last_update_at || new Date().toISOString()),
  };
}

function mapReview(
  row: Record<string, unknown>,
  contacts: Contact[],
  youths: Youth[],
): ReviewItem {
  const contact = contacts.find((item) => item.id === row.contact_id);
  const youth = youths.find((item) => item.id === row.youth_id);

  return {
    id: String(row.id),
    type: (row.type as ReviewItem["type"]) || "outbound_message",
    contactId: row.contact_id ? String(row.contact_id) : null,
    contactName:
      String(row.contact_name || "") || contact?.name || "איש קשר לא מזוהה",
    youthId: row.youth_id ? String(row.youth_id) : null,
    youthName: youth?.name || null,
    status: (row.status as ReviewItem["status"]) || "pending",
    priority: (row.priority as ReviewItem["priority"]) || "normal",
    draftMessage: String(row.draft_message || ""),
    aiReason: String(row.ai_reason || ""),
    scheduledFor: String(row.scheduled_for || new Date().toISOString()),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapMessage(row: Record<string, unknown>): ConversationMessage {
  return {
    id: String(row.id),
    contactId: row.contact_id ? String(row.contact_id) : null,
    direction: (row.direction as ConversationMessage["direction"]) || "inbound",
    channel: (row.channel as ConversationMessage["channel"]) || "whatsapp",
    body: String(row.body || ""),
    mediaType: (row.media_type as ConversationMessage["mediaType"]) || "text",
    aiSummary: row.ai_summary ? String(row.ai_summary) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapReport(row: Record<string, unknown>): OwnerReport {
  return {
    id: String(row.id),
    title: String(row.title || "סיכום"),
    body: String(row.body || ""),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapOwnerAlert(
  row: Record<string, unknown>,
  contacts: Contact[],
): OwnerAlert {
  const contact = contacts.find((item) => item.id === row.contact_id);

  return {
    id: String(row.id),
    contactId: row.contact_id ? String(row.contact_id) : null,
    contactName:
      String(row.contact_name || "") || contact?.name || "איש קשר לא מזוהה",
    phone: String(row.phone || contact?.phone || ""),
    incomingText: String(row.incoming_text || ""),
    reason: String(row.reason || ""),
    urgency: (row.urgency as OwnerAlert["urgency"]) || "normal",
    status: (row.status as OwnerAlert["status"]) || "open",
    suggestedOwnerReply: String(row.suggested_owner_reply || ""),
    createdAt: String(row.created_at || new Date().toISOString()),
    handledAt: row.handled_at ? String(row.handled_at) : null,
  };
}

function stringArray(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  return [...fallback];
}

function throwIfSupabaseError(error: unknown) {
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
}

function addMonthsIso(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function valueFrom(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value) {
      return value.trim();
    }
  }
  return "";
}

function parseCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] || "").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}
