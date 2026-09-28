import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "scly.io", template: "%s | scly.io" },
  description: "Science Olympiad team ratings.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="logo" aria-label="scly.io home">
              <Image src="/logo.png" alt="scly.io" width={125} height={40} priority />
            </Link>
            <form action="/search" className="topsearch" role="search">
              <input name="q" required minLength={2} placeholder="Search schools, teams, tournaments" aria-label="Search" />
            </form>
            <nav className="nav">
              <Link href="/rankings">Rankings</Link>
              <Link href="/teams">Teams</Link>
              <Link href="/tournaments">Tournaments</Link>
              <Link href="/compare">Compare</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
