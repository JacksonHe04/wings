"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "demo.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "wings-inon",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "demo-app-id",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const clientAuth = getAuth(app);
export const clientDb = getFirestore(app);

// 显式声明本地持久化：个别环境（如自动化浏览器）下 SDK 会静默退回内存持久化，
// 表现为刷新即掉登录。
void setPersistence(clientAuth, browserLocalPersistence).catch(() => undefined);

// 本地开发/e2e：连接 Firebase 模拟器（无需真实项目凭据）
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "1"
) {
  if (!("wingsEmulatorConnected" in window)) {
    (window as { wingsEmulatorConnected?: boolean }).wingsEmulatorConnected = true;
    connectAuthEmulator(clientAuth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(clientDb, "localhost", 8080);
  }
}
