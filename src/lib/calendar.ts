import type { BotPolicy, BotSettings, Contact } from "@/lib/types";

export type ScheduleDecision = {
  allowed: boolean;
  reason: string;
  localTime: string;
};

export function canContactNow(
  contact: Contact,
  settings: BotSettings,
  policy: BotPolicy,
  now = new Date(),
): ScheduleDecision {
  const local = localParts(now, contact.timezone);
  const localDate = `${local.year}-${local.month}-${local.day}`;
  const localTime = `${local.hour}:${local.minute}`;

  if (policy.blockedDates.includes(localDate)) {
    return {
      allowed: false,
      reason: "התאריך חסום במדיניות הבוט.",
      localTime,
    };
  }

  if (policy.avoidShabbat && isShabbatWindow(local.weekday, local.hourNumber)) {
    return {
      allowed: false,
      reason: "חלון שבת/ערב שבת לפי אזור הזמן של איש הקשר.",
      localTime,
    };
  }

  if (isWithinQuietHours(localTime, settings.quietHoursStart, settings.quietHoursEnd)) {
    return {
      allowed: false,
      reason: "שעת שקט לפי הגדרות הבוט.",
      localTime,
    };
  }

  if (contact.bestContactTime && !isNearPreferredTime(localTime, contact.bestContactTime)) {
    return {
      allowed: false,
      reason: `עדיף לפנות סביב ${contact.bestContactTime} לפי זיכרון איש הקשר.`,
      localTime,
    };
  }

  return {
    allowed: true,
    reason: "אפשר לפנות עכשיו.",
    localTime,
  };
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    weekday: parts.weekday || "Sun",
    year: parts.year || "1970",
    month: parts.month || "01",
    day: parts.day || "01",
    hour: parts.hour || "00",
    minute: parts.minute || "00",
    hourNumber: Number(parts.hour || 0),
  };
}

function isShabbatWindow(weekday: string, hour: number) {
  return weekday === "Sat" || (weekday === "Fri" && hour >= 14);
}

function isWithinQuietHours(time: string, start: string, end: string) {
  const current = minutes(time);
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);

  if (startMinutes <= endMinutes) {
    return current >= startMinutes && current <= endMinutes;
  }

  return current >= startMinutes || current <= endMinutes;
}

function isNearPreferredTime(time: string, preferred: string) {
  const delta = Math.abs(minutes(time) - minutes(preferred));
  return delta <= 180;
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return (hours || 0) * 60 + (mins || 0);
}
