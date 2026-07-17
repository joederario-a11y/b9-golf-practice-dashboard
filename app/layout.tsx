import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MAI Coach | Your AI Golf Coach",
  description: "Turn your golf swing data into clear coaching, personalized drills and actionable feedback with MAI Coach.",
  applicationName: "MAI Coach",
  openGraph: {
    title: "MAI Coach | Your AI Golf Coach",
    description: "Turn your golf swing data into clear coaching, personalized drills and actionable feedback with MAI Coach.",
    images: ["/brand/mai-coach/mai-coach-og-image.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "MAI Coach | Your AI Golf Coach",
    description: "Turn your golf swing data into clear coaching, personalized drills and actionable feedback with MAI Coach.",
    images: ["/brand/mai-coach/mai-coach-og-image.svg"],
  },
  icons: {
    apple: "/brand/mai-coach/mai-coach-logo-mark.svg",
    icon: "/brand/mai-coach/mai-coach-logo-mark.svg",
    shortcut: "/brand/mai-coach/mai-coach-logo-mark.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#10171F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
