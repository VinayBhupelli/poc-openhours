"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  Calendar as CalIcon,
} from "lucide-react";
import {
  listStaff,
  listServices,
  listCustomers,
  listBookings,
  createBooking,
  cancelBooking,
  getAvailability,
} from "@/lib/api";
import { getClientTimeZone } from "@/lib/datetime";
import Modal from "@/components/modal";
import {
  startOfWeek,
  addDays,
  addWeeks,
  format,
  parseISO,
  getDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDate,
  isSameMonth,
  isToday,
  setMonth,
  setYear,
  getMonth,
  getYear,
  addMonths,
} from "date-fns";

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0 AM to 11 PM (full 24h)
const DAYS_LABEL = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const BOOKING_COLORS = [
  { bg: "bg-emerald-100", border: "border-l-emerald-500", text: "text-emerald-800" },
  { bg: "bg-violet-100", border: "border-l-violet-500", text: "text-violet-800" },
  { bg: "bg-amber-100", border: "border-l-amber-500", text: "text-amber-800" },
  { bg: "bg-rose-100", border: "border-l-rose-500", text: "text-rose-800" },
  { bg: "bg-blue-100", border: "border-l-blue-500", text: "text-blue-800" },
  { bg: "bg-cyan-100", border: "border-l-cyan-500", text: "text-cyan-800" },
  { bg: "bg-pink-100", border: "border-l-pink-500", text: "text-pink-800" },
];

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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKeyInTimeZone(date: Date, timeZone: string) {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function decimalHourInTimeZone(date: Date, timeZone: string) {
  const p = getZonedParts(date, timeZone);
  return p.hour + p.minute / 60;
}

function formatTimeInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

// Convert a "wall clock" time in `timeZone` to a UTC ISO string.
function localISO(dateStr: string, timeStr: string, timeZone: string): string {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day = parseInt(dateStr.slice(8, 10), 10);

  const hh = parseInt(timeStr.slice(0, 2), 10);
  const mm = parseInt(timeStr.slice(3, 5), 10);

  // Start by treating wall-clock time as UTC, then correct using TZ offset.
  const desiredAsUTCms = Date.UTC(year, month - 1, day, hh, mm, 0);
  let guess = new Date(desiredAsUTCms);

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

interface StaffMember { id: string; display_name: string; email: string; }
interface ServiceItem { id: string; name: string; duration_minutes: number; is_active: boolean; }
interface CustomerItem { id: string; full_name: string; }
interface BookingItem {
  id: string;
  staff_id: string;
  customer_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
}

export default function CalendarPage({
  /**
   * When provided (yyyy-MM-dd), the calendar opens the week containing this date,
   * and that date is highlighted as the selected day.
   */
  initialDate,
}: {
  initialDate?: string;
}) {
  const timeZone = getClientTimeZone();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(() =>
    initialDate ? parseISO(initialDate) : new Date()
  );
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(initialDate ? parseISO(initialDate) : new Date(), {
      weekStartsOn: 1,
    })
  );
  const [miniCalMonth, setMiniCalMonth] = useState(new Date());

  // Booking modal
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bmServiceId, setBmServiceId] = useState("");
  const [bmStaffId, setBmStaffId] = useState("");
  const [bmCustomerId, setBmCustomerId] = useState("");
  const [bmDate, setBmDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bmStartTime, setBmStartTime] = useState("09:00");
  const [bmEndTime, setBmEndTime] = useState("09:30");
  const [bmSaving, setBmSaving] = useState(false);
  const [onlyBookInOpenHours, setOnlyBookInOpenHours] = useState(false);
  const [checkingSlot, setCheckingSlot] = useState(false);
  const [slotAllowed, setSlotAllowed] = useState(true);

  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Filters
  const [filterStaffId, setFilterStaffId] = useState("");
  const [filterServiceId, setFilterServiceId] = useState("");

  const gridRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const staffMap = useMemo(() => {
    const m: Record<string, StaffMember> = {};
    staff.forEach((s) => (m[s.id] = s));
    return m;
  }, [staff]);

  const serviceMap = useMemo(() => {
    const m: Record<string, ServiceItem> = {};
    services.forEach((s) => (m[s.id] = s));
    return m;
  }, [services]);

  const customerMap = useMemo(() => {
    const m: Record<string, CustomerItem> = {};
    customers.forEach((c) => (m[c.id] = c));
    return m;
  }, [customers]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, servicesRes, customersRes] = await Promise.all([
        listStaff(),
        listServices(),
        listCustomers(),
      ]);
      setStaff((staffRes || []).filter((s: any) => s.is_active));
      setServices((servicesRes || []).filter((s: any) => s.is_active));
      setCustomers((customersRes || []).filter((c: any) => c.is_active));
    } catch (e) {
      console.error("Failed to load data:", e);
    }
    setLoading(false);
  }, []);

  const fetchBookings = useCallback(async () => {
    try {
      const from = dates[0].toISOString();
      const to = addDays(dates[6], 1).toISOString();
      const res = await listBookings(from, to);
      setBookings((res || []).filter((b: BookingItem) => b.status !== "cancelled"));
    } catch {
      setBookings([]);
    }
  }, [dates]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loading && gridRef.current) {
      gridRef.current.scrollTop = 8 * 64;
    }
  }, [loading]);

  useEffect(() => {
    if (!onlyBookInOpenHours) {
      setSlotAllowed(true);
      setCheckingSlot(false);
      return;
    }
    if (!bmServiceId || !bmStaffId || !bmDate || !bmStartTime || !bmEndTime) {
      setSlotAllowed(true);
      return;
    }

    const startAt = localISO(bmDate, bmStartTime, timeZone);
    const endAt = localISO(bmDate, bmEndTime, timeZone);
    const svc = services.find((s) => s.id === bmServiceId);
    const durationMinutes = svc ? svc.duration_minutes : undefined;

    setCheckingSlot(true);
    const from = new Date(new Date(startAt).getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(new Date(endAt).getTime() + 24 * 60 * 60 * 1000).toISOString();

    getAvailability({
      staff_id: bmStaffId,
      service_id: bmServiceId,
      from,
      to,
      duration_minutes: durationMinutes,
    })
      .then((res) => {
        const slots = res?.slots || [];
        const startMs = new Date(startAt).getTime();
        const endMs = new Date(endAt).getTime();
        const ok = slots.some((s: any) => {
          const sStart = new Date(s.start).getTime();
          const sEnd = new Date(s.end).getTime();
          return sStart === startMs && sEnd === endMs;
        });
        setSlotAllowed(ok);
      })
      .catch(() => setSlotAllowed(false))
      .finally(() => setCheckingSlot(false));
  }, [
    onlyBookInOpenHours,
    bmServiceId,
    bmStaffId,
    bmDate,
    bmStartTime,
    bmEndTime,
    services,
    timeZone,
  ]);

  const nowParts = getZonedParts(now, timeZone);
  const nowHour = nowParts.hour + nowParts.minute / 60;
  const nowTop = (nowHour - HOURS[0]) * 64;

  function getBookingsForDay(date: Date): BookingItem[] {
    const targetKey = dayKeyInTimeZone(date, timeZone);
    return bookings.filter((b) => {
      const bDate = parseISO(b.start_at);
      if (dayKeyInTimeZone(bDate, timeZone) !== targetKey) return false;
      if (filterStaffId && b.staff_id !== filterStaffId) return false;
      if (filterServiceId && b.service_id !== filterServiceId) return false;
      return true;
    });
  }

  function getBookingPosition(booking: BookingItem) {
    const start = parseISO(booking.start_at);
    const end = parseISO(booking.end_at);
    const startHour = decimalHourInTimeZone(start, timeZone);
    const endHour = decimalHourInTimeZone(end, timeZone);
    const top = (startHour - HOURS[0]) * 64;
    const height = Math.max((endHour - startHour) * 64, 20);
    return { top, height };
  }

  function getBookingColor(staffId: string) {
    const idx = staff.findIndex((s) => s.id === staffId);
    return BOOKING_COLORS[idx % BOOKING_COLORS.length];
  }

  async function handleCreateBooking() {
    if (!bmServiceId || !bmStaffId || !bmCustomerId) {
      alert("Please fill all required fields");
      return;
    }
    if (onlyBookInOpenHours && !slotAllowed) {
      alert("Selected time is not within open hours for this staff/service.");
      return;
    }
    setBmSaving(true);
    try {
      const startAt = localISO(bmDate, bmStartTime, timeZone);
      const endAt = localISO(bmDate, bmEndTime, timeZone);
      await createBooking({
        StaffID: bmStaffId,
        CustomerID: bmCustomerId,
        ServiceID: bmServiceId,
        StartAt: startAt,
        EndAt: endAt,
      });
      setBookingModalOpen(false);
      fetchBookings();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setBmSaving(false);
  }

  async function handleCancelBooking(id: string) {
    if (!confirm("Cancel this booking?")) return;
    try {
      await cancelBooking(id);
      fetchBookings();
      setSelectedBooking(null);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  }

  function openBookingModal(date?: Date, hour?: number) {
    setBmServiceId(services.length > 0 ? services[0].id : "");
    setBmStaffId(staff.length > 0 ? staff[0].id : "");
    setBmCustomerId(customers.length > 0 ? customers[0].id : "");
    setBmDate(dayKeyInTimeZone(date || new Date(), timeZone));
    const h = hour || 9;
    setBmStartTime(`${String(h).padStart(2, "0")}:00`);
    const svc = services.length > 0 ? services[0] : null;
    const dur = svc ? svc.duration_minutes : 30;
    const endH = h + Math.floor(dur / 60);
    const endM = dur % 60;
    setBmEndTime(
      `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
    );
    setBookingModalOpen(true);
  }

  // Mini calendar
  const miniCalDays = useMemo(() => {
    const start = startOfMonth(miniCalMonth);
    const end = endOfMonth(miniCalMonth);
    const allDays = eachDayOfInterval({ start, end });
    const firstDayOfWeek = (getDay(start) + 6) % 7;
    const padding = Array.from({ length: firstDayOfWeek }, (_, i) =>
      addDays(start, -(firstDayOfWeek - i))
    );
    return [...padding, ...allDays];
  }, [miniCalMonth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-56 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto p-4">
        {/* Mini month navigation */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800">
              {format(miniCalMonth, "MMMM yyyy")}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setMiniCalMonth((m) => addMonths(m, -1))}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMiniCalMonth((m) => addMonths(m, 1))}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0 text-center">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div
                key={i}
                className="text-[10px] text-gray-400 font-medium py-1"
              >
                {d}
              </div>
            ))}
            {miniCalDays.map((d, i) => {
              const sameMonth = isSameMonth(d, miniCalMonth);
              const today = isToday(d);
              const isSelected =
                !!selectedDate &&
                dayKeyInTimeZone(d, timeZone) === dayKeyInTimeZone(selectedDate, timeZone);
              return (
                <button
                  key={i}
                  onClick={() => {
                    const newWeekStart = startOfWeek(d, { weekStartsOn: 1 });
                    setWeekStart(newWeekStart);
                    setSelectedDate(d);
                  }}
                  className={`text-xs py-1 rounded-full transition-colors ${
                    isSelected
                      ? "bg-indigo-600 text-white font-bold"
                      : today
                      ? "bg-indigo-100 text-indigo-700 font-bold"
                      : sameMonth
                      ? "text-gray-700 hover:bg-gray-100"
                      : "text-gray-300"
                  }`}
                >
                  {getDate(d)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Filter by Staff
            </label>
            <select
              value={filterStaffId}
              onChange={(e) => setFilterStaffId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">All Staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Filter by Service
            </label>
            <select
              value={filterServiceId}
              onChange={(e) => setFilterServiceId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">All Services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main calendar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{getClientTimeZone()}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-800">
              {format(dates[0], "MMM d")} – {format(dates[6], "MMM d, yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setWeekStart((w) => addWeeks(w, -1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() =>
                (() => {
                  const t = new Date();
                  setSelectedDate(t);
                  setWeekStart(startOfWeek(t, { weekStartsOn: 1 }));
                })()
              }
              className="text-xs font-semibold text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 border border-indigo-100"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setWeekStart((w) => addWeeks(w, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="text-sm text-gray-500 font-medium">Week</div>
        </div>

        {/* Day headers */}
        <div className="flex border-b border-gray-200 bg-white">
          <div className="w-16 flex-shrink-0" />
          {dates.map((d, i) => {
            const today = isToday(d);
            const isSelected =
              !!selectedDate && dayKeyInTimeZone(d, timeZone) === dayKeyInTimeZone(selectedDate, timeZone);
            return (
              <div
                key={i}
                className="flex-1 text-center py-2 border-l border-gray-100"
              >
                <div className="text-xs font-medium text-gray-400 uppercase">
                  {DAYS_LABEL[i]}
                </div>
                <div
                  className={`text-xl font-semibold mt-0.5 ${
                    isSelected ? "text-indigo-600" : today ? "text-indigo-600" : "text-gray-800"
                  }`}
                >
                  {format(d, "dd")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="flex-1 overflow-y-auto" ref={gridRef}>
          <div className="relative flex" style={{ minHeight: HOURS.length * 64 }}>
            {/* Time labels */}
            <div className="w-16 flex-shrink-0">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="h-16 flex items-start justify-end pr-2 pt-1 text-xs text-gray-400"
                >
                  {h === 0
                    ? "12 AM"
                    : h < 12
                    ? `${h} AM`
                    : h === 12
                    ? "12 PM"
                    : `${h - 12} PM`}
                </div>
              ))}
            </div>

            {/* Current time running line */}
            {nowTop >= 0 && nowTop <= HOURS.length * 64 && (
              <>
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: 64,
                    right: 0,
                    top: nowTop,
                    height: 2,
                    background: "rgba(99,102,241,0.85)",
                    zIndex: 5,
                  }}
                />
                <div
                  className="absolute pointer-events-none px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-semibold"
                  style={{
                    left: 72,
                    top: Math.max(nowTop - 18, 0),
                    zIndex: 6,
                  }}
                >
                  {formatTimeInTimeZone(now, timeZone)}
                </div>
              </>
            )}

            {/* Day columns */}
            {dates.map((d, dIdx) => {
              const dayBookings = getBookingsForDay(d);
              return (
                <div
                  key={dIdx}
                  className="flex-1 border-l border-gray-100 relative"
                >
                  {/* Hour lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="h-16 border-b border-gray-100 cursor-pointer cal-cell transition-colors"
                      onClick={() => openBookingModal(d, h)}
                    />
                  ))}

                  {/* Booking chips */}
                  {dayBookings.map((b) => {
                    const pos = getBookingPosition(b);
                    const color = getBookingColor(b.staff_id);
                    const svc = serviceMap[b.service_id];
                    const staffMember = staffMap[b.staff_id];
                    const start = parseISO(b.start_at);
                    const end = parseISO(b.end_at);
                    const startTime = formatTimeInTimeZone(start, timeZone);
                    const endTime = formatTimeInTimeZone(end, timeZone);

                    return (
                      <div
                        key={b.id}
                        className={`absolute left-1 right-1 ${color.bg} ${color.border} border-l-3 rounded-r-md px-2 py-1 cursor-pointer overflow-hidden booking-chip transition-all group`}
                        style={{
                          top: pos.top,
                          height: pos.height,
                          minHeight: 20,
                          zIndex: 10,
                        }}
                        title={`${svc?.name || "Service"} - ${staffMember?.display_name || "Staff"}`}
                        onClick={() => {
                          setSelectedBooking(b);
                          setSelectedDate(parseISO(b.start_at));
                        }}
                      >
                        <div className={`text-xs font-medium ${color.text} truncate`}>
                          {startTime} – {endTime}
                        </div>
                        {pos.height > 30 && (
                          <div className={`text-[10px] ${color.text} opacity-80 truncate`}>
                            {svc?.name || "Service"}
                          </div>
                        )}
                        {pos.height > 46 && (
                          <div className={`text-[10px] ${color.text} opacity-60 truncate`}>
                            {staffMember?.display_name || "Staff"}
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelBooking(b.id);
                          }}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white/80 text-gray-500 text-[10px] leading-none hidden group-hover:flex items-center justify-center hover:bg-red-100 hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right booking details sidebar (only when a booking is selected) */}
      {selectedBooking && (
        <div className="w-80 border-l border-gray-200 bg-white flex-shrink-0 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-gray-500">Appointment</div>
              <div className="text-lg font-semibold text-gray-900 mt-0.5">
                {serviceMap[selectedBooking.service_id]?.name || "Service"}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {formatTimeInTimeZone(parseISO(selectedBooking.start_at), timeZone)} –{" "}
                {formatTimeInTimeZone(parseISO(selectedBooking.end_at), timeZone)}
              </div>
            </div>
            <button
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              onClick={() => setSelectedBooking(null)}
              type="button"
            >
              ×
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">Staff:</span>{" "}
              <span>{staffMap[selectedBooking.staff_id]?.display_name || "Staff"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">Customer:</span>{" "}
              <span>{customerMap[selectedBooking.customer_id]?.full_name || "Customer"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">Status:</span>{" "}
              <span className="capitalize">{selectedBooking.status}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">Time zone:</span> <span>{timeZone}</span>
            </div>
          </div>

          <div className="mt-6 border-t border-gray-100 pt-4">
            <button
              onClick={() => handleCancelBooking(selectedBooking.id)}
              className="w-full px-4 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg text-sm font-medium"
            >
              Cancel booking
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => openBookingModal()}
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all flex items-center justify-center z-40"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Booking modal */}
      <Modal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        title="New Appointment"
      >
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-4 border-b border-gray-100 pb-2">
            <span className="text-sm font-medium text-indigo-600 border-b-2 border-indigo-600 pb-2">
              Appointment
            </span>
            <span className="text-sm text-gray-400 pb-2 cursor-not-allowed">
              Block hours
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="only-openhours"
              type="checkbox"
              checked={onlyBookInOpenHours}
              onChange={(e) => setOnlyBookInOpenHours(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="only-openhours" className="text-sm text-gray-700">
              Only to book in openhour
            </label>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Service *</label>
            <select
              value={bmServiceId}
              onChange={(e) => {
                setBmServiceId(e.target.value);
                const svc = services.find((s) => s.id === e.target.value);
                if (svc) {
                  const [h, m] = bmStartTime.split(":").map(Number);
                  const totalMin = h * 60 + m + svc.duration_minutes;
                  const endH = Math.floor(totalMin / 60);
                  const endM = totalMin % 60;
                  setBmEndTime(
                    `${String(endH).padStart(2, "0")}:${String(endM).padStart(
                      2,
                      "0"
                    )}`
                  );
                }
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select Service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_minutes} min)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Staff *</label>
            <select
              value={bmStaffId}
              onChange={(e) => setBmStaffId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Any Employee</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={bmDate}
                onChange={(e) => setBmDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start</label>
              <input
                type="time"
                value={bmStartTime}
                onChange={(e) => setBmStartTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End</label>
              <input
                type="time"
                value={bmEndTime}
                onChange={(e) => setBmEndTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {onlyBookInOpenHours && (
            <div className="text-xs">
              {checkingSlot ? (
                <p className="text-indigo-600">Checking open hours for this slot...</p>
              ) : slotAllowed ? (
                <p className="text-emerald-600">This slot is within open hours.</p>
              ) : (
                <p className="text-rose-600">Selected time is NOT within open hours.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Customer *
            </label>
            <select
              value={bmCustomerId}
              onChange={(e) => setBmCustomerId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            {customers.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No customers yet. Add one in the Customers page first.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={() => setBookingModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateBooking}
              disabled={
                bmSaving ||
                checkingSlot ||
                !bmServiceId ||
                !bmStaffId ||
                !bmCustomerId ||
                (onlyBookInOpenHours && !slotAllowed)
              }
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {bmSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
