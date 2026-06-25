export type IntegrationState = "configured" | "missing";

export type RuntimeConfigStatus = {
  realMode: boolean;
  auth: IntegrationState;
  supabase: IntegrationState;
  openai: IntegrationState;
  gnapi: IntegrationState;
  cron: IntegrationState;
  missing: string[];
  readyForRealUse: boolean;
};

export function isRealMode() {
  return process.env.MENDY_REAL_MODE !== "false";
}

export function hasAuthConfig() {
  return Boolean(process.env.APP_PASSWORD && process.env.MENDY_SESSION_SECRET);
}

export function hasSupabaseRuntimeConfig() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function hasOpenAIConfig() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function hasGnapiRuntimeConfig() {
  return Boolean(process.env.GNAPI_SEND_URL && process.env.GNAPI_API_KEY);
}

export function hasCronConfig() {
  return Boolean(process.env.CRON_SECRET);
}

export function getRuntimeConfigStatus(): RuntimeConfigStatus {
  const realMode = isRealMode();
  const checks = {
    auth: hasAuthConfig(),
    supabase: hasSupabaseRuntimeConfig(),
    openai: hasOpenAIConfig(),
    gnapi: hasGnapiRuntimeConfig(),
    cron: hasCronConfig(),
  };
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return {
    realMode,
    auth: checks.auth ? "configured" : "missing",
    supabase: checks.supabase ? "configured" : "missing",
    openai: checks.openai ? "configured" : "missing",
    gnapi: checks.gnapi ? "configured" : "missing",
    cron: checks.cron ? "configured" : "missing",
    missing,
    readyForRealUse: realMode ? missing.length === 0 : true,
  };
}

export function assertRealDataStoreReady() {
  if (isRealMode() && !hasSupabaseRuntimeConfig()) {
    throw new Error(
      "Supabase is required in real mode. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
}

export function assertOpenAIReady() {
  if (isRealMode() && !hasOpenAIConfig()) {
    throw new Error("OpenAI is required in real mode. Configure OPENAI_API_KEY.");
  }
}

export function assertGnapiReady() {
  if (isRealMode() && !hasGnapiRuntimeConfig()) {
    throw new Error("GNAPI is required in real mode. Configure GNAPI_SEND_URL and GNAPI_API_KEY.");
  }
}
