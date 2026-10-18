import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { Shell } from "@/components/shell";
import { SyncProvider } from "@/components/sync/sync-provider";
import { YardProvider } from "@/components/yard-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Yardline",
    template: "%s · Yardline",
  },
  description: "Gate, yard, and door board for a single warehouse.",
  applicationName: "Yardline",
  appleWebApp: {
    capable: true,
    title: "Yardline",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e40af",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ThemeProvider forcedTheme="light" attribute="class">
          <YardProvider>
            <SyncProvider>
              <Shell>{children}</Shell>
            </SyncProvider>
          </YardProvider>
          <Toaster position="top-center" />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
