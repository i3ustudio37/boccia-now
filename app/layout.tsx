import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "5071｜地板滾球練習紀錄",
  description: "記錄每一次投球、八方位落點、撿球與練習時間。",
  icons: { icon: "/5071/logo-mark-crimson.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0E0E0D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
