import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// 模拟器优先：FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST 存在时
// 无需真实凭据，initializeApp({ projectId }) 即可（本地 e2e 与开发用）。
// 生产（Vercel）从环境变量读取服务账号 JSON。
const isEmulator = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
);

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  if (isEmulator) {
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "wings-inon" });
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT 未配置（生产环境需要服务账号 JSON）");
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

// 惰性初始化：构建期只 import 不执行，凭据缺失的错误在首个真实请求时才抛出。
function lazy<T extends object>(make: () => T): T {
  let instance: T;
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      instance ??= make();
      return Reflect.get(instance, prop, receiver);
    },
  });
}

const app = lazy(() => initApp());

export const db = lazy(() => getFirestore(app));
export const auth = lazy(() => getAuth(app));

export const AGENTS_COLLECTION = "agents";
export const USERS_COLLECTION = "users";
export const GROUPS_COLLECTION = "groups";
export function membersCol(groupId: string) {
  return db.collection(GROUPS_COLLECTION).doc(groupId).collection("members");
}
export function messagesCol(groupId: string) {
  return db.collection(GROUPS_COLLECTION).doc(groupId).collection("messages");
}
export function presenceCol(groupId: string) {
  return db.collection(GROUPS_COLLECTION).doc(groupId).collection("presence");
}
export function goalPromptsCol(groupId: string) {
  return db.collection(GROUPS_COLLECTION).doc(groupId).collection("goalPrompts");
}
