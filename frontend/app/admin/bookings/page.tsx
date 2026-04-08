"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  addDays,
} from "date-fns";
import { listStaff, listServices, listCustomers, listBookings, cancelBooking } from "@/lib/api";
import { getClientTimeZone } from "@/lib/datetime";

type StaffMember = { id: string; display_name: string; email: string };
type ServiceItem = { id: string; name: string; duration_minutes: number; is_active: boolean };
type CustomerItem = { id: string; full_name: string };
type BookingItem = {
  id: string;
  staff_id: string;
  customer_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
};

export default function AdminBookingsPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [filterStaffId, setFilterStaffId] = useState("");

  const today = new Date();
  const [fromDate, setFromDate] = useState(
    format(startOfMonth(today), "yyyy-MM-dd")
  );
  const [toDate, setToDate] = useState(
    format(endOfMonth(today), "yyyy-MM-dd")
  );
  const [appliedFrom, setAppliedFrom] = useState(fromDate);
  const [appliedTo, setAppliedTo] = useState(toDate);

  const rangeIso = useMemo(() => {
    const fromIso = `${appliedFrom}T00:00:00.000Z`;
    // Backend query treats `to` as an exclusive boundary.
    const toExclusive = addDays(parseISO(appliedTo), 1);
    const toIso = toExclusive.toISOString();
    return { fromIso, toIso };
  }, [appliedFrom, appliedTo]);

  const dateRange = useMemo(() => {
    return { from: rangeIso.fromIso, to: rangeIso.toIso };
  }, [rangeIso.fromIso, rangeIso.toIso]);

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
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await listBookings(dateRange.from, dateRange.to);
      setBookings((res || []).filter((b: BookingItem) => b.status !== "cancelled"));
    } catch {
      setBookings([]);
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!loading) fetchBookings();
  }, [loading, fetchBookings]);

  const shown = useMemo(() => {
    if (!filterStaffId) return bookings;
    return bookings.filter((b) => b.staff_id === filterStaffId);
  }, [bookings, filterStaffId]);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this booking?")) return;
    await cancelBooking(id);
    fetchBookings();
  }

  const tz = getClientTimeZone();

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-4">
        <div className="text-sm text-gray-500">Times in {tz}</div>
        <div className="text-xl font-semibold text-gray-900 mt-1">
          Bookings ({appliedFrom} – {appliedTo})
        </div>
      </div>

      <div className="flex gap-4 items-start mb-4">
        <div className="min-w-64">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Filter by staff
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

        <div className="min-w-64">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Date range
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAppliedFrom(fromDate);
              setAppliedTo(toDate);
            }}
            className="mt-2 w-full px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            Apply
          </button>
          <div className="text-[11px] text-gray-500 mt-1">
            Defaults to the current month.
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : shown.length === 0 ? (
        <div className="text-sm text-gray-500">No bookings in this range.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Date</th>
                  <th className="text-left py-3 px-4 font-medium">Time</th>
                  <th className="text-left py-3 px-4 font-medium">Staff</th>
                  <th className="text-left py-3 px-4 font-medium">Service</th>
                  <th className="text-left py-3 px-4 font-medium">Customer</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown
                  .slice()
                  .sort((a, b) => parseISO(a.start_at).getTime() - parseISO(b.start_at).getTime())
                  .map((b) => {
                    const start = parseISO(b.start_at);
                    return (
                      <tr key={b.id} className="border-t border-gray-100">
                        <td className="py-3 px-4 whitespace-nowrap text-gray-700">
                          {format(start, "EEE, MMM d")}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-gray-700">
                          {format(start, "HH:mm")} – {format(parseISO(b.end_at), "HH:mm")}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-gray-700">
                          {staffMap[b.staff_id]?.display_name || b.staff_id}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-gray-700">
                          {serviceMap[b.service_id]?.name || b.service_id}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-gray-700">
                          {customerMap[b.customer_id]?.full_name || b.customer_id}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleCancel(b.id)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

