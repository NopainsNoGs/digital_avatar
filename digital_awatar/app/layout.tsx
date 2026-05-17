import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "交通终端数字人服务台",
  description: "面向交通运输线下终端大屏的数字人交互服务台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
