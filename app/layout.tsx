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
  title: "MAI Coach | AI Golf Coaching",
  description: "AI-powered golf coaching that connects Coach guidance, Student practice, and measurable progress.",
  applicationName: "MAI Coach",
  openGraph: {
    title: "MAI Coach | AI Golf Coaching",
    description: "AI-powered golf coaching that connects Coach guidance, Student practice, and measurable progress.",
    siteName: "MAI Coach",
    images: [
      {
        url: "/brand/mai-coach/mai-coach-social-1200x630-v3.png",
        width: 1200,
        height: 630,
        alt: "MAI Coach — AI Golf Coaching",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MAI Coach | AI Golf Coaching",
    description: "AI-powered golf coaching that connects Coach guidance, Student practice, and measurable progress.",
    images: ["/brand/mai-coach/mai-coach-social-1200x630-v3.png"],
  },
  icons: {
    apple: "/brand/mai-coach/mai-coach-apple-touch-icon-v3.png",
    icon: [
      { url: "/brand/mai-coach/mai-coach-favicon-16-v3.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/mai-coach/mai-coach-favicon-32-v3.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/mai-coach/mai-coach-favicon-48-v3.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/brand/mai-coach/mai-coach-favicon-32-v3.png",
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
