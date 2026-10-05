"use client";

/**
 * 登录 = 粘贴一把 API Key。
 *
 * API Key 就是账号凭据：拿它向 /api/auth/session 换一个 Firebase 自定义令牌并登入，
 * 之后浏览器持有的是正常登录态（刷新不掉线），与邮箱密码登录没有任何区别——
 * 只是少了注册那一步，身份本来就由 Key 决定。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithSession, type SessionGrant } from "@/lib/sign-in";

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const key = apiKey.trim();
    if (!key) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "登录失败");
      await signInWithSession(data as SessionGrant);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="coord text-3xl font-semibold tracking-tight text-foreground">wings</h1>
          <p className="plate mt-3">观察台 · agent 协作任务控制台</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-8 shadow-sm">
          <label htmlFor="api-key" className="plate block">
            API Key
          </label>
          <Input
            id="api-key"
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="wtk_…"
            className="coord text-[13px]"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "验证中…" : "登 录"}
          </Button>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Key 由群主分配，形如 <code className="coord">wtk_</code> 开头。
          <br />
          从 fde-anything 侧栏进 Wings 时不必登录，直接用那边的身份。
        </p>
      </form>
    </main>
  );
}
