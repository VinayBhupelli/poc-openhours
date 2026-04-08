"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  X,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  listStaff,
  listServices,
  listRules,
  createRule,
  updateRule,
  deactivateRule,
  getAdminMergedOpenHours,
  mutateRule,
} from "@/lib/api";
import { getClientTimeZone } from "@/lib/datetime";
import Modal from "@/components/modal";
import ServicePickerPopover from "@/components/service-picker-popover";
import {
  startOfWeek,
  addDays,
  addWeeks,
  format,
  parseISO,
  getDay,
  getDate,
  getMonth,
} from "date-fns";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_RRULE_MAP: Record<number, string> = {
  0: "SU", 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA",
};

const BYDAY_UI = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/** Mon=0 … Sun=6 — matches DAYS order */
const CODE_TO_DAYIDX: Record<string, number> = {
  MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6,
};

interface StaffMember {
  id: string;
  display_name: string;
  email: string;
  is_active: boolean;
}
interface ServiceItem {
  id: string;
  name: string;
  duration_minutes: number;
  is_active: boolean;
}
interface Rule {
  id: string;
  staff_id: string;
  rule_type?: "weekly" | "custom";
  timezone: string;
  start_local: string;
  end_local: string;
  rrule: string;
  effective_from: string;
  effective_until: string | null;
  default_capacity: number;
  is_active: boolean;
  service_ids?: string[];
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  /** empty = all services */
  serviceIds: string[];
  /** Set when loaded from DB (weekly FREQ=WEEKLY single-day rules) */
  ruleId?: string;
}

interface MergedSlot {
  date: string; // yyyy-MM-dd (in time_zone supplied by the client)
  start: string; // UTC ISO
  end: string; // UTC ISO
  service_ids: string[];
  rule_id?: string;
  occurrence_start?: string; // original series occurrence start (UTC ISO)
}

interface WeeklyRow {
  enabled: boolean;
  slots: TimeSlot[];
}

interface CustomSlotRow {
  key: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  serviceIds: string[];
}

const RECURRENCE_OPTIONS = [
  { label: "Does not repeat", value: "" },
  { label: "Daily", value: "FREQ=DAILY;INTERVAL=1" },
  { label: "Weekly", value: "FREQ=WEEKLY;INTERVAL=1" },
  { label: "Every weekday (Mon–Fri)", value: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Monthly", value: "FREQ=MONTHLY;INTERVAL=1" },
  { label: "Custom…", value: "__CUSTOM__" },
];

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const COLORS = [
  "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-blue-500",
  "bg-purple-500", "bg-pink-500", "bg-cyan-500", "bg-orange-500",
];

function formatTime(isoStr: string): string {
  try {
    return format(parseISO(isoStr), "h:mma").toLowerCase();
  } catch {
    return "";
  }
}

function ruleMatchesDay(rule: Rule, date: Date): boolean {
  const rrule = rule.rrule || "";
  const dayOfWeek = getDay(date);
  const dayCode = DAY_RRULE_MAP[dayOfWeek];

  if (rrule.includes("FREQ=MONTHLY")) {
    const anchor = parseISO(rule.start_local);
    return getDate(date) === getDate(anchor);
  }
  if (rrule.includes("FREQ=YEARLY")) {
    const anchor = parseISO(rule.start_local);
    return (
      getMonth(date) === getMonth(anchor) &&
      getDate(date) === getDate(anchor)
    );
  }
  if (rrule.includes("FREQ=DAILY") && rrule.includes("COUNT=1")) {
    const anchor = parseISO(rule.start_local);
    return (
      getDate(date) === getDate(anchor) &&
      getMonth(date) === getMonth(anchor)
    );
  }
  if (rrule.includes("FREQ=DAILY")) return true;
  if (rrule.includes("BYDAY=")) {
    const match = rrule.match(/BYDAY=([A-Za-z,]+)/i);
    if (match) return match[1].toUpperCase().split(",").includes(dayCode);
  }
  if (rrule.includes("FREQ=WEEKLY") && !rrule.includes("BYDAY=")) {
    const ruleStart = parseISO(rule.start_local);
    return getDay(ruleStart) === dayOfWeek;
  }
  if (rrule.includes("FREQ=WEEKLY")) {
    const match = rrule.match(/BYDAY=([A-Za-z,]+)/i);
    if (match) return match[1].toUpperCase().split(",").includes(dayCode);
  }
  return false;
}

function ruleEffectiveDayKey(r: Rule): string {
  const v = r.effective_from as unknown;
  if (typeof v === "string") return v.slice(0, 10);
  if (
    v &&
    typeof v === "object" &&
    "Time" in v &&
    typeof (v as { Time: string }).Time === "string"
  ) {
    return String((v as { Time: string }).Time).slice(0, 10);
  }
  return "";
}

function effectiveUntilLabel(effectiveUntil: unknown): string | null {
  if (effectiveUntil == null || effectiveUntil === "") return null;
  let dateStr: string | null = null;
  if (typeof effectiveUntil === "string") {
    dateStr = effectiveUntil.slice(0, 10);
  } else if (typeof effectiveUntil === "object" && effectiveUntil) {
    const v = effectiveUntil as any;
    if (typeof v.Time === "string") dateStr = v.Time.slice(0, 10);
  }
  if (!dateStr) return null;
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return null;
  }
}

function rruleSummary(rrule: string, effectiveUntil?: unknown): string {
  if (!rrule) return "Does not repeat";

  let base: string;
  if (rrule.includes("COUNT=1")) base = "One occurrence";
  else if (rrule.includes("FREQ=DAILY")) base = "Daily";
  else if (rrule.includes("FREQ=MONTHLY")) base = "Monthly";
  else if (rrule.includes("FREQ=YEARLY")) base = "Yearly";
  else if (rrule.includes("FREQ=WEEKLY")) {
    const m = rrule.match(/BYDAY=([A-Za-z,]+)/);
    if (m) {
      const days = m[1]
        .toUpperCase()
        .split(",")
        .map((c) => {
          const map: Record<string, string> = {
            MO: "Mon",
            TU: "Tue",
            WE: "Wed",
            TH: "Thu",
            FR: "Fri",
            SA: "Sat",
            SU: "Sun",
          };
          return map[c] || c;
        });

      // Match Google-style phrasing for common case.
      const upper = m[1].toUpperCase().split(",").filter(Boolean);
      const isWeekdays =
        upper.includes("MO") &&
        upper.includes("TU") &&
        upper.includes("WE") &&
        upper.includes("TH") &&
        upper.includes("FR") &&
        upper.length === 5;
      base = isWeekdays ? "Weekly on weekdays" : `Weekly on ${days.join(", ")}`;
    } else {
      base = "Weekly";
    }
  } else {
    base = rrule;
  }

  const until = effectiveUntilLabel(effectiveUntil);
  if (!until) return base;
  if (base === "Does not repeat" || base === "One occurrence") return base;
  return `${base}, until ${until}`;
}

function occurrenceStartISO(rule: Rule, day: Date): string {
  const t = parseISO(rule.start_local);
  const utc = Date.UTC(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    t.getUTCHours(),
    t.getUTCMinutes(),
    t.getUTCSeconds(),
    0
  );
  return new Date(utc).toISOString();
}

function serviceCountLabel(rule: Rule, allServices: ServiceItem[]): number {
  const n = rule.service_ids?.length ?? 0;
  if (n > 0) return n;
  return allServices.length;
}

function weeklySingleDayCode(rrule: string): string | null | "MULTI" {
  if (!rrule.includes("FREQ=WEEKLY")) return null;
  const m = rrule.match(/BYDAY=([A-Za-z,]+)/);
  if (!m) return null;
  const parts = m[1].toUpperCase().split(",").filter(Boolean);
  if (parts.length !== 1) return "MULTI";
  return parts[0];
}

function isWeeklyEditorRule(r: Rule): boolean {
  if (!r.rrule || !r.is_active) return false;
  if (!r.rrule.includes("FREQ=WEEKLY")) return false;
  const code = weeklySingleDayCode(r.rrule);
  return code !== "MULTI";
}

function inferDayCodeFromStart(startLocal: string): string {
  const d = parseISO(startLocal);
  return DAY_RRULE_MAP[getDay(d)];
}

function normServiceKey(ids: string[], allServiceIds: string[]): string {
  const use =
    ids.length > 0 ? [...ids].sort() : [...allServiceIds].sort();
  return use.join(",");
}

function weeklyDayRRule(dayIdx: number): string {
  const jsDay = dayIdx === 6 ? 0 : dayIdx + 1;
  const dayCode = DAY_RRULE_MAP[jsDay];
  return `FREQ=WEEKLY;BYDAY=${dayCode}`;
}

function slotWeeklySig(
  dayIdx: number,
  slot: TimeSlot,
  allServiceIds: string[]
): string {
  return `${weeklyDayRRule(dayIdx)}|${slot.startTime}|${
    slot.endTime
  }|${normServiceKey(slot.serviceIds, allServiceIds)}`;
}

function buildWeeklyRowsFromRules(
  rules: Rule[],
  allServiceIds: string[]
): WeeklyRow[] {
  const perDay: TimeSlot[][] = DAYS.map(() => []);

  for (const r of rules) {
    if (!isWeeklyEditorRule(r)) continue;
    let code = weeklySingleDayCode(r.rrule);
    if (code === null) code = inferDayCodeFromStart(r.start_local);
    if (code === "MULTI" || code === null) continue;
    const dayIdx = CODE_TO_DAYIDX[code];
    if (dayIdx === undefined) continue;

    const startTime = format(parseISO(r.start_local), "HH:mm");
    const endTime = format(parseISO(r.end_local), "HH:mm");
    const svc =
      r.service_ids && r.service_ids.length > 0
        ? r.service_ids
        : [...allServiceIds];

    perDay[dayIdx].push({
      startTime,
      endTime,
      serviceIds: svc,
      ruleId: r.id,
    });
  }

  return DAYS.map((_, i) => {
    const slots = perDay[i];
    if (slots.length === 0) {
      return {
        enabled: false,
        slots: [{ startTime: "09:00", endTime: "17:00", serviceIds: [] }],
      };
    }
    const sorted = [...slots].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    return { enabled: true, slots: sorted };
  });
}

function defaultWeeklyRows(): WeeklyRow[] {
  return DAYS.map((_, i) => ({
    enabled: i < 5,
    slots: [{ startTime: "09:00", endTime: "17:00", serviceIds: [] }],
  }));
}

function getZonedParts(utcDate: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    year: parseInt(get("year") || "0", 10),
    month: parseInt(get("month") || "1", 10),
    day: parseInt(get("day") || "1", 10),
    hour: parseInt(get("hour") || "0", 10),
    minute: parseInt(get("minute") || "0", 10),
    second: parseInt(get("second") || "0", 10),
  };
}

// Convert a "wall clock" time in `timeZone` to a UTC ISO string (stored as UTC in DB).
function localISO(dateStr: string, timeStr: string, timeZone: string): string {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day = parseInt(dateStr.slice(8, 10), 10);

  const hh = parseInt(timeStr.slice(0, 2), 10);
  const mm = parseInt(timeStr.slice(3, 5), 10);

  // Start by treating the wall-clock time as UTC. We'll correct using the timezone offset.
  const desiredAsUTCms = Date.UTC(year, month - 1, day, hh, mm, 0);
  let guess = new Date(desiredAsUTCms);

  // Two iterations usually stabilizes across DST boundaries.
  for (let i = 0; i < 2; i++) {
    const parts = getZonedParts(guess, timeZone);
    const localAsUTCms = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    guess = new Date(guess.getTime() - (localAsUTCms - desiredAsUTCms));
  }

  return guess.toISOString();
}

function ruleEffectiveFrom(r: Rule): string {
  const v = r.effective_from as unknown;
  if (typeof v === "string")
    return v.length > 10 ? v.slice(0, 10) : v;
  if (
    v &&
    typeof v === "object" &&
    "Time" in v &&
    typeof (v as { Time: string }).Time === "string"
  ) {
    return String((v as { Time: string }).Time).slice(0, 10);
  }
  return format(new Date(), "yyyy-MM-dd");
}

function ruleEffectiveUntilAPI(r: Rule): string | undefined {
  if (r.effective_until == null || r.effective_until === "") return undefined;
  if (typeof r.effective_until === "string") return r.effective_until;
  if (
    typeof r.effective_until === "object" &&
    r.effective_until &&
    "Time" in r.effective_until
  ) {
    const t = (r.effective_until as { Time: string }).Time;
    return t ? `${t}T23:59:59Z` : undefined;
  }
  return undefined;
}

function newCustomSlotRow(): CustomSlotRow {
  const d = format(new Date(), "yyyy-MM-dd");
  return {
    key: crypto.randomUUID(),
    startDate: d,
    startTime: "09:00",
    endDate: d,
    endTime: "17:00",
    serviceIds: [],
  };
}

export default function OpenHoursPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [rulesMap, setRulesMap] = useState<Record<string, Rule[]>>({});
  const [mergedSlotsByStaff, setMergedSlotsByStaff] = useState<
    Record<string, MergedSlot[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"weekly" | "custom">("weekly");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [saving, setSaving] = useState(false);

  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>(defaultWeeklyRows());
  const [weeklyRuleById, setWeeklyRuleById] = useState<Record<string, Rule>>({});
  const weeklyRuleIdsAtOpen = useRef<Set<string>>(new Set());
  const weeklySlotSigAtOpen = useRef<Map<string, string>>(new Map());

  const [customRRule, setCustomRRule] = useState("");

  const [customSlots, setCustomSlots] = useState<CustomSlotRow[]>([
    newCustomSlotRow(),
  ]);

  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recInterval, setRecInterval] = useState(1);
  const [recFreq, setRecFreq] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY">("WEEKLY");
  const [recByDayMask, setRecByDayMask] = useState<boolean[]>([
    true, true, true, true, true, false, false,
  ]);
  const [recEndMode, setRecEndMode] = useState<"never" | "on" | "after">("never");
  const [recUntilDate, setRecUntilDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recCount, setRecCount] = useState(10);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRule, setDetailRule] = useState<Rule | null>(null);
  const [detailStaff, setDetailStaff] = useState<StaffMember | null>(null);
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [detailOccurrenceStartISO, setDetailOccurrenceStartISO] = useState<
    string | null
  >(null);
  const [detailSlotStartISO, setDetailSlotStartISO] = useState<string | null>(null);
  const [detailSlotEndISO, setDetailSlotEndISO] = useState<string | null>(null);
  const [detailSlotServiceIds, setDetailSlotServiceIds] = useState<string[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"this" | "future" | "all">("this");
  const [slotEditOpen, setSlotEditOpen] = useState(false);
  const [slotEditBusy, setSlotEditBusy] = useState(false);
  const [editScope, setEditScope] = useState<"this" | "future" | "all">("this");
  const [editResetIndividualModifications, setEditResetIndividualModifications] = useState(false);
  const [slotEditStartTime, setSlotEditStartTime] = useState("09:00");
  const [slotEditEndTime, setSlotEditEndTime] = useState("17:00");
  const [slotEditServiceIds, setSlotEditServiceIds] = useState<string[]>([]);

  const [ruleFilter, setRuleFilter] = useState<"all" | "weekly" | "custom">(
    "all"
  );

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const detailServiceNames = useMemo(() => {
    const ids =
      detailSlotServiceIds.length > 0
        ? detailSlotServiceIds
        : detailRule?.service_ids && detailRule.service_ids.length > 0
          ? detailRule.service_ids
          : services.map((x) => x.id);
    return ids.map((id) => services.find((s) => s.id === id)?.name || "Service");
  }, [detailRule, detailSlotServiceIds, services]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffList, serviceList] = await Promise.all([listStaff(), listServices()]);
      const activeStaff = (staffList || []).filter((s: StaffMember) => s.is_active);
      setStaff(activeStaff);
      setServices((serviceList || []).filter((s: ServiceItem) => s.is_active));

      const rMap: Record<string, Rule[]> = {};
      await Promise.all(
        activeStaff.map(async (s: StaffMember) => {
          try {
            const rules = await listRules(s.id);
            rMap[s.id] = (rules || []).filter((r: Rule) => r.is_active);
          } catch { rMap[s.id] = []; }
        })
      );
      setRulesMap(rMap);
    } catch (e) {
      console.error("Failed to load data:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (staff.length === 0 || services.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const tz = getClientTimeZone();
        const from = dates[0].toISOString();
        const to = addDays(dates[6], 1).toISOString();

        const results = await Promise.all(
          staff.map(async (s) => {
            const resp = await getAdminMergedOpenHours({
              staff_id: s.id,
              from,
              to,
              time_zone: tz,
            });
            return [s.id, resp.slots || []] as const;
          })
        );

        if (cancelled) return;
        const map: Record<string, MergedSlot[]> = {};
        for (const [sid, slots] of results) map[sid] = slots;
        setMergedSlotsByStaff(map);
      } catch (e) {
        console.error("Failed to load merged slots:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dates, staff, services, weekStart]);

  useEffect(() => {
    if (!modalOpen || !selectedStaffId || services.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const rules = await listRules(selectedStaffId);
        const active = (rules || []).filter((r: Rule) => r.is_active);
        const allIds = services.map((s) => s.id);
        const rows = buildWeeklyRowsFromRules(active, allIds);
        if (cancelled) return;
        setWeeklyRows(rows);
        const byId: Record<string, Rule> = {};
        for (const r of active) {
          if (isWeeklyEditorRule(r)) byId[r.id] = r;
        }
        setWeeklyRuleById(byId);
        weeklyRuleIdsAtOpen.current = new Set(Object.keys(byId));
        const sigs = new Map<string, string>();
        for (let d = 0; d < 7; d++) {
          if (!rows[d].enabled) continue;
          for (const slot of rows[d].slots) {
            if (slot.ruleId) {
              sigs.set(slot.ruleId, slotWeeklySig(d, slot, allIds));
            }
          }
        }
        weeklySlotSigAtOpen.current = sigs;
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, selectedStaffId, services]);

  function getRulesForStaffDay(staffId: string, date: Date): Rule[] {
    const rules = rulesMap[staffId] || [];
    const dayKey = format(date, "yyyy-MM-dd");
    return rules.filter((r) => {
      const fromKey = ruleEffectiveDayKey(r);
      if (fromKey && dayKey < fromKey) return false;
      if (r.effective_until) {
        let untilKey = "";
        if (typeof r.effective_until === "string") {
          untilKey = r.effective_until.slice(0, 10);
        } else if (
          typeof r.effective_until === "object" &&
          r.effective_until &&
          "Time" in r.effective_until
        ) {
          untilKey = String(
            (r.effective_until as { Time: string }).Time
          ).slice(0, 10);
        }
        if (untilKey && dayKey > untilKey) return false;
      }
      return ruleMatchesDay(r, date);
    });
  }

  function addSlot(dayIdx: number) {
    setWeeklyRows((prev) => {
      const rows = [...prev];
      const lastSlot = rows[dayIdx].slots[rows[dayIdx].slots.length - 1];
      rows[dayIdx] = {
        ...rows[dayIdx],
        slots: [
          ...rows[dayIdx].slots,
          {
            startTime: lastSlot.endTime,
            endTime: "17:00",
            serviceIds: [],
          },
        ],
      };
      return rows;
    });
  }

  function removeSlot(dayIdx: number, slotIdx: number) {
    setWeeklyRows((prev) => {
      const rows = [...prev];
      const newSlots = rows[dayIdx].slots.filter((_, i) => i !== slotIdx);
      if (newSlots.length === 0) {
        rows[dayIdx] = {
          ...rows[dayIdx],
          enabled: false,
          slots: [{ startTime: "09:00", endTime: "17:00", serviceIds: [] }],
        };
      } else {
        rows[dayIdx] = { ...rows[dayIdx], slots: newSlots };
      }
      return rows;
    });
  }

  function updateSlot(
    dayIdx: number,
    slotIdx: number,
    field: "startTime" | "endTime",
    value: string
  ) {
    setWeeklyRows((prev) => {
      const rows = [...prev];
      const slots = [...rows[dayIdx].slots];
      slots[slotIdx] = { ...slots[slotIdx], [field]: value };
      rows[dayIdx] = { ...rows[dayIdx], slots };
      return rows;
    });
  }

  function updateSlotServices(dayIdx: number, slotIdx: number, ids: string[]) {
    setWeeklyRows((prev) => {
      const rows = [...prev];
      const slots = [...rows[dayIdx].slots];
      slots[slotIdx] = { ...slots[slotIdx], serviceIds: ids };
      rows[dayIdx] = { ...rows[dayIdx], slots };
      return rows;
    });
  }

  function copyDayToAll(sourceDayIdx: number) {
    setWeeklyRows((prev) => {
      return prev.map((row, i) => {
        if (i === sourceDayIdx) return row;
        return {
          enabled: prev[sourceDayIdx].enabled,
          slots: prev[sourceDayIdx].slots.map((s) => ({
            ...s,
            serviceIds: [...s.serviceIds],
            ruleId: undefined,
          })),
        };
      });
    });
  }

  function buildCustomRRULE(): string {
    const parts: string[] = [`FREQ=${recFreq}`, `INTERVAL=${Math.max(1, recInterval)}`];
    if (recFreq === "WEEKLY") {
      const days = recByDayMask
        .map((on, i) => (on ? BYDAY_UI[i] : null))
        .filter(Boolean) as string[];
      if (days.length > 0) parts.push(`BYDAY=${days.join(",")}`);
    }
    if (recEndMode === "after") {
      parts.push(`COUNT=${Math.min(100, Math.max(1, recCount))}`);
    } else if (recEndMode === "on" && recUntilDate) {
      parts.push(`UNTIL=${recUntilDate.replace(/-/g, "")}T235959Z`);
    }
    return parts.join(";");
  }

  function applyCustomRecurrence() {
    setCustomRRule(buildCustomRRULE());
    setRecModalOpen(false);
  }

  function onRecurrenceDropdownChange(v: string) {
    if (v === "__CUSTOM__") {
      setRecModalOpen(true);
      return;
    }
    setCustomRRule(v);
  }

  async function handleSaveWeekly() {
    if (!selectedStaffId) return;
    setSaving(true);
    try {
      const allServiceIds = services.map((s) => s.id);
      const today = format(new Date(), "yyyy-MM-dd");

      const usedRuleIds = new Set<string>();
      const currentSlots: { dayIdx: number; slot: TimeSlot }[] = [];
      for (let d = 0; d < 7; d++) {
        if (!weeklyRows[d].enabled) continue;
        for (const slot of weeklyRows[d].slots) {
          currentSlots.push({ dayIdx: d, slot });
          if (slot.ruleId) usedRuleIds.add(slot.ruleId);
        }
      }

      for (const rid of weeklyRuleIdsAtOpen.current) {
        if (!usedRuleIds.has(rid)) {
          const r = weeklyRuleById[rid];
          if (!r) continue;
          await updateRule(rid, {
            rule_type: "weekly",
            timezone: r.timezone,
            start_local: r.start_local,
            end_local: r.end_local,
            rrule: r.rrule,
            effective_from: ruleEffectiveFrom(r),
            effective_until: ruleEffectiveUntilAPI(r),
            default_capacity: r.default_capacity,
            is_active: false,
          });
        }
      }

      const templateRule = Object.values(weeklyRuleById)[0];
      const tz = templateRule?.timezone ?? getClientTimeZone();
      const cap = templateRule?.default_capacity ?? 1;
      const effFrom = templateRule
        ? ruleEffectiveFrom(templateRule)
        : today;

      for (const { dayIdx, slot } of currentSlots) {
        const rrule = weeklyDayRRule(dayIdx);
        const startLocal = localISO(today, slot.startTime, tz);
        const endLocal = localISO(today, slot.endTime, tz);
        const svcPayload =
          slot.serviceIds.length > 0 ? slot.serviceIds : allServiceIds;

        if (slot.ruleId && weeklyRuleById[slot.ruleId]) {
          const r = weeklyRuleById[slot.ruleId];
          const prevSig = weeklySlotSigAtOpen.current.get(slot.ruleId);
          const nowSig = slotWeeklySig(dayIdx, slot, allServiceIds);
          if (prevSig !== nowSig) {
            await updateRule(slot.ruleId, {
              rule_type: "weekly",
              timezone: r.timezone,
              start_local: startLocal,
              end_local: endLocal,
              rrule,
              effective_from: ruleEffectiveFrom(r),
              effective_until: ruleEffectiveUntilAPI(r),
              default_capacity: r.default_capacity,
              is_active: true,
              service_ids: svcPayload,
            });
          }
        } else {
          await createRule({
            staff_id: selectedStaffId,
            rule_type: "weekly",
            timezone: tz,
            start_local: startLocal,
            end_local: endLocal,
            rrule,
            effective_from: effFrom,
            default_capacity: cap,
            service_ids: svcPayload,
          });
        }
      }

      setModalOpen(false);
      fetchData();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  }

  function addCustomSlot() {
    setCustomSlots((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          startDate: last?.endDate ?? format(new Date(), "yyyy-MM-dd"),
          startTime: last?.endTime ?? "09:00",
          endDate: last?.endDate ?? format(new Date(), "yyyy-MM-dd"),
          endTime: "17:00",
          serviceIds: [],
        },
      ];
    });
  }

  function removeCustomSlot(key: string) {
    setCustomSlots((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.key !== key);
    });
  }

  function patchCustomSlot(key: string, patch: Partial<CustomSlotRow>) {
    setCustomSlots((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s, ...patch };
        if (
          patch.startDate != null &&
          patch.startDate !== s.startDate &&
          s.endDate === s.startDate
        ) {
          next.endDate = patch.startDate!;
        }
        return next;
      })
    );
  }

  async function handleSaveCustom() {
    if (!selectedStaffId) return;
    setSaving(true);
    try {
      const allServiceIds = services.map((s) => s.id);
      const tz = getClientTimeZone();

      let effectiveUntil: string | undefined;
      if (recEndMode === "on" && recUntilDate) {
        effectiveUntil = `${recUntilDate}T23:59:59Z`;
      }

      const effFrom =
        customSlots.length > 0 ? customSlots[0].startDate : format(new Date(), "yyyy-MM-dd");

      for (const slot of customSlots) {
        const svc =
          slot.serviceIds.length > 0 ? slot.serviceIds : allServiceIds;
        const rrule =
          customRRule.trim() ||
          "FREQ=DAILY;COUNT=1";
        await createRule({
          staff_id: selectedStaffId,
          rule_type: "custom",
          timezone: tz,
          start_local: localISO(slot.startDate, slot.startTime, tz),
          end_local: localISO(slot.endDate, slot.endTime, tz),
          rrule,
          effective_from: effFrom,
          effective_until: effectiveUntil,
          default_capacity: 1,
          service_ids: svc,
        });
      }
      setModalOpen(false);
      fetchData();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  }

  const isRecurringRule = detailRule?.rrule && detailRule.rrule.trim() !== "";

  function openDeleteModal() {
    setDeleteScope("this");
    setDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!detailRule || !detailStaff) return;
    setDetailBusy(true);
    try {
      if (deleteScope === "this") {
        if (!detailOccurrenceStartISO) throw new Error("Missing occurrence_start");
        await mutateRule(detailRule.id, {
          mode: "delete_this_occurence",
          staff_id: detailStaff.id,
          occurrence_start: detailOccurrenceStartISO,
        });
      } else if (deleteScope === "future") {
        if (!detailOccurrenceStartISO) throw new Error("Missing occurrence_start");
        await mutateRule(detailRule.id, {
          mode: "delete_this_and_following",
          staff_id: detailStaff.id,
          occurrence_start: detailOccurrenceStartISO,
        });
      } else {
        await mutateRule(detailRule.id, {
          mode: "delete_this_series",
          staff_id: detailStaff.id,
        });
      }
      setDeleteModalOpen(false);
      setDetailOpen(false);
      fetchData();
    } catch (e: any) {
      alert(e.message || "Delete failed");
    }
    setDetailBusy(false);
  }

  function openEditFromDetail() {
    if (
      !detailRule ||
      !detailStaff ||
      !detailDate ||
      !detailSlotStartISO ||
      !detailSlotEndISO
    )
      return;

    const start = format(parseISO(detailSlotStartISO), "HH:mm");
    const end = format(parseISO(detailSlotEndISO), "HH:mm");

    setSlotEditStartTime(start);
    setSlotEditEndTime(end);
    setSlotEditServiceIds(detailSlotServiceIds);
    setEditScope("this");
    setEditResetIndividualModifications(false);
    setSlotEditOpen(true);
    setDetailOpen(false);
  }

  async function handleSlotEditSave() {
    if (!detailRule || !detailStaff || !detailDate) return;
    setSlotEditBusy(true);
    try {
      const allServiceIds = services.map((s) => s.id);
      const svcPayload =
        slotEditServiceIds.length > 0 ? slotEditServiceIds : allServiceIds;
      const dayKey = format(detailDate, "yyyy-MM-dd");
      const tz = detailRule.timezone || getClientTimeZone();

      const timingPayload = {
        timezone: tz,
        start_local: localISO(dayKey, slotEditStartTime, tz),
        end_local: localISO(dayKey, slotEditEndTime, tz),
        rrule: detailRule.rrule,
        effective_from: `${dayKey}T00:00:00Z`,
      };

      if (editScope === "this") {
        if (!detailOccurrenceStartISO) {
          throw new Error("Missing occurrence_start for this occurrence edit");
        }
        await mutateRule(detailRule.id, {
          mode: "edit_this_occurence",
          staff_id: detailStaff.id,
          occurrence_start: detailOccurrenceStartISO,
          service_ids: svcPayload,
          timing: timingPayload,
        });
      } else if (editScope === "future") {
        if (!detailOccurrenceStartISO) {
          throw new Error("Missing occurrence_start for future edit");
        }
        await mutateRule(detailRule.id, {
          mode: "edit_this_and_following",
          staff_id: detailStaff.id,
          occurrence_start: detailOccurrenceStartISO,
          service_ids: svcPayload,
          capacity: detailRule.default_capacity || 1,
          reset_individual_modifications: editResetIndividualModifications,
          timing: timingPayload,
        });
      } else {
        await mutateRule(detailRule.id, {
          mode: "edit_entire_series",
          staff_id: detailStaff.id,
          service_ids: svcPayload,
          capacity: detailRule.default_capacity || 1,
          reset_individual_modifications: editResetIndividualModifications,
          timing: timingPayload,
        });
      }

      setSlotEditOpen(false);
      fetchData();
    } catch (e: any) {
      alert("Error: " + (e?.message || e));
    }
    setSlotEditBusy(false);
  }

  function openCreateModal() {
    setSelectedStaffId(staff.length > 0 ? staff[0].id : "");
    setModalTab(ruleFilter === "custom" ? "custom" : "weekly");
    setCustomSlots([newCustomSlotRow()]);
    setCustomRRule("");
    setRecEndMode("never");
    setRecModalOpen(false);
    setModalOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Open Hours</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setRuleFilter("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                ruleFilter === "all"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setRuleFilter("weekly")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                ruleFilter === "weekly"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setRuleFilter("custom")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                ruleFilter === "custom"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Custom
            </button>
          </div>
          <span className="text-sm text-gray-500">{getClientTimeZone()}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-800">
            {format(dates[0], "MMM d")} – {format(dates[6], "MMM d, yyyy")}
          </span>
          <button type="button" onClick={() => setWeekStart((w) => addWeeks(w, -1))} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() =>
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
            className="text-xs font-semibold text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 border border-indigo-100"
          >
            Today
          </button>
          <button type="button" onClick={() => setWeekStart((w) => addWeeks(w, 1))} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition-all">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center animate-in">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-1">No staff members found</p>
            <p className="text-gray-400 text-sm">Add staff members first, then create their open hours.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-white rounded-2xl shadow-sm border border-gray-200/80">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="sticky left-0 bg-gray-50/90 backdrop-blur-sm z-10 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-64 min-w-[250px]">
                  Employee
                </th>
                {dates.map((d, i) => (
                  <th key={i} className="px-3 py-3 text-center border-l border-gray-100">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{DAYS[i]}</div>
                    <div className={`text-xl font-bold mt-1 ${
                      format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
                        ? "text-indigo-600"
                        : "text-gray-800"
                    }`}>
                      {format(d, "dd")}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="stagger-children">
              {staff.map((s, sIdx) => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                  <td className="sticky left-0 bg-white z-10 px-4 py-4 border-r border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm ${COLORS[sIdx % COLORS.length]}`}>
                        {getInitials(s.display_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{s.display_name}</div>
                        <div className="text-xs text-gray-400 truncate">{s.email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  {dates.map((d, dIdx) => {
                    const dateKey = format(d, "yyyy-MM-dd");
                    const daySlots = (mergedSlotsByStaff[s.id] || [])
                      .filter((sl) => sl.date === dateKey)
                      .filter((sl) => {
                        if (ruleFilter === "all") return true;
                        if (!sl.rule_id) {
                          // Non-rule windows (should be rare) are treated as custom-only.
                          return ruleFilter === "custom";
                        }
                        const r = (rulesMap[s.id] || []).find(
                          (x) => x.id === sl.rule_id
                        );
                        const t = r?.rule_type;
                        if (t === "weekly" || t === "custom") return t === ruleFilter;
                        // Back-compat: if rule_type missing, fall back to the old heuristic.
                        const inferred = r && isWeeklyEditorRule(r) ? "weekly" : "custom";
                        return inferred === ruleFilter;
                      });
                    return (
                      <td key={dIdx} className="px-2 py-2 border-l border-gray-100 align-top">
                        {daySlots.length > 0 ? (
                          <div className="space-y-0.5 min-w-0">
                            {daySlots.map((slot, slIdx) => {
                              const n = slot.service_ids?.length ?? services.length;
                              return (
                                <button
                                  type="button"
                                  key={(slot.rule_id || "oneoff") + ":" + (slot.occurrence_start || "") + ":" + slot.start + ":" + slIdx}
                                  onClick={() => {
                                    if (!slot.rule_id) return;
                                    const r = (rulesMap[s.id] || []).find(
                                      (x) => x.id === slot.rule_id
                                    );
                                    setDetailStaff(s);
                                    setDetailRule(r || null);
                                    setDetailDate(d);
                                    setDetailOccurrenceStartISO(
                                      slot.occurrence_start || null
                                    );
                                    setDetailSlotStartISO(slot.start);
                                    setDetailSlotEndISO(slot.end);
                                    setDetailSlotServiceIds(slot.service_ids || []);
                                    setDetailOpen(true);
                                  }}
                                  className="w-full max-w-full text-left bg-indigo-50 rounded-lg px-1.5 py-1 text-[11px] leading-tight cursor-pointer hover:bg-indigo-100 transition-colors border border-indigo-100/80 min-w-0"
                                >
                                  <span className="font-semibold text-indigo-900 whitespace-nowrap truncate block">
                                    {formatTime(slot.start)}–{formatTime(slot.end)}
                                    <span className="font-normal text-indigo-600/90">
                                      {" "}
                                      · {n} svc
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-12" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={openCreateModal}
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all duration-300 flex items-center justify-center z-40 hover:scale-105"
      >
        <Plus className="w-6 h-6" />
      </button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule" wide>
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-gray-500 w-24 shrink-0">Employee</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="flex-1 min-w-[200px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="">Select Employee</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </select>
            <span className="text-xs text-gray-400">{getClientTimeZone()}</span>
          </div>

          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setModalTab("weekly")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                modalTab === "weekly" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >Weekly Schedule</button>
            <button
              type="button"
              onClick={() => setModalTab("custom")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                modalTab === "custom" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >Custom Schedule</button>
          </div>

          {modalTab === "weekly" && (
            <div className="space-y-2">
              <div className="hidden sm:grid sm:grid-cols-[72px_1fr] gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider px-1">
                <div />
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_auto_auto_auto] gap-x-2 gap-y-1 items-center">
                  <span className="col-span-3 sm:col-span-1">Start / End</span>
                  <span className="hidden sm:block" />
                  <span className="text-right sm:text-left">Services</span>
                </div>
              </div>

              {DAYS.map((day, i) => (
                <div key={day} className={`rounded-xl border border-transparent ${weeklyRows[i].enabled ? "bg-white" : "bg-gray-50/70"}`}>
                  {weeklyRows[i].slots.map((slot, si) => (
                    <div key={si} className="flex flex-col sm:grid sm:grid-cols-[72px_1fr] gap-2 items-start sm:items-center py-2 px-1">
                      {si === 0 ? (
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={weeklyRows[i].enabled}
                            onChange={(e) => {
                              const rows = [...weeklyRows];
                              rows[i] = { ...rows[i], enabled: e.target.checked };
                              setWeeklyRows(rows);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-semibold text-gray-700 w-10">{day}</span>
                        </label>
                      ) : (
                        <div className="w-12 shrink-0" />
                      )}
                      <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
                        <input
                          type="time"
                          value={slot.startTime}
                          onChange={(e) => updateSlot(i, si, "startTime", e.target.value)}
                          disabled={!weeklyRows[i].enabled}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 w-[130px]"
                        />
                        <span className="text-xs text-gray-400">to</span>
                        <input
                          type="time"
                          value={slot.endTime}
                          onChange={(e) => updateSlot(i, si, "endTime", e.target.value)}
                          disabled={!weeklyRows[i].enabled}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-30 w-[130px]"
                        />
                        <button
                          type="button"
                          disabled={!weeklyRows[i].enabled}
                          onClick={() => removeSlot(i, si)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30"
                          title="Remove slot"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <ServicePickerPopover
                          services={services}
                          selectedIds={slot.serviceIds}
                          onChange={(ids) => updateSlotServices(i, si, ids)}
                          disabled={!weeklyRows[i].enabled}
                          className="min-w-[100px]"
                        />
                        {si === 0 && (
                          <button
                            type="button"
                            disabled={!weeklyRows[i].enabled}
                            onClick={() => copyDayToAll(i)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                            title="Copy to all days"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {weeklyRows[i].enabled && (
                    <div className="pl-14 pb-2">
                      <button
                        type="button"
                        onClick={() => addSlot(i)}
                        className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
                      >
                        <Plus className="w-3 h-3" /> Add time slot
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {modalTab === "custom" && (
            <div className="space-y-4">
              {customSlots.map((slot) => (
                <div
                  key={slot.key}
                  className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
                >
                  <div className="flex items-center gap-2 shrink-0 border border-gray-100 rounded-xl px-2 py-1.5 bg-gray-50/80">
                    <div className="flex flex-col min-w-[108px]">
                      <span className="text-[10px] text-gray-500 leading-tight">Start time</span>
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) =>
                          patchCustomSlot(slot.key, { startTime: e.target.value })
                        }
                        className="text-sm font-semibold text-gray-900 bg-transparent border-0 p-0 h-7 focus:ring-0 w-[108px]"
                      />
                      <input
                        type="date"
                        value={slot.startDate}
                        onChange={(e) =>
                          patchCustomSlot(slot.key, { startDate: e.target.value })
                        }
                        className="text-[11px] text-gray-600 bg-transparent border border-gray-200 rounded px-1 py-0.5 mt-0.5 w-full"
                      />
                    </div>
                  </div>

                  <span className="text-xs text-gray-400 shrink-0 px-0.5">to</span>

                  <div className="flex items-center gap-2 shrink-0 border border-gray-100 rounded-xl px-2 py-1.5 bg-gray-50/80">
                    <div className="flex flex-col min-w-[108px]">
                      <span className="text-[10px] text-gray-500 leading-tight">End time</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) =>
                          patchCustomSlot(slot.key, { endTime: e.target.value })
                        }
                        className="text-sm font-semibold text-gray-900 bg-transparent border-0 p-0 h-7 focus:ring-0 w-[108px]"
                      />
                      <input
                        type="date"
                        value={slot.endDate}
                        onChange={(e) =>
                          patchCustomSlot(slot.key, { endDate: e.target.value })
                        }
                        className="text-[11px] text-gray-600 bg-transparent border border-gray-200 rounded px-1 py-0.5 mt-0.5 w-full"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeCustomSlot(slot.key)}
                    disabled={customSlots.length <= 1}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 shrink-0"
                    title="Remove slot"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <ServicePickerPopover
                    services={services}
                    selectedIds={slot.serviceIds}
                    onChange={(ids) => patchCustomSlot(slot.key, { serviceIds: ids })}
                    className="shrink-0 ml-1"
                  />
                </div>
              ))}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={addCustomSlot}
                  className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
                >
                  <Plus className="w-3 h-3" /> Add time slot
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-gray-500 mb-1">Recurrence</label>
                  <select
                    value={(() => {
                      const presetVals = RECURRENCE_OPTIONS.filter(
                        (o) => o.value && o.value !== "__CUSTOM__"
                      ).map((o) => o.value);
                      if (customRRule && !presetVals.includes(customRRule)) return "__CUSTOM__";
                      return customRRule || "";
                    })()}
                    onChange={(e) => onRecurrenceDropdownChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setRecModalOpen(true)}
                  className="text-sm font-medium text-sky-600 hover:text-sky-800 px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 shrink-0"
                >
                  Custom recurrence…
                </button>
              </div>
              {customRRule && (
                <p className="text-xs text-gray-500 font-mono break-all bg-gray-50 rounded-lg px-2 py-1.5">
                  {customRRule}
                </p>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                For multi-day ranges, keep the end within 24 hours of the start, or split into separate rules.
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="button"
              onClick={modalTab === "weekly" ? handleSaveWeekly : handleSaveCustom}
              disabled={saving || !selectedStaffId}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailStaff?.display_name || "Availability"}
        wide
      >
        {detailRule && detailDate && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={openEditFromDetail}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
                title="Edit this slot"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={openDeleteModal}
                disabled={detailBusy}
                className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-700">
              {format(detailDate, "MMM d, yyyy")} ·{" "}
              {detailSlotStartISO
                ? formatTime(detailSlotStartISO)
                : formatTime(detailRule.start_local as any)}{" "}
              –{" "}
              {detailSlotEndISO
                ? formatTime(detailSlotEndISO)
                : formatTime(detailRule.end_local as any)}
            </p>
            <p className="text-sm text-gray-500">
              {rruleSummary(detailRule.rrule, detailRule.effective_until)}
            </p>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Available for services
              </p>
              <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
                {detailServiceNames.map((name, i) => (
                  <li
                    key={i}
                    className="flex justify-between gap-2 border-b border-gray-100 pb-1 text-gray-800"
                  >
                    <span>{name}</span>
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {detailSlotStartISO
                        ? formatTime(detailSlotStartISO)
                        : formatTime(detailRule.start_local as any)}{" "}
                      –{" "}
                      {detailSlotEndISO
                        ? formatTime(detailSlotEndISO)
                        : formatTime(detailRule.end_local as any)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              className="text-sm text-indigo-600 font-medium"
            >
              ← Back
            </button>
          </div>
        )}
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete availability"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            How would you like to delete this availability?
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
              <input
                type="radio"
                name="deleteScope"
                value="this"
                checked={deleteScope === "this"}
                onChange={() => setDeleteScope("this")}
                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">This event only</p>
                <p className="text-xs text-gray-500">Remove just this one occurrence</p>
              </div>
            </label>
            {isRecurringRule && (
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                <input
                  type="radio"
                  name="deleteScope"
                  value="future"
                  checked={deleteScope === "future"}
                  onChange={() => setDeleteScope("future")}
                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">This and following events</p>
                  <p className="text-xs text-gray-500">Remove from this date onward</p>
                </div>
              </label>
            )}
            {isRecurringRule && (
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                <input
                  type="radio"
                  name="deleteScope"
                  value="all"
                  checked={deleteScope === "all"}
                  onChange={() => setDeleteScope("all")}
                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">All events in series</p>
                  <p className="text-xs text-gray-500">Remove the entire recurring schedule</p>
                </div>
              </label>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              disabled={detailBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={detailBusy}
              className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
            >
              {detailBusy ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={slotEditOpen}
        onClose={() => setSlotEditOpen(false)}
        title="Edit availability slot"
        wide
      >
        {detailRule && detailDate && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {format(detailDate, "MMM d, yyyy")} ·{" "}
              {detailSlotStartISO
                ? formatTime(detailSlotStartISO)
                : formatTime(detailRule.start_local as any)}{" "}
              –{" "}
              {detailSlotEndISO
                ? formatTime(detailSlotEndISO)
                : formatTime(detailRule.end_local as any)}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Start</span>
                <input
                  type="time"
                  value={slotEditStartTime}
                  onChange={(e) => setSlotEditStartTime(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">End</span>
                <input
                  type="time"
                  value={slotEditEndTime}
                  onChange={(e) => setSlotEditEndTime(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Available for services
              </p>
              <ServicePickerPopover
                services={services}
                selectedIds={slotEditServiceIds}
                onChange={(ids) => setSlotEditServiceIds(ids)}
                className="min-w-[220px]"
              />
            </div>

            {detailRule.rrule && detailRule.rrule.trim() !== "" && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Apply to
                </p>
                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                  <input
                    type="radio"
                    name="editScope"
                    value="this"
                    checked={editScope === "this"}
                    onChange={() => {
                      setEditScope("this");
                      setEditResetIndividualModifications(false);
                    }}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-900">This event only</span>
                </label>
                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                  <input
                    type="radio"
                    name="editScope"
                    value="future"
                    checked={editScope === "future"}
                    onChange={() => setEditScope("future")}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-900">This and following events</span>
                </label>
                <label className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                  <input
                    type="radio"
                    name="editScope"
                    value="all"
                    checked={editScope === "all"}
                    onChange={() => setEditScope("all")}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-900">All events in series</span>
                </label>
                {(editScope === "future" || editScope === "all") && (
                  <label className="flex items-center gap-2 ml-7 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={editResetIndividualModifications}
                      onChange={(e) => setEditResetIndividualModifications(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Reset individual modifications
                  </label>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setSlotEditOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={slotEditBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSlotEditSave}
                disabled={slotEditBusy}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                {slotEditBusy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={recModalOpen} onClose={() => setRecModalOpen(false)} title="Custom recurrence">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-700">Repeat every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={recInterval}
              onChange={(e) => setRecInterval(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            />
            <select
              value={recFreq}
              onChange={(e) => setRecFreq(e.target.value as typeof recFreq)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="DAILY">day</option>
              <option value="WEEKLY">week</option>
              <option value="MONTHLY">month</option>
              <option value="YEARLY">year</option>
            </select>
          </div>

          {recFreq === "WEEKLY" && (
            <div>
              <p className="text-sm text-gray-700 mb-2">Repeat on</p>
              <div className="flex flex-wrap gap-2">
                {["M", "T", "W", "T", "F", "S", "S"].map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setRecByDayMask((prev) => {
                        const n = [...prev];
                        n[idx] = !n[idx];
                        return n;
                      });
                    }}
                    className={`w-9 h-9 rounded-full text-sm font-semibold transition-colors ${
                      recByDayMask[idx]
                        ? "bg-sky-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Mon → Sun</p>
            </div>
          )}

          <div>
            <p className="text-sm text-gray-700 mb-2">Ends</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recEnd"
                  checked={recEndMode === "never"}
                  onChange={() => setRecEndMode("never")}
                  className="text-sky-600"
                />
                <span className="text-sm text-gray-700">Never</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                <input
                  type="radio"
                  name="recEnd"
                  checked={recEndMode === "on"}
                  onChange={() => setRecEndMode("on")}
                  className="text-sky-600"
                />
                <span className="text-sm text-gray-700">On</span>
                <input
                  type="date"
                  value={recUntilDate}
                  onChange={(e) => setRecUntilDate(e.target.value)}
                  disabled={recEndMode !== "on"}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:opacity-40"
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                <input
                  type="radio"
                  name="recEnd"
                  checked={recEndMode === "after"}
                  onChange={() => setRecEndMode("after")}
                  className="text-sky-600"
                />
                <span className="text-sm text-gray-700">After</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={recCount}
                  onChange={(e) => setRecCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                  disabled={recEndMode !== "after"}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:opacity-40"
                />
                <span className="text-sm text-gray-500">occurrences (max 100)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setRecModalOpen(false)} className="text-sm font-semibold text-sky-600">
              CANCEL
            </button>
            <button
              type="button"
              onClick={applyCustomRecurrence}
              className="px-5 py-2 bg-sky-600 text-white text-sm font-semibold rounded-lg hover:bg-sky-700"
            >
              DONE
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
