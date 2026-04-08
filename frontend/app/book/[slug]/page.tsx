"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  publicGetBookingURL,
  publicListServices,
  publicListStaff,
  publicGetAvailability,
  publicCreateBooking,
} from "@/lib/api";
import { getClientTimeZone } from "@/lib/datetime";
import {
  format,
  parseISO,
  addDays,
  isSameDay,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  CheckCircle,
  CalendarDays,
  ArrowLeft,
} from "lucide-react";

interface ServiceItem {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  is_active: boolean;
}

interface StaffMember {
  id: string;
  display_name: string;
  email: string;
  is_active: boolean;
}

interface SlotItem {
  start: string;
  end: string;
  capacity: number;
}

type Step = "service" | "staff" | "datetime" | "details" | "confirmed";

export default function BookingPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [bookingURL, setBookingURL] = useState<any>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [monthCursor, setMonthCursor] = useState(() =>
    startOfMonth(new Date())
  );

  // Customer details form
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    publicGetBookingURL(slug)
      .then((data) => {
        setBookingURL(data);
        return publicListServices(data.staff_id || undefined);
      })
      .then((svcs) => {
        setServices((svcs || []).filter((s: ServiceItem) => s.is_active));
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [slug]);

  useEffect(() => {
    if (!selectedService) return;
    const staffId = bookingURL?.staff_id;
    publicListStaff(selectedService.id)
      .then((data) => {
        const active = (data || []).filter((s: StaffMember) => s.is_active);
        setStaffList(active);
        if (staffId) {
          const match = active.find((s: StaffMember) => s.id === staffId);
          if (match) {
            setSelectedStaff(match);
            setStep("datetime");
          }
        }
      })
      .catch(() => setStaffList([]));
  }, [selectedService, bookingURL]);

  const fetchSlots = useCallback(async () => {
    if (!selectedService || !selectedStaff) return;
    setLoadingSlots(true);
    try {
      const monthStart = startOfMonth(monthCursor);
      const monthEnd = endOfMonth(monthCursor);
      const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
      const from = rangeStart.toISOString();
      const to = addDays(rangeEnd, 1).toISOString();
      const res = await publicGetAvailability({
        staff_id: selectedStaff.id,
        service_id: selectedService.id,
        from,
        to,
        duration_minutes: selectedService.duration_minutes,
      });
      setSlots(res.slots || []);
    } catch {
      setSlots([]);
    }
    setLoadingSlots(false);
  }, [selectedService, selectedStaff, monthCursor]);

  useEffect(() => {
    if (step === "datetime" && selectedService && selectedStaff) {
      fetchSlots();
    }
  }, [step, fetchSlots, selectedService, selectedStaff]);

  useEffect(() => {
    if (!selectedDate) return;
    if (!isSameMonth(selectedDate, monthCursor)) {
      setSelectedDate(null);
      setSelectedSlot(null);
    }
  }, [monthCursor, selectedDate]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(monthCursor);
    const monthEnd = endOfMonth(monthCursor);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [monthCursor]);

  const slotsForDate = useMemo(() => {
    if (!selectedDate) return [];
    return slots.filter((s) => isSameDay(parseISO(s.start), selectedDate));
  }, [slots, selectedDate]);

  const datesWithSlots = useMemo(() => {
    const set = new Set<string>();
    slots.forEach((s) => {
      set.add(format(parseISO(s.start), "yyyy-MM-dd"));
    });
    return set;
  }, [slots]);

  async function handleBook() {
    if (!selectedSlot || !selectedStaff || !selectedService) return;
    setBooking(true);
    try {
      const res = await publicCreateBooking({
        StaffID: selectedStaff.id,
        ServiceID: selectedService.id,
        StartAt: selectedSlot.start,
        EndAt: selectedSlot.end,
        customer_email: custEmail.trim(),
        customer_name: custName.trim(),
        customer_phone: custPhone.trim() || undefined,
      });
      setBookingResult(res);
      setStep("confirmed");
    } catch (e: any) {
      alert("Booking failed: " + e.message);
    }
    setBooking(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-500 font-medium mb-2">
            Could not load booking page
          </p>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Book an Appointment
            </h1>
            <p className="text-sm text-gray-500">
              {bookingURL?.slug ? `${bookingURL.slug}` : ""}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Times in {getClientTimeZone()}
            </p>
          </div>
          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {(["service", "staff", "datetime", "details"] as Step[]).map(
              (s, i) => (
                <div
                  key={s}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                    step === s
                      ? "bg-indigo-600 text-white"
                      : i <
                        ["service", "staff", "datetime", "details"].indexOf(
                          step
                        )
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {i + 1}
                </div>
              )
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Step 1: Service */}
        {step === "service" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Select a Service
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Choose the type of appointment you&apos;d like to book
            </p>
            {services.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  No services available at the moment
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {services.map((svc) => (
                  <button
                    key={svc.id}
                    onClick={() => {
                      setSelectedService(svc);
                      setStep("staff");
                    }}
                    className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all text-left group"
                  >
                    <div>
                      <div className="font-medium text-gray-900 group-hover:text-indigo-700">
                        {svc.name}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {svc.duration_minutes} min
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Staff */}
        {step === "staff" && (
          <div>
            <button
              onClick={() => {
                setStep("service");
                setSelectedService(null);
              }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Choose a Staff Member
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              For: {selectedService?.name} ({selectedService?.duration_minutes}{" "}
              min)
            </p>
            {staffList.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <User className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  No staff available for this service
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {staffList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedStaff(s);
                      setStep("datetime");
                    }}
                    className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium">
                        {s.display_name
                          .split(" ")
                          .map((w: string) => w[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 group-hover:text-indigo-700">
                          {s.display_name}
                        </div>
                        {s.email && (
                          <div className="text-sm text-gray-400">
                            {s.email}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === "datetime" && (
          <div>
            <button
              onClick={() => {
                setStep("staff");
                setSelectedStaff(null);
                setSelectedDate(null);
                setSelectedSlot(null);
              }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Pick a Date & Time
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {selectedService?.name} with {selectedStaff?.display_name}
            </p>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Month calendar */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0 w-full max-w-md">
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor((m) => addMonths(m, -1))
                    }
                    className="p-1 rounded hover:bg-gray-100"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                  </button>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      {format(monthCursor, "MMMM yyyy")}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        (() => {
                          const t = new Date();
                          setMonthCursor(startOfMonth(t));
                          setSelectedDate(t);
                          setSelectedSlot(null);
                        })()
                      }
                      className="text-[11px] font-semibold text-indigo-600 px-2 py-0.5 rounded-md hover:bg-indigo-50 border border-indigo-100"
                    >
                      Today
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor((m) => addMonths(m, 1))
                    }
                    className="p-1 rounded hover:bg-gray-100"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(
                        (w) => (
                          <div key={w} className="py-1">
                            {w}
                          </div>
                        )
                      )}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {calendarDays.map((d) => {
                        const key = format(d, "yyyy-MM-dd");
                        const hasSlots = datesWithSlots.has(key);
                        const inMonth = isSameMonth(d, monthCursor);
                        const isSelected =
                          selectedDate && isSameDay(d, selectedDate);
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!hasSlots}
                            onClick={() => setSelectedDate(d)}
                            className={`aspect-square max-h-11 rounded-lg flex flex-col items-center justify-center text-[11px] transition-all ${
                              !inMonth
                                ? "text-gray-300"
                                : isSelected
                                ? "bg-indigo-600 text-white shadow-sm"
                                : hasSlots
                                ? "bg-indigo-50 text-indigo-800 hover:bg-indigo-100 font-medium"
                                : "text-gray-300 cursor-not-allowed"
                            }`}
                          >
                            <span className="text-[15px] font-bold leading-none">
                              {format(d, "d")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Time slots */}
              <div className="flex-1">
                {!selectedDate ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">
                      Select a date to see available times
                    </p>
                  </div>
                ) : slotsForDate.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">
                      No available slots on this date
                    </p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Available times for{" "}
                      {format(selectedDate, "EEEE, MMMM d")}
                    </h3>
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {slotsForDate.map((s, i) => {
                        const isSelected =
                          selectedSlot?.start === s.start;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedSlot(s)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "border border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
                            }`}
                          >
                            {format(parseISO(s.start), "h:mm a")}
                          </button>
                        );
                      })}
                    </div>
                    {selectedSlot && (
                      <button
                        onClick={() => setStep("details")}
                        className="w-full mt-4 px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Continue
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Details & Confirm */}
        {step === "details" && (
          <div className="max-w-md mx-auto">
            <button
              onClick={() => {
                setStep("datetime");
                setSelectedSlot(null);
              }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Your Details
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Almost done! Just fill in your information.
            </p>

            {/* Booking summary */}
            <div className="bg-indigo-50 rounded-xl p-4 mb-6">
              <div className="text-sm text-indigo-800 space-y-1">
                <div className="font-medium">{selectedService?.name}</div>
                <div>with {selectedStaff?.display_name}</div>
                <div>
                  {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
                </div>
                <div>
                  {selectedSlot &&
                    `${format(parseISO(selectedSlot.start), "h:mm a")} – ${format(
                      parseISO(selectedSlot.end),
                      "h:mm a"
                    )}`}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <button
                onClick={handleBook}
                disabled={booking || !custName || !custEmail}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {booking ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Confirmed */}
        {step === "confirmed" && (
          <div className="max-w-md mx-auto text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Booking Confirmed!
            </h2>
            <p className="text-gray-500 mb-6">
              Your appointment has been successfully booked.
            </p>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-left mb-6">
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium text-gray-900">
                    {selectedService?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Staff</span>
                  <span className="font-medium text-gray-900">
                    {selectedStaff?.display_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-900">
                    {selectedDate && format(selectedDate, "MMMM d, yyyy")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Time</span>
                  <span className="font-medium text-gray-900">
                    {selectedSlot &&
                      `${format(parseISO(selectedSlot.start), "h:mm a")} – ${format(
                        parseISO(selectedSlot.end),
                        "h:mm a"
                      )}`}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setStep("service");
                setSelectedService(null);
                setSelectedStaff(null);
                setSelectedDate(null);
                setSelectedSlot(null);
                setBookingResult(null);
                setCustName("");
                setCustEmail("");
                setCustPhone("");
              }}
              className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Book Another Appointment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
