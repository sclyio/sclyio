import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "scly.io — Universal SciOly Rating", template: "%s · scly.io" },
  description:
    "Experimental Science Olympiad team ratings among indexed Duosmium tournaments: rankings, team profiles, tournament fields, and transparent methodology.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
