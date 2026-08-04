import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Opportunity Radar",
  description: "Evidence-grounded client signal detection and outreach intelligence",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="app-shell"><Nav /><main className="main">{children}</main></div></body></html>;
}
