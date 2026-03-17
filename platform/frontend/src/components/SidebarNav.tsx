import { NavLink } from "react-router-dom";

export interface NavItem {
  label: string;
  path: string;
}

interface SidebarNavProps {
  items: NavItem[];
}

export function SidebarNav({ items }: SidebarNavProps) {
  return (
    <nav aria-label="Primary" className="sidebar-nav">
      {items.map((item) => (
        <NavLink
          key={item.path}
          className={({ isActive }) =>
            `sidebar-link${isActive ? " sidebar-link-active" : ""}`
          }
          to={item.path}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
