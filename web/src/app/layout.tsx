import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Dynamic rendering is required for the per-request CSP nonce (middleware).
export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Job Forward — Resume Builder",
  description:
    "Narrate your experience, match it against a job posting, and improve it.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${inter.className} bg-white text-neutral-900`}>
        {children}
      </body>
    </html>
  );
}
