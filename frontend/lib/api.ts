const BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Staff
export const listStaff = () => request<any[]>("/v1/staff");
export const createStaff = (data: { DisplayName: string; Email: string }) =>
  request<any>("/v1/staff", { method: "POST", body: JSON.stringify(data) });
export const updateStaff = (
  id: string,
  data: { DisplayName: string; Email: string; IsActive: boolean }
) =>
  request<any>(`/v1/staff/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const deleteStaff = (id: string) =>
  request<any>(`/v1/staff/${id}`, { method: "DELETE" });

// Services
export const listServices = () => request<any[]>("/v1/services");
export const createService = (data: {
  Name: string;
  DurationMinutes: number;
  BufferBeforeMinutes: number;
  BufferAfterMinutes: number;
  DefaultCapacity: number;
}) =>
  request<any>("/v1/services", { method: "POST", body: JSON.stringify(data) });
export const updateService = (
  id: string,
  data: {
    Name: string;
    DurationMinutes: number;
    BufferBeforeMinutes: number;
    BufferAfterMinutes: number;
    DefaultCapacity: number;
    IsActive: boolean;
  }
) =>
  request<any>(`/v1/services/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const deleteService = (id: string) =>
  request<any>(`/v1/services/${id}`, { method: "DELETE" });

// Customers
export const listCustomers = () => request<any[]>("/v1/customers");
export const createCustomer = (data: {
  FullName: string;
  Email: string;
  Phone: string;
}) =>
  request<any>("/v1/customers", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateCustomer = (
  id: string,
  data: {
    FullName: string;
    Email: string;
    Phone: string;
    IsActive: boolean;
  }
) =>
  request<any>(`/v1/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const deleteCustomer = (id: string) =>
  request<any>(`/v1/customers/${id}`, { method: "DELETE" });

// Service Durations
export const listServiceDurations = (serviceId: string) =>
  request<any[]>(`/v1/services/${serviceId}/durations`);
export const createServiceDuration = (
  serviceId: string,
  data: { duration_minutes: number; price_cents: number }
) =>
  request<any>(`/v1/services/${serviceId}/durations`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateServiceDuration = (
  id: string,
  data: {
    duration_minutes: number;
    price_cents: number;
    is_active: boolean;
  }
) =>
  request<any>(`/v1/service-durations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const deleteServiceDuration = (id: string) =>
  request<any>(`/v1/service-durations/${id}`, { method: "DELETE" });

export const publicListServiceDurations = (serviceId: string) =>
  request<any[]>(`/v1/public/services/${serviceId}/durations`);

// Availability Rules
export const listRules = (staffId: string) =>
  request<any[]>(`/v1/availability/rules?staff_id=${staffId}`);
export const createRule = (data: {
  staff_id: string;
  rule_type: "weekly" | "custom";
  timezone: string;
  start_local: string;
  end_local: string;
  rrule: string;
  effective_from: string;
  effective_until?: string;
  default_capacity: number;
  service_ids: string[];
}) =>
  request<any>("/v1/availability/rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateRule = (
  id: string,
  data: {
    rule_type: "weekly" | "custom";
    timezone: string;
    start_local: string;
    end_local: string;
    rrule: string;
    effective_from: string;
    effective_until?: string | null;
    default_capacity: number;
    is_active: boolean;
    /** When set, replaces active rule ↔ service links */
    service_ids?: string[];
  }
) =>
  request<any>(`/v1/availability/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

// Availability preview
export const getAvailability = (params: {
  staff_id: string;
  service_id: string;
  from: string;
  to: string;
  duration_minutes?: number;
}) => {
  const qs = new URLSearchParams({
    staff_id: params.staff_id,
    service_id: params.service_id,
    from: params.from,
    to: params.to,
  });
  if (params.duration_minutes)
    qs.set("duration_minutes", String(params.duration_minutes));
  return request<{ slots: any[]; count: number }>(
    `/v1/bookings/availability?${qs}`
  );
};

// Available staff for a service
export const getAvailableStaff = (serviceId: string) =>
  request<{ staff_ids: string[] }>(
    `/v1/bookings/available-staff?service_id=${serviceId}`
  );

// Bookings
export const listBookings = (from: string, to: string) =>
  request<any[]>(`/v1/bookings?from=${from}&to=${to}`);
export const createBooking = (data: {
  StaffID: string;
  CustomerID: string;
  ServiceID: string;
  StartAt: string;
  EndAt: string;
}) =>
  request<any>("/v1/bookings", {
    method: "POST",
    body: JSON.stringify({
      staff_id: data.StaffID,
      customer_id: data.CustomerID,
      service_id: data.ServiceID,
      start_at: data.StartAt,
      end_at: data.EndAt,
    }),
  });
export const cancelBooking = (id: string) =>
  request<any>(`/v1/bookings/${id}`, { method: "DELETE" });

// Public APIs (no auth needed)
export const publicGetBookingURL = (slug: string) =>
  request<any>(`/v1/public/booking-url/${slug}`);
export const publicListServices = (staffId?: string) => {
  const qs = staffId ? `?staff_id=${staffId}` : "";
  return request<any[]>(`/v1/public/services${qs}`);
};
export const publicListStaff = (serviceId?: string) => {
  const qs = serviceId ? `?service_id=${serviceId}` : "";
  return request<any[]>(`/v1/public/staff${qs}`);
};
export const publicGetAvailability = (params: {
  staff_id: string;
  service_id: string;
  from: string;
  to: string;
  duration_minutes?: number;
}) => {
  const qs = new URLSearchParams({
    staff_id: params.staff_id,
    service_id: params.service_id,
    from: params.from,
    to: params.to,
  });
  if (params.duration_minutes)
    qs.set("duration_minutes", String(params.duration_minutes));
  return request<{ slots: any[]; count: number }>(
    `/v1/public/availability?${qs}`
  );
};

// Admin: resolved open-hours windows for a week (exceptions/overrides merged server-side).
export const getAdminMergedOpenHours = (params: {
  staff_id: string;
  from: string;
  to: string;
  time_zone: string;
}) => {
  const qs = new URLSearchParams({
    staff_id: params.staff_id,
    from: params.from,
    to: params.to,
    time_zone: params.time_zone,
  });
  return request<{ slots: any[]; count: number }>(`/v1/admin/open-hours/merged?${qs}`);
};
export const publicCreateBooking = (data: {
  StaffID: string;
  ServiceID: string;
  StartAt: string;
  EndAt: string;
  CustomerID?: string;
  customer_email: string;
  customer_name?: string;
  customer_phone?: string;
}) =>
  request<any>("/v1/public/bookings", {
    method: "POST",
    body: JSON.stringify(data),
  });

/** Soft-delete a rule (entire series). */
export const deactivateRule = (id: string, rule: {
  rule_type: "weekly" | "custom";
  timezone: string;
  start_local: string;
  end_local: string;
  rrule: string;
  effective_from: string;
  effective_until?: string | null;
  default_capacity: number;
}) =>
  updateRule(id, {
    ...rule,
    is_active: false,
  });

export const mutateRule = (
  ruleId: string,
  body: Record<string, unknown>
) =>
  request<any>(`/v1/availability/rules/${ruleId}/mutations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
