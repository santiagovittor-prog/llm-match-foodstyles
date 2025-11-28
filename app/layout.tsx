import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FoodStyles – LLM Match",
  description: "LLM-based duplicate detection for FoodStyles data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
