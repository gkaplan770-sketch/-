import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_COOKIE, authCookieOptions, createSessionToken } from "@/lib/auth";
import { hasAuthConfig } from "@/lib/config";

const loginSchema = z.object({
  password: z.string(),
});

export async function POST(request: Request) {
  if (!hasAuthConfig()) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 503 });
  }

  const payload = loginSchema.parse(await request.json());
  if (payload.password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await createSessionToken(), authCookieOptions());
  return response;
}
