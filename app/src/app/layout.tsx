import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AuroraCraft - Build Without Limits",
  description: "Transform your ideas into Minecraft plugins, mods, Discord bots, and web apps without writing code. AI-powered development platform.",
  keywords: ["AuroraCraft", "Minecraft plugins", "Minecraft mods", "Discord bots", "AI development"],
  openGraph: {
    title: "AuroraCraft - Build Without Limits",
    description: "Transform your ideas into production-ready software with AI.",
    url: "https://auroracraft.xyz",
    siteName: "AuroraCraft",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased bg-[#050508] text-white min-h-screen`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
