"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Radar", icon: "⌁" },
  { href: "/opportunities", label: "Opportunities", icon: "◇" },
  { href: "/companies", label: "Companies", icon: "▦" },
  { href: "/outreach", label: "Outreach", icon: "↗" },
  { href: "/monitor", label: "Monitor", icon: "◉" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Nav() {
  const pathname = usePathname();
  return <aside className="sidebar">
    <Link href="/" className="brand">
      <span className="brand-mark"><span /></span>
      <span><strong>Opportunity Radar</strong><small>Signal intelligence</small></span>
    </Link>
    <nav className="nav">
      <p className="nav-label">Workspace</p>
      {links.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
        <span className="nav-icon">{link.icon}</span><span>{link.label}</span>
      </Link>)}
    </nav>
    <div className="sidebar-foot">
      <span className="live-dot" />
      <div><strong>Local & supervised</strong><small>No automatic outreach</small></div>
    </div>
  </aside>;
}
