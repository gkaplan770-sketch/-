import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";
import type { RuntimeConfigStatus } from "@/lib/config";

const envMap: Record<string, string[]> = {
  auth: ["APP_PASSWORD", "MENDY_SESSION_SECRET"],
  supabase: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  openai: ["OPENAI_API_KEY"],
  gnapi: ["GNAPI_SEND_URL", "GNAPI_API_KEY"],
  cron: ["CRON_SECRET"],
};

export default function SetupScreen({ status }: { status: RuntimeConfigStatus }) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#f6f3ee] px-4 py-8 text-[#1c1b18]">
      <div className="mx-auto max-w-4xl rounded-lg border border-[#ded6c8] bg-white p-6 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#9b2f2f] text-white">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">מנדי בוטי עדיין לא במצב אמת</h1>
        <p className="mt-2 text-sm leading-6 text-[#686158]">
          ביקשת מערכת אמיתית ולא דמו, לכן הדשבורד נעול עד שכל החיבורים מוגדרים ב-`.env.local`.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {Object.entries(envMap).map(([key, vars]) => {
            const missing = status.missing.includes(key);
            return (
              <div key={key} className="rounded-lg border border-[#e5ded2] bg-[#fbfaf7] p-4">
                <div className="flex items-center gap-2 font-bold">
                  {missing ? (
                    <KeyRound className="h-4 w-4 text-[#8a2929]" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-[#15583f]" />
                  )}
                  {key}
                </div>
                <div className="mt-2 grid gap-1 text-sm text-[#686158]">
                  {vars.map((item) => (
                    <code key={item} className="rounded bg-white px-2 py-1">
                      {item}
                    </code>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <pre className="mt-5 overflow-x-auto rounded-lg bg-[#1c1b18] p-4 text-left text-xs leading-6 text-white" dir="ltr">
{`MENDY_REAL_MODE=true
APP_PASSWORD=choose-a-strong-password
MENDY_SESSION_SECRET=choose-a-long-random-secret
SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5.5
OPENAI_VISION_MODEL=gpt-5.5
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_TRANSCRIBE_LANGUAGE=he
GNAPI_SEND_URL=https://your-gnapi-send-endpoint
GNAPI_API_KEY=your-gnapi-api-key
GNAPI_WEBHOOK_SECRET=choose-a-webhook-secret
WHATSAPP_VERIFY_TOKEN=choose-a-webhook-token
CRON_SECRET=choose-a-cron-secret`}
        </pre>
      </div>
    </main>
  );
}
