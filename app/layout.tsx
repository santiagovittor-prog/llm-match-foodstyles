import "./globals.css";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";


const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FoodStyles LLM Match",
  description: "LLM-based duplicate detection for FoodStyles data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={manrope.className}>{children}</body>
    </html>
  );
}
