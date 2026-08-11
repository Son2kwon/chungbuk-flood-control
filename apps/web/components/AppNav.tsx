"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "상황실" },
  { href: "/field", label: "현장" },
  { href: "/notify", label: "주민 알림" },
  { href: "/audit", label: "감사 로그" },
  { href: "/compare", label: "비교" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "app-nav-link app-nav-link-active" : "app-nav-link"}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
