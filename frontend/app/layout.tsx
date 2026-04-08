import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Open Hours - Scheduling POC",
  description: "Rule-based availability scheduling system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.className} h-full antialiased`}
    >
      <body className="min-h-full bg-gray-50">{children}</body>
    </html>
  );
}
