import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/use-theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Perp Stat-Arb Scanner",
  description:
    "Correlated-pair and spread scanner for FX, commodity, index and equity perps, with provider failover.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // No data-theme here on purpose: an unstamped root means the viewer's OS
    // preference decides, and the script below stamps it only when they have
    // chosen explicitly. suppressHydrationWarning is required rather than
    // cosmetic — the script's entire job is to mutate this element before
    // React hydrates, so the attribute is expected to differ from the server
    // HTML. It suppresses the warning on this element only.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
