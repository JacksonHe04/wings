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
// 注意 getAuth/getFirestore 会对 app 做 instanceof 校验，Proxy 只能用于推迟
// initApp 本身，db/auth 必须在首次访问时拿到真实 app 实例。
// 方法要绑回真实实例：@google-cloud/firestore 会把 db 交给 BulkWriter 等内部对象
// （recursiveDelete 走这条路），this 若还是 Proxy，私有状态与写回都会落到空壳 target 上。
function lazy<T extends object>(make: () => T): T {
  let instance: T;
  return new Proxy({} as T, {
    get(_target, prop) {
      instance ??= make();
      const value = Reflect.get(instance, prop);
      return typeof value === "function" ? value.bind(instance) : value;
    },
    set(_target, prop, value) {
      instance ??= make();
      return Reflect.set(instance, prop, value);
    },
  });
}

let _app: ReturnType<typeof initApp> | undefined;
function app() {
  return (_app ??= initApp());
}

export const db = lazy(() => getFirestore(app()));
export const auth = lazy(() => getAuth(app()));

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
