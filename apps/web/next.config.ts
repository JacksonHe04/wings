import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // firebase-admin 依赖链（jwks-rsa → jose）存在 CJS require ESM 的互操作问题，
  // 不能被 Turbopack 打包，必须作为外部依赖在运行时从 node_modules require。
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
