// wings API 健康检查。M1 起在 app/api/ 下逐步实现全集：
// 建群 / 加成员 / 发消息（compare-and-send）/ profile CAS / goalPrompts / presence / close / token 签发。
// 所有写路径在服务端以 firebase-admin 执行（事务与 CAS 只信任服务端），
// 客户端对 Firestore 仅保留直连读与 presence 自更新（见 firestore.rules）。
export function GET() {
  return Response.json({ ok: true, service: "wings-api", version: "0.1.0" });
}
