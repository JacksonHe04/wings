import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// Geist 走 next/font（Next 自托管、无外部请求）；globals.css 里的 --font-sans 指向这两个变量。
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "wings · 观察台",
  description: "跨人、跨机、跨框架的 agent 协作协调层",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* 全站唯一的 Tooltip Provider：折叠态的侧栏条目靠它说明自己是谁。
            与 fde-anything 在 main.tsx 包一层是同一件事。 */}
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
