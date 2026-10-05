"use client";

/**
 * 用服务端换来的自定义令牌登入，并把账号名补成 Firebase 用户的显示名。
 *
 * 两条登录路径（API Key、FDEA 票据）在这里合流——它们的差别只到
 * 「换到什么 uid」为止（见 `lib/server/identity.ts` 的映射层），登入动作本身完全一样。
 */
import { signInWithCustomToken, updateProfile } from "firebase/auth";
import { clientAuth } from "./firebase";

export interface SessionGrant {
  token: string;
  /** 来源侧的账号名；新身份没有 displayName 时用它补上，否则界面只能显示 uid 前几位 */
  account?: string | null;
}

export async function signInWithSession(grant: SessionGrant): Promise<void> {
  const credential = await signInWithCustomToken(clientAuth, grant.token);
  if (grant.account && !credential.user.displayName) {
    await updateProfile(credential.user, { displayName: grant.account });
  }
}
