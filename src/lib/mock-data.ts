import type {
  BotPolicy,
  BotSettings,
  Contact,
  ConversationMessage,
  OwnerAlert,
  OwnerReport,
  ReviewItem,
  Youth,
} from "@/lib/types";
import { defaultOwnerCommandRoutes } from "@/lib/owner-command-routes";

const now = new Date();

const isoDaysAgo = (days: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const isoDaysFromNow = (days: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export const seedSettings: BotSettings = {
  id: "main",
  isEnabled: true,
  automationLevel: "auto_with_review",
  dailyContactLimit: 1,
  maxYouthsPerMessage: 2,
  noResponseFollowupDays: 4,
  staleYouthDays: 30,
  sendWindowStart: "09:30",
  sendWindowEnd: "20:30",
  sendIntervalMinutes: 30,
  dailyCronTime: "01:00",
  projectName: "מעקב נערים",
  managerDisplayName: "מנדי",
  followupQuestionGuide:
    "ברית, תפילין, שבת, שיעור תורה, חתונה כיהודי וכל התקדמות חדשה אצל הנערים.",
  ownerWhatsapp: "+972500000000",
  tone: "חם, חסידי, מכבד, קצר ולא לוחץ",
  quietHoursStart: "21:30",
  quietHoursEnd: "09:00",
  ownerCommandRoutes: defaultOwnerCommandRoutes.map((route) => ({
    ...route,
    triggers: [...route.triggers],
  })),
  updatedAt: now.toISOString(),
};

export const seedPolicy: BotPolicy = {
  id: "main",
  allowedTopics: [
    "עדכוני נערים",
    "ברית",
    "תפילין",
    "שבת",
    "שיעור תורה",
    "קשר עם רב",
    "התקדמות בענייני יהדות",
    "פרטי מעקב עבודה",
  ],
  blockedDates: [
    "2026-09-12",
    "2026-09-13",
    "2026-09-21",
    "2026-09-22",
  ],
  avoidShabbat: true,
  avoidJewishHolidays: true,
  forbiddenTopics: [
    "כספים אישיים",
    "הלוואות",
    "רפואה",
    "ייעוץ משפטי",
    "פוליטיקה",
    "רכילות",
    "עניינים משפחתיים פרטיים",
    "בקשות שאינן קשורות לעבודה",
  ],
  escalationTriggers: [
    "שאלה לא קשורה",
    "בקשה אישית",
    "תלונה",
    "כעס",
    "מידע רגיש",
    "החלטה כספית",
    "ספק בזהות הנער",
    "שאלה על זהות הכותב",
    "שאלה אם זה בוט",
    "שאלה אם זה AI",
    "שאלה אם זה מענה אוטומטי",
  ],
  botIdentity:
    "לכתוב בשם מנדי ובסגנון האישי שלו לענייני עבודה ומעקב שליחות בלבד, בלי להזכיר בוט, AI, מערכת או אוטומציה לאנשי קשר.",
  allowedAnswerStyle:
    "חם, חסידי, מכבד, קצר, אנושי וטבעי כמו הודעת וואטסאפ אישית. בלי ניסוחים מערכתיים, בלי 'כמערכת', בלי 'אני בוט', בלי הבטחות ובלי להיכנס לנושאים פרטיים.",
  unrelatedHoldingReply:
    "ראיתי, תודה. זה נושא שעדיף שאענה עליו יותר בנחת באופן אישי, אחזור לזה בעזרת השם.",
  forbiddenHoldingReply:
    "תודה שכתבתם. בנושא הזה עדיף שאענה בצורה מסודרת ואישית, אחזור לזה בעזרת השם.",
  ownerAlertTemplate:
    "צריך מענה אישי: {contactName}\nסיבה: {reason}\nהודעה: {message}",
  requireReviewForAllReplies: true,
  notifyOwnerOnEscalation: true,
  sendHoldingReplyOnEscalation: true,
  maxAutoReplyLength: 420,
  updatedAt: now.toISOString(),
};

export const seedContacts: Contact[] = [
  {
    id: "c-berlin-levi",
    name: "ר' לוי ברלין",
    phone: "+4915111111111",
    country: "גרמניה",
    timezone: "Europe/Berlin",
    language: "he",
    status: "active",
    preferredTone: "קצר, חם, ישר לעניין",
    responseStyle: "אוהב הודעות קצרות בצהריים",
    bestContactTime: "12:30",
    allowAutoSend: false,
    lastContactedAt: isoDaysAgo(35),
    nextDueAt: isoDaysAgo(2),
    notes: "עונה טוב להודעות קצרות בצהריים.",
    warmthScore: 86,
  },
  {
    id: "c-paris-moshe",
    name: "ר' משה פריז",
    phone: "+33622222222",
    country: "צרפת",
    timezone: "Europe/Paris",
    language: "he",
    status: "needs_attention",
    preferredTone: "חם ומכבד, עם פתיחה אישית",
    responseStyle: "צריך הסבר ברור למה שואלים",
    bestContactTime: "14:00",
    allowAutoSend: false,
    lastContactedAt: isoDaysAgo(48),
    nextDueAt: isoDaysAgo(7),
    notes: "צריך לשאול במיוחד על חיים ועל נושא תפילין.",
    warmthScore: 71,
  },
  {
    id: "c-ny-chaim",
    name: "ר' חיים ניו יורק",
    phone: "+16463333333",
    country: "ארצות הברית",
    timezone: "America/New_York",
    language: "he",
    status: "active",
    preferredTone: "קצר מאוד, בלי אריכות",
    responseStyle: "עונה בעיקר בערב לפי שעון ניו יורק",
    bestContactTime: "18:30",
    allowAutoSend: true,
    lastContactedAt: isoDaysAgo(12),
    nextDueAt: isoDaysFromNow(10),
    notes: "מעדיף סיכום בסוף השיחה.",
    warmthScore: 93,
  },
  {
    id: "c-buenos-yaakov",
    name: "ר' יעקב בואנוס איירס",
    phone: "+5491144444444",
    country: "ארגנטינה",
    timezone: "America/Argentina/Buenos_Aires",
    language: "he",
    status: "active",
    preferredTone: "לבבי וחסידי",
    responseStyle: "מתאים לשאול על כמה נערים יחד",
    bestContactTime: "11:00",
    allowAutoSend: false,
    lastContactedAt: isoDaysAgo(31),
    nextDueAt: isoDaysAgo(1),
    notes: "יש רשימה מתחדשת של נערים לפני חגים.",
    warmthScore: 79,
  },
];

export const seedYouths: Youth[] = [
  {
    id: "y-david",
    contactId: "c-berlin-levi",
    name: "דוד",
    city: "ברלין",
    stage: "learning",
    milestones: ["התחיל שיעור שבועי"],
    lastUpdateAt: isoDaysAgo(29),
    nextAction: "לשאול אם הגיע לשיעור נוסף ואם יש פתיחות לתפילין.",
  },
  {
    id: "y-yossi",
    contactId: "c-berlin-levi",
    name: "יוסי",
    city: "המבורג",
    stage: "needs_followup",
    milestones: [],
    lastUpdateAt: isoDaysAgo(44),
    nextAction: "לברר אם נוצר קשר ראשוני.",
  },
  {
    id: "y-chaim",
    contactId: "c-paris-moshe",
    name: "חיים",
    city: "פריז",
    stage: "mitzvah",
    milestones: ["הניח תפילין"],
    lastUpdateAt: isoDaysAgo(41),
    nextAction: "לשאול אם יש התקדמות לברית או שיעור קבוע.",
  },
  {
    id: "y-mendy",
    contactId: "c-ny-chaim",
    name: "מנדי",
    city: "ברוקלין",
    stage: "warming",
    milestones: ["הגיע לסעודת שבת"],
    lastUpdateAt: isoDaysAgo(10),
    nextAction: "לא ללחוץ, רק לברר מה שלומו.",
  },
  {
    id: "y-natan",
    contactId: "c-buenos-yaakov",
    name: "נתן",
    city: "בואנוס איירס",
    stage: "new",
    milestones: [],
    lastUpdateAt: null,
    nextAction: "לקבל פרטים ראשונים ולבדוק אם יש קשר למשפחה.",
  },
];

export const seedReviews: ReviewItem[] = [
  {
    id: "r-levi-today",
    type: "outbound_message",
    contactId: "c-berlin-levi",
    contactName: "ר' לוי ברלין",
    youthId: "y-david",
    youthName: "דוד",
    status: "pending",
    priority: "high",
    draftMessage:
      "שלום וברכה ר' לוי, צהריים טובים! מה שלומכם? רציתי לשאול בעדינות אם יש עדכון טוב על דוד או יוסי. האם היה משהו חדש בענייני יהדות, שיעור, תפילין או קשר נוסף?",
    aiReason: "לא היה עדכון מעל חודש ויש שני נערים שממתינים למעקב.",
    scheduledFor: now.toISOString(),
    createdAt: isoDaysAgo(0),
  },
  {
    id: "r-paris-followup",
    type: "outbound_message",
    contactId: "c-paris-moshe",
    contactName: "ר' משה פריז",
    youthId: "y-chaim",
    youthName: "חיים",
    status: "pending",
    priority: "normal",
    draftMessage:
      "שלום וברכה ר' משה, מה נשמע? רציתי להתעניין מה שלום חיים, ואם מאז הפעם האחרונה היה עוד צעד טוב בענייני תפילין, שיעור או קשר עם הקהילה.",
    aiReason: "חיים התקדם בעבר לתפילין, אבל אין עדכון חדש 41 יום.",
    scheduledFor: isoDaysFromNow(1),
    createdAt: isoDaysAgo(0),
  },
];

export const seedMessages: ConversationMessage[] = [
  {
    id: "m-1",
    contactId: "c-ny-chaim",
    direction: "inbound",
    channel: "whatsapp",
    body: "ברוך ה', מנדי הגיע לסעודת שבת והיה מאוד פתוח.",
    mediaType: "text",
    aiSummary: "מנדי השתתף בסעודת שבת ויש פתיחות להמשך קשר.",
    createdAt: isoDaysAgo(10),
  },
  {
    id: "m-2",
    contactId: null,
    direction: "outbound",
    channel: "system",
    body: "נוצר תור ביקורת יומי עבור 2 אנשי קשר.",
    mediaType: "text",
    createdAt: now.toISOString(),
  },
];

export const seedReports: OwnerReport[] = [
  {
    id: "report-weekly",
    title: "סיכום שבועי קצר",
    body: "יש 3 אנשי קשר שממתינים למעקב, נער אחד עם התקדמות לתפילין, ו-2 הודעות מוכנות לביקורת.",
    createdAt: now.toISOString(),
  },
];

export const seedAlerts: OwnerAlert[] = [
  {
    id: "alert-sample",
    contactId: "c-paris-moshe",
    contactName: "ר' משה פריז",
    phone: "+33622222222",
    incomingText:
      "אפשר לשאול אותך משהו אישי שלא קשור לנערים? אני צריך עצה בנושא כספי.",
    reason: "שאלה אישית וכספית שאינה בתחום שמנדי בוטי מורשה לענות עליו.",
    urgency: "high",
    status: "open",
    suggestedOwnerReply:
      "שלום וברכה ר' משה, ראיתי את ההודעה. אענה לך אישית בעז\"ה.",
    createdAt: isoDaysAgo(0),
    handledAt: null,
  },
];
