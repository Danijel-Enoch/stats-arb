import type { Metadata } from "next";
import DocsBody from "@/components/DocsBody";

export const metadata: Metadata = {
  title: "Help & docs · Perp Stat-Arb Scanner",
  description: "How the scanner, the charts and the backtest work, and what they do not tell you.",
};

export default function DocsPage() {
  return <DocsBody />;
}
