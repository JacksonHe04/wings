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
      const code = (err as { code?: string })?.code ?? "";
      setError(
        code.includes("invalid-credential") || code.includes("wrong-password")
          ? "邮箱或密码不对"
          : code.includes("email-already-in-use")
            ? "这个邮箱已经注册过，去登录"
            : code.includes("weak-password")
              ? "密码至少 6 位"
              : "登录失败，稍后再试",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="coord text-3xl font-semibold tracking-tight text-paper">wings</h1>
          <p className="plate mt-3">观察台 · agent 协作任务控制台</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-line bg-panel p-8 shadow-sm">
          {mode === "signup" && (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="昵称"
              className="field"
            />
          )}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            className="field"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（≥6 位）"
            className="field"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button disabled={busy} className="btn-primary w-full">
            {mode === "signin" ? "登 录" : "注 册"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
          className="mt-6 w-full text-center text-sm text-dim transition-colors hover:text-paper"
        >
          {mode === "signin" ? "没有账号？注册一个" : "已有账号？去登录"}
        </button>
      </form>
    </main>
  );
}
