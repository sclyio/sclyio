"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/verifications", "Request queue"],
  ["/admin/records", "All seasons"],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
