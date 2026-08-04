import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Radar", icon: "⌁" },
  { to: "/opportunities", label: "Opportunities", icon: "◇" },
  { to: "/companies", label: "Companies", icon: "▦" },
  { to: "/outreach", label: "Outreach", icon: "↗" },
  { to: "/monitor", label: "Monitor", icon: "◉" },
  { to: "/settings", label: "Settings", icon: "⚙" },
] as const;

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <span className="brand-mark">
          <span />
        </span>
        <span>
          <strong>Opportunity Radar</strong>
          <small>Signal intelligence</small>
        </span>
      </Link>
      <nav className="nav">
        <p className="nav-label">Workspace</p>
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            activeOptions={{ exact: link.to === "/" }}
            activeProps={{ className: "active" }}
          >
            <span className="nav-icon">{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span className="live-dot" />
        <div>
          <strong>Static demo</strong>
          <small>Sample data · no backend</small>
        </div>
      </div>
    </aside>
  );
}
