import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "GenFlows Copywriter Agent",
  description:
    "Terminal-style, Claude-powered pipeline: Research → Strategy → Copywriting → ICP brutal test.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-mono antialiased bg-background text-foreground selection:bg-primary/30">
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
