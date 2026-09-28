import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "scly.io", template: "%s - scly.io" },
  description: "Science Olympiad team ratings.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header>
          <b>
            <Link href="/">scly.io</Link>
          </b>{" "}
          | <Link href="/rankings">Rankings</Link> | <Link href="/teams">Teams</Link> |{" "}
          <Link href="/tournaments">Tournaments</Link> | <Link href="/compare">Compare</Link>
          <form action="/search" style={{ display: "inline", marginLeft: 12 }}>
            <input name="q" size={20} required minLength={2} aria-label="Search" /> <button>Search</button>
          </form>
        </header>
        <hr />
        <main>{children}</main>
      </body>
    </html>
  );
}
