import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { Shell } from "@/components/shell";
import { YardProvider } from "@/components/yard-provider";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm",
});

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
  themeColor: "#1f4a3e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <ThemeProvider forcedTheme="light" attribute="class">
          <YardProvider>
            <Shell>{children}</Shell>
          </YardProvider>
          <Toaster position="top-center" />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
