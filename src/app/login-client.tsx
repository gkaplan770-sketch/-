"use client";

import { FormEvent, useState } from "react";
import { Lock, LogIn } from "lucide-react";

export default function LoginClient() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setError("הסיסמה לא נכונה או שהמערכת לא הוגדרה.");
      setBusy(false);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-4 text-[#1c1b18]">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-[#ded6c8] bg-white p-6 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#174c3b] text-white">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">כניסה למנדי בוטי</h1>
        <p className="mt-2 text-sm leading-6 text-[#686158]">
          המערכת במצב אמת ודורשת סיסמת מנהל.
        </p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="סיסמת מנהל"
          className="mt-5 h-11 w-full rounded-lg border border-[#d8d0c4] bg-[#fbfaf7] px-3 text-sm outline-none focus:border-[#1f7a5a]"
        />
        {error ? <div className="mt-3 text-sm font-bold text-[#8a2929]">{error}</div> : null}
        <button
          disabled={busy}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#203864] px-4 text-sm font-bold text-white transition hover:bg-[#182b4d] disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" />
          כניסה
        </button>
      </form>
    </main>
  );
}
