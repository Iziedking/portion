"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ waiting }: { waiting: number }) {
  const path = usePathname();
  const item = (href: string, label: string, count?: number) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link href={href} aria-current={active ? "page" : undefined}>
        <span>{label}</span>
        {count ? <span className="count num">{count}</span> : null}
      </Link>
    );
  };
  return (
    <nav className="nav">
      {item("/", "Today", waiting)}
      {item("/plan", "Plan")}
      {item("/payments", "Payments")}
      {item("/spend", "Pay from a pot")}
      {item("/overview", "Where it went")}
      <div className="nav-label">Setup</div>
      {item("/settings", "Destinations and limits")}
      <Link href="/pay" target="_blank">
        <span>Client pay page</span>
      </Link>
    </nav>
  );
}
