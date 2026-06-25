import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth";
import { getRuntimeConfigStatus, isRealMode } from "@/lib/config";

export async function requireAppReadyAndAuthenticated() {
  const status = getRuntimeConfigStatus();
  if (status.realMode && !status.readyForRealUse) {
    return NextResponse.json(
      {
        error: "System setup is incomplete",
        missing: status.missing,
      },
      { status: 503 },
    );
  }

  if (status.realMode) {
    return requireAuthenticated();
  }

  return null;
}

export function requireRealSystemReady() {
  const status = getRuntimeConfigStatus();
  if (status.realMode && !status.readyForRealUse) {
    return NextResponse.json(
      {
        error: "System setup is incomplete",
        missing: status.missing,
      },
      { status: 503 },
    );
  }

  return null;
}

export function requireCronSecret(request: Request) {
  const setupError = requireRealSystemReady();
  if (setupError) {
    return setupError;
  }

  if (!isRealMode()) {
    return null;
  }

  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("x-cron-secret");
  if (!expected || actual !== expected) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  return null;
}
