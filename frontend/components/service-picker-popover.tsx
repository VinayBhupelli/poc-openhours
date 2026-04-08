"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { clsx } from "clsx";

export interface ServiceItemLite {
  id: string;
  name: string;
  duration_minutes?: number;
}

/** Empty selectedIds = all services (same as backend). */
export function servicePickerLabel(
  selectedIds: string[],
  services: ServiceItemLite[]
): string {
  if (services.length === 0) return "No services";
  if (selectedIds.length === 0 || selectedIds.length === services.length) {
    return "All services";
  }
  if (selectedIds.length === 1) {
    const n = services.find((s) => s.id === selectedIds[0])?.name;
    return n ?? "1 service";
  }
  return `${selectedIds.length} services`;
}

const PANEL_W = 288;
const PANEL_MAX_H = 320;

type Props = {
  services: ServiceItemLite[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export default function ServicePickerPopover({
  services,
  selectedIds,
  onChange,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveSet = useMemo(() => {
    if (selectedIds.length === 0) return new Set(services.map((s) => s.id));
    return new Set(selectedIds);
  }, [selectedIds, services]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, search]);

  const allSelected =
    services.length > 0 &&
    (selectedIds.length === 0 || selectedIds.length === services.length);

  const partial =
    selectedIds.length > 0 && selectedIds.length < services.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = partial;
  }, [partial, selectedIds.length, services.length]);

  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    let left = rect.right - PANEL_W;
    let top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (left + PANEL_W > window.innerWidth - 8) {
      left = window.innerWidth - PANEL_W - 8;
    }
    if (top + PANEL_MAX_H > window.innerHeight - 8) {
      top = Math.max(8, rect.top - PANEL_MAX_H - 6);
    }
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollResize = () => updatePosition();
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggleOne(id: string) {
    const base =
      selectedIds.length === 0 ? services.map((s) => s.id) : [...selectedIds];
    const s = new Set(base);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    const arr = Array.from(s);
    if (arr.length === 0) {
      onChange(services[0] ? [services[0].id] : []);
      return;
    }
    if (arr.length === services.length) {
      onChange([]);
      return;
    }
    onChange(arr);
  }

  function onSelectAllChange(checked: boolean) {
    if (checked) {
      onChange([]);
    } else {
      if (services[0]) onChange([services[0].id]);
    }
  }

  const label = servicePickerLabel(selectedIds, services);

  const panel =
    open &&
    services.length > 0 &&
    mounted &&
    createPortal(
      <div
        ref={panelRef}
        className="fixed z-[200] w-72 rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/10"
        style={{
          top: pos.top,
          left: pos.left,
          maxHeight: PANEL_MAX_H,
        }}
        role="listbox"
      >
        <div className="p-2 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Type to search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 outline-none"
              autoFocus
            />
          </div>
        </div>
        <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50 shrink-0">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onSelectAllChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
          />
          <span className="text-sm font-medium text-gray-800">Select All</span>
        </label>
        <div
          className="overflow-y-auto py-1 overscroll-contain"
          style={{ maxHeight: 220 }}
        >
          {filtered.map((svc) => {
            const checked = effectiveSet.has(svc.id);
            return (
              <label
                key={svc.id}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-sky-50/80"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOne(svc.id)}
                  className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-sm text-gray-800 flex-1 truncate">
                  {svc.name}
                </span>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-gray-400">
              No matches
            </p>
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <div className={clsx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || services.length === 0}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={clsx(
          "inline-flex items-center gap-0.5 text-xs font-medium text-sky-600 hover:text-sky-800 max-w-[180px] truncate text-left",
          disabled && "opacity-40 cursor-not-allowed"
        )}
        title={label}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
      </button>
      {panel}
    </div>
  );
}
