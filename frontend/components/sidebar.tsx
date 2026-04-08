"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Clock,
  Users,
  Briefcase,
  UserCircle,
  ClipboardList,
} from "lucide-react";
import { clsx } from "clsx";
import ThemeToggle from "./theme-toggle";

const NAV_ITEMS = [
  { href: "/admin/open-hours", label: "Open Hours", icon: Clock },
  { href: "/admin/calendar", label: "Calendar", icon: Calendar },
  { href: "/admin/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/admin/staff", label: "Staff", icon: Users },
  { href: "/admin/services", label: "Services", icon: Briefcase },
  { href: "/admin/customers", label: "Customers", icon: UserCircle },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 h-screen flex-shrink-0 border-r border-gray-200/60 bg-white/80 backdrop-blur-sm flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">
          Scheduling
        </h2>
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200",
                active
                  ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              )}
            >
              <item.icon
                className={clsx(
                  "w-[18px] h-[18px] transition-colors duration-200",
                  active
                    ? "text-indigo-600"
                    : "text-gray-400 group-hover:text-gray-600"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-gray-100 space-y-2">
        <ThemeToggle />
      </div>
    </aside>
  );
}
