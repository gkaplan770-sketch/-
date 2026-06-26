import type { OwnerCommandRoute } from "@/lib/types";

export const defaultOwnerCommandRoutes: OwnerCommandRoute[] = [
  {
    id: "menu",
    label: "תפריט פקודות",
    destination: "WhatsApp -> הודעת תפריט למנהל",
    triggers: ["תפריט", "עזרה", "פקודות"],
    enabled: true,
  },
  {
    id: "status",
    label: "סטטוס מערכת",
    destination: "WhatsApp -> דוח מצב קצר",
    triggers: ["סטטוס", "מצב מערכת"],
    enabled: true,
  },
  {
    id: "today",
    label: "משימות היום",
    destination: "WhatsApp -> תור עבודה יומי",
    triggers: ["היום", "מה היום", "משימות"],
    enabled: true,
  },
  {
    id: "drafts",
    label: "טיוטות לאישור",
    destination: "WhatsApp -> רשימת ביקורות פתוחות",
    triggers: ["טיוטות", "אישורים", "ביקורות"],
    enabled: true,
  },
  {
    id: "alerts",
    label: "מענה אישי",
    destination: "WhatsApp -> התראות פתוחות",
    triggers: ["התראות", "מענה אישי", "אישי"],
    enabled: true,
  },
  {
    id: "scheduled",
    label: "יומן שליחות",
    destination: "WhatsApp -> הודעות מתוזמנות",
    triggers: ["שליחות היום", "יומן שליחות", "מתוזמן"],
    enabled: true,
  },
  {
    id: "report",
    label: "דוח מצב",
    destination: "WhatsApp -> דוח מנהל ושמירה בדוחות",
    triggers: ["סיכום", "דוח", "מה קורה"],
    enabled: true,
  },
  {
    id: "weekly_report",
    label: "דוח שבועי",
    destination: "WhatsApp -> דוח שבועי חדש",
    triggers: ["דוח שבועי", "סיכום שבועי"],
    enabled: true,
  },
  {
    id: "unresponsive",
    label: "מי לא מגיב",
    destination: "WhatsApp -> אנשי קשר ללא תגובה",
    triggers: ["מי לא מגיב", "לא מגיבים"],
    enabled: true,
  },
  {
    id: "stale_youths",
    label: "נערים בלי עדכון",
    destination: "WhatsApp -> נערים ישנים",
    triggers: ["נערים בלי עדכון", "נערים ישנים"],
    enabled: true,
  },
  {
    id: "blocked_reasons",
    label: "למה לא נשלח",
    destination: "WhatsApp -> חסימות וסיבות",
    triggers: ["למה לא נשלח", "חסימות"],
    enabled: true,
  },
  {
    id: "policy",
    label: "מדיניות",
    destination: "WhatsApp -> מה מותר ומה אסור לבוט",
    triggers: ["מדיניות", "מה מותר", "מה אסור"],
    enabled: true,
  },
  {
    id: "schedule_all",
    label: "תזמן הכל",
    destination: "תור ביקורות -> תזמון לפי סלוטים",
    triggers: ["אשר הכל", "תזמן הכל"],
    enabled: true,
  },
  {
    id: "daily_queue",
    label: "פתח תור יומי",
    destination: "מנוע תזמון -> יצירת טיוטות יומיות",
    triggers: ["תור יומי", "שלח היום"],
    enabled: true,
  },
  {
    id: "run_daily_now",
    label: "הרצה יומית עכשיו",
    destination: "WhatsApp -> יצירת תור, שליחה מותרת ודוח מנהל",
    triggers: ["הפעל הרצה יומית", "הרצה יומית עכשיו", "הפעל עכשיו"],
    enabled: true,
  },
  {
    id: "stop_today",
    label: "עצור להיום",
    destination: "תור ביקורות -> דחייה למחר",
    triggers: ["עצור להיום", "אל תשלח היום"],
    enabled: true,
  },
  {
    id: "stop_bot",
    label: "עצור בוט",
    destination: "הגדרות מנהל -> כיבוי בוט",
    triggers: ["עצור", "הפסק", "כבה"],
    enabled: true,
  },
  {
    id: "start_bot",
    label: "הפעל בוט",
    destination: "הגדרות מנהל -> הפעלת בוט",
    triggers: ["הפעל", "תדליק", "הדלק"],
    enabled: true,
  },
  {
    id: "set_daily_limit",
    label: "מכסה יומית",
    destination: "הגדרות שליחה -> אנשי קשר ביום",
    triggers: ["כמה ביום"],
    enabled: true,
  },
  {
    id: "set_youths_per_message",
    label: "נערים בהודעה",
    destination: "הגדרות שליחה -> נערים בהודעה",
    triggers: ["נערים בהודעה"],
    enabled: true,
  },
  {
    id: "set_send_interval",
    label: "מרווח שליחה",
    destination: "הגדרות שליחה -> מרווח בדקות",
    triggers: ["מרווח שליחה"],
    enabled: true,
  },
  {
    id: "set_send_window",
    label: "שעות שליחה",
    destination: "הגדרות שליחה -> חלון שליחה",
    triggers: ["שעות שליחה"],
    enabled: true,
  },
  {
    id: "set_daily_cron_time",
    label: "שעת Cron יומי",
    destination: "הגדרות מנהל -> שעת הרצה יומית",
    triggers: ["שעת הרצה", "שעת קרון", "שעת cron"],
    enabled: true,
  },
  {
    id: "set_quiet_hours",
    label: "שעות שקט",
    destination: "הגדרות שליחה -> שעות שקט",
    triggers: ["שעות שקט"],
    enabled: true,
  },
  {
    id: "automation_drafts",
    label: "טיוטות בלבד",
    destination: "הגדרות מנהל -> רמת אוטומציה",
    triggers: ["טיוטות בלבד", "מצב טיוטות"],
    enabled: true,
  },
  {
    id: "automation_review",
    label: "אוטומטי עם אישור",
    destination: "הגדרות מנהל -> רמת אוטומציה",
    triggers: ["אוטומטי עם אישור", "עם אישור"],
    enabled: true,
  },
  {
    id: "automation_full",
    label: "אוטומטי מלא",
    destination: "הגדרות מנהל -> רמת אוטומציה",
    triggers: ["אוטומטי מלא", "מצב אוטומטי"],
    enabled: true,
  },
  {
    id: "shabbat_block",
    label: "חסום שבת",
    destination: "מדיניות בטיחות -> שבת",
    triggers: ["שבת חסום"],
    enabled: true,
  },
  {
    id: "shabbat_open",
    label: "פתח שבת",
    destination: "מדיניות בטיחות -> שבת",
    triggers: ["שבת פתוח"],
    enabled: true,
  },
  {
    id: "holidays_block",
    label: "חסום חגים",
    destination: "מדיניות בטיחות -> חגים",
    triggers: ["חגים חסום"],
    enabled: true,
  },
  {
    id: "holidays_open",
    label: "פתח חגים",
    destination: "מדיניות בטיחות -> חגים",
    triggers: ["חגים פתוח"],
    enabled: true,
  },
  {
    id: "search",
    label: "חיפוש",
    destination: "WhatsApp -> חיפוש אנשי קשר ונערים",
    triggers: ["חפש"],
    enabled: true,
  },
  {
    id: "card",
    label: "כרטיס",
    destination: "WhatsApp -> כרטיס איש קשר/נער",
    triggers: ["כרטיס"],
    enabled: true,
  },
];

export function mergeOwnerCommandRoutes(
  routes?: OwnerCommandRoute[] | null,
) {
  const byId = new Map((routes || []).map((route) => [route.id, route]));
  return defaultOwnerCommandRoutes.map((fallback) => {
    const route = byId.get(fallback.id);
    return {
      ...fallback,
      ...route,
      triggers: normalizeTriggers(route?.triggers || fallback.triggers),
      enabled: route?.enabled ?? fallback.enabled,
    };
  });
}

export function normalizeTriggers(triggers: string[]) {
  return triggers.map((trigger) => trigger.trim()).filter(Boolean);
}
