"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { clientAuth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(clientAuth, email, password);
        if (displayName) await updateProfile(cred.user, { displayName });
      } else {
        await signInWithEmailAndPassword(clientAuth, email, password);
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace("Firebase: ", "") : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          wings
          <span className="ml-2 text-sm font-normal text-zinc-500">观察台</span>
        </h1>
        {mode === "signup" && (
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="昵称"
            className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码（≥6 位）"
          className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {mode === "signin" ? "登录" : "注册"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
        >
          {mode === "signin" ? "没有账号？注册一个" : "已有账号？去登录"}
        </button>
      </form>
    </main>
  );
}
