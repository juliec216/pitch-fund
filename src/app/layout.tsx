import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Convince Hugh — The $100 Fund",
  description: "Text your way into the fund. Live leaderboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
