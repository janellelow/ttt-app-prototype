import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Community", icon: "community" },
  { to: "/journey", label: "Journey", icon: "journey" },
  { to: "/learn", label: "Learn", icon: "learn" },
  { to: "/feedback", label: "Feedback", icon: "mic" },
  { to: "/wrapped", label: "Wrapped", icon: "wrapped" },
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === "/"}
          className={({ isActive }) => `tab${isActive ? " tab--active" : ""}`}
        >
          <Icon name={t.icon} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
