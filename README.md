# מנדי בוטי

מערכת WhatsApp אמיתית לניהול קשרי עבודה, נערים, תור חודשי, ביקורות, מדיניות מענה, התראות מענה אישי, דוחות וחיפוש.

ברירת המחדל היא `real mode`: בלי Supabase, OpenAI, GNAPI, סיסמת מנהל ו־cron secret המערכת ננעלת במסך התקנה ולא מציגה נתוני דמו.

## הרצה

```bash
npm install
npm run dev
```

אם פורט `3000` תפוס:

```bash
npm run dev -- --port 3003
```

## הגדרת אמת

1. הרץ ב־Supabase את `supabase/schema.sql`.
2. צור `.env.local` לפי `.env.example`.
3. ודא שמוגדרים לפחות:

```env
MENDY_REAL_MODE=true
APP_PASSWORD=
MENDY_SESSION_SECRET=
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GNAPI_SEND_URL=
GNAPI_API_KEY=
CRON_SECRET=
```

אפשר להגדיר גם:

```env
OPENAI_MODEL=gpt-5.5
OPENAI_VISION_MODEL=gpt-5.5
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_TRANSCRIBE_LANGUAGE=he
GNAPI_WEBHOOK_SECRET=
WHATSAPP_VERIFY_TOKEN=
GNAPI_TYPING_ENABLED=true
GNAPI_TYPING_URL=
GNAPI_TYPING_MIN_MS=1200
GNAPI_TYPING_MAX_MS=9000
GNAPI_TYPING_MS_PER_CHAR=35
```

## חיבורים

- Dashboard: `/`
- WhatsApp webhook: `POST /api/whatsapp/webhook`
- בדיקת webhook: `GET /api/whatsapp/webhook?challenge=...&token=...`
- Cron יומי: `POST /api/cron/daily` עם header `x-cron-secret: CRON_SECRET`
- סטטוס התקנה: `GET /api/system/status`

## מה בנוי

- התחברות מנהל עם cookie חתום.
- דשבורד RTL לניהול אנשי קשר, נערים, ביקורות, התראות, מדיניות, ייבוא CSV, ייצוא CSV/JSON, חיפוש, סימולטור ודוח שבועי.
- הפעלה/עצירה של הבוט.
- תור יומי לפי עד שתי פניות ביום, שעות שקטות, אזורי זמן, שבת ותאריכים חסומים.
- מדיניות “מה מותר לענות ומה אסור”, כולל תשובת החזקה והסלמה למנדי.
- OpenAI לניתוח טקסט, תמלול הקלטות ותיאור תמונות.
- GNAPI לשליחת WhatsApp וקבלת webhook.
- חיווי “מקליד...” לפני שליחת הודעה, עם זמן לפי אורך ההודעה.
- שמירת הודעות נכנסות/יוצאות, דוחות, ביקורות והתראות ב־Supabase.

## מצב פיתוח בלבד

כדי לפתוח את המערכת בלי חיבורים אמיתיים:

```env
MENDY_REAL_MODE=false
```

זה מצב פיתוח בלבד. במצב אמת, כשל Supabase/OpenAI/GNAPI לא מוחלף בנתוני דמו.
