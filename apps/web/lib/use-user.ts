"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { clientAuth } from "./firebase";

/** 当前登录的人类用户 + ID token 获取器（API 调用用）。 */
export function useUser(): {
  user: User | null;
  loading: boolean;
  idToken: () => Promise<string>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(clientAuth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return {
    user,
    loading,
    idToken: async () => {
      const current = clientAuth.currentUser;
      if (!current) throw new Error("未登录");
      return current.getIdToken();
    },
  };
}
