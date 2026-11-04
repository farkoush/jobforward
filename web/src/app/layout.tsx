import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Dynamic rendering is required for the per-request CSP nonce (middleware).
export const dynamic = "force-dynamic";

/* Phase 14 (spec §11.2): the three platform fonts are VENDORED in
   web/src/fonts/ (with their OFL licenses) and load via next/font/local —
   build-time bundling, ZERO external font requests at runtime (P8;
   product-owner decision 2026-11-05). The CSS variables they expose are
   mapped in globals.css (--font-sans / --font-display / --font-mono). */
const sourceSans = localFont({
  src: "../fonts/SourceSans3[wght].ttf",
  weight: "200 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const fraunces = localFont({
  src: "../fonts/Fraunces[SOFT,WONK,opsz,wght].ttf",
  weight: "100 900",
  style: "normal",
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../fonts/JetBrainsMono[wght].ttf",
  weight: "100 800",
  style: "normal",
  variable: "--font-mono",
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
      <body
        className={`${sourceSans.variable} ${fraunces.variable} ${jetbrainsMono.variable} bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
