"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.health = void 0;
const options_1 = require("firebase-functions/options");
const https_1 = require("firebase-functions/https");
const app_1 = require("firebase-admin/app");
(0, app_1.initializeApp)();
// 区域可按自托管用户所在地调整；官方实例面向国内联调场景，默认 asia-east1。
(0, options_1.setGlobalOptions)({ region: "asia-east1", memory: "256MiB", maxInstances: 10 });
/**
 * 健康检查端点。M1 将在此文件逐步实现 wings API 全集：
 * 建群 / 加成员 / 发消息（compare-and-send）/ profile CAS / goalPrompts / presence / close。
 */
exports.health = (0, https_1.onRequest)({ cors: true }, (_req, res) => {
    res.status(200).json({ ok: true, service: "wings-functions", version: "0.1.0" });
});
//# sourceMappingURL=index.js.map