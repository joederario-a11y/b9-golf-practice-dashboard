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
    siteName: "MAI Coach",
    images: [
      {
        url: "/brand/mai-coach/mai-coach-og-v2.png",
        width: 1200,
        height: 630,
        alt: "MAI Coach — My AI Golf Coach",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MAI Coach | Your AI Golf Coach",
    description: "Turn your golf swing data into clear coaching, personalized drills and actionable feedback with MAI Coach.",
    images: ["/brand/mai-coach/mai-coach-og-v2.png"],
  },
  icons: {
    apple: "/brand/mai-coach/mai-coach-apple-touch-icon-v2.png",
    icon: [
      { url: "/brand/mai-coach/mai-coach-icon-16-v2.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/mai-coach/mai-coach-icon-32-v2.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/brand/mai-coach/mai-coach-icon-32-v2.png",
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
