import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Convince Pho-pho to win $100",
  description: "Text Pho-pho your best pitch. Live leaderboard, real payouts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
