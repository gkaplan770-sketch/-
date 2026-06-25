import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasAuthConfig } from "@/lib/config";

export const AUTH_COOKIE = "mendy_session";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export async function createSessionToken() {
  const issuedAt = Date.now();
  const payload = String(issuedAt);
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token?: string | null) {
  if (!hasAuthConfig() || !token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) {
    return false;
  }

  return signature === (await sign(payload));
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function requireAuthenticated() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

async function sign(payload: string) {
  const secret = process.env.MENDY_SESSION_SECRET || "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64Url(signature);
}

function base64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
