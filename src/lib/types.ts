export type BotAutomationLevel = "drafts" | "auto_with_review" | "full_auto";

export type OwnerCommandRoute = {
  id: string;
  label: string;
  destination: string;
  triggers: string[];
  enabled: boolean;
};

export type BotSettings = {
  id: string;
  isEnabled: boolean;
  automationLevel: BotAutomationLevel;
  dailyContactLimit: number;
  maxYouthsPerMessage: number;
  noResponseFollowupDays: number;
  staleYouthDays: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendIntervalMinutes: number;
  ownerWhatsapp: string;
  tone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  ownerCommandRoutes: OwnerCommandRoute[];
  updatedAt: string;
};

export type BotPolicy = {
  id: string;
  allowedTopics: string[];
  forbiddenTopics: string[];
  escalationTriggers: string[];
  blockedDates: string[];
  avoidShabbat: boolean;
  avoidJewishHolidays: boolean;
  botIdentity: string;
  allowedAnswerStyle: string;
  unrelatedHoldingReply: string;
  forbiddenHoldingReply: string;
  ownerAlertTemplate: string;
  requireReviewForAllReplies: boolean;
  notifyOwnerOnEscalation: boolean;
  sendHoldingReplyOnEscalation: boolean;
  maxAutoReplyLength: number;
  updatedAt: string;
};

export type ContactStatus = "active" | "paused" | "needs_attention";

export type Contact = {
  id: string;
  name: string;
  phone: string;
  country: string;
  timezone: string;
  language: "he" | "en" | "yi" | "fr" | "es";
  status: ContactStatus;
  preferredTone: string;
  responseStyle: string;
  bestContactTime: string;
  allowAutoSend: boolean;
  lastContactedAt: string | null;
  nextDueAt: string;
  notes: string;
  warmthScore: number;
  createdAt?: string;
  updatedAt?: string;
};

export type YouthStage =
  | "new"
  | "warming"
  | "learning"
  | "mitzvah"
  | "needs_followup";

export type Youth = {
  id: string;
  contactId: string;
  name: string;
  city: string;
  stage: YouthStage;
  milestones: string[];
  lastUpdateAt: string | null;
  nextAction: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MessageDirection = "inbound" | "outbound";

export type ConversationMessage = {
  id: string;
  contactId: string | null;
  direction: MessageDirection;
  channel: "whatsapp" | "dashboard" | "system";
  body: string;
  mediaType: "text" | "audio" | "image" | "document";
  aiSummary?: string;
  createdAt: string;
};

export type ReviewStatus = "pending" | "approved" | "rejected" | "sent";

export type ReviewItem = {
  id: string;
  type: "outbound_message" | "data_update" | "owner_report" | "owner_alert";
  contactId: string | null;
  contactName: string;
  youthId?: string | null;
  youthName?: string | null;
  status: ReviewStatus;
  priority: "low" | "normal" | "high";
  draftMessage: string;
  aiReason: string;
  scheduledFor: string;
  createdAt: string;
};

export type DashboardStats = {
  activeContacts: number;
  trackedYouths: number;
  pendingReviews: number;
  britMilestonesThisMonth: number;
  tefillinMilestonesThisMonth: number;
  dueContacts: number;
  openOwnerAlerts: number;
  escalatedMessages: number;
  responseRate: number;
  staleContacts: number;
  unresponsiveContacts: number;
  staleYouths: number;
};

export type IntegrationHealth = {
  supabase: "mock" | "configured" | "error";
  openai: "mock" | "configured" | "error";
  gnapi: "mock" | "configured" | "error";
  lastError?: string;
};

export type OwnerReport = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export type OwnerAlertStatus = "open" | "handled" | "dismissed";

export type OwnerAlert = {
  id: string;
  contactId: string | null;
  contactName: string;
  phone: string;
  incomingText: string;
  reason: string;
  urgency: "normal" | "high";
  status: OwnerAlertStatus;
  suggestedOwnerReply: string;
  createdAt: string;
  handledAt?: string | null;
};

export type DashboardData = {
  settings: BotSettings;
  policy: BotPolicy;
  stats: DashboardStats;
  contacts: Contact[];
  youths: Youth[];
  reviews: ReviewItem[];
  messages: ConversationMessage[];
  reports: OwnerReport[];
  alerts: OwnerAlert[];
  health: IntegrationHealth;
};

export type ContactTimelineItem = {
  id: string;
  type: "message" | "review" | "alert" | "youth_update" | "contact_update";
  title: string;
  body: string;
  createdAt: string;
  status?: string;
  youthId?: string | null;
  youthName?: string | null;
};

export type SearchResult = {
  id: string;
  kind: "contact" | "youth" | "message" | "review" | "alert";
  title: string;
  subtitle: string;
  body: string;
  score: number;
};

export type SimulationResult = {
  message: NormalizedWhatsappMessage;
  contact: Contact | null;
  analysis: InboundAnalysis;
  decision: PolicyDecision;
  reason: string;
  wouldCreateAlert: boolean;
  wouldCreateReview: boolean;
  suggestedDraft: string;
};

export type ImportResult = {
  contactsCreated: number;
  contactsUpdated: number;
  youthsCreated: number;
  skippedRows: number;
  errors: string[];
};

export type WeeklyReport = {
  title: string;
  body: string;
  stats: DashboardStats;
  createdAt: string;
};

export type InboundIntent =
  | "work_update"
  | "work_question"
  | "unrelated"
  | "personal"
  | "sensitive"
  | "unknown";

export type PolicyDecision = "answer" | "review" | "escalate" | "block";

export type InboundAnalysis = {
  intent: InboundIntent;
  policyDecision: PolicyDecision;
  summary: string;
  detectedYouthNames: string[];
  milestones: string[];
  followUpNeeded: boolean;
  suggestedReply: string;
  suggestedOwnerReply: string;
  escalationReason: string;
  riskLabels: string[];
  confidence: number;
};

export type NormalizedWhatsappMessage = {
  from: string;
  text: string;
  mediaUrl?: string;
  mediaType: "text" | "audio" | "image" | "document";
  raw: unknown;
};
