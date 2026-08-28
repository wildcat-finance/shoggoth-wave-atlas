import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://shoggoth-wave-atlas.functi0nzer0.chatgpt.site"),
  title: "Shoggoth Wave Atlas · Wildcat Skills",
  description:
    "A live index of Wildcat Skills delivery waves, plus the Wave Atlas maintenance queue kept in its own category.",
  openGraph: {
    title: "Shoggoth Wave Atlas · Wildcat Skills",
    description:
      "A live index of Wildcat Skills delivery waves, plus the Wave Atlas maintenance queue kept in its own category.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Shoggoth Wave Atlas — Wildcat Skills waves and Atlas maintenance",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shoggoth Wave Atlas · Wildcat Skills",
    description:
      "A live index of Wildcat Skills delivery waves, plus the Wave Atlas maintenance queue kept in its own category.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
