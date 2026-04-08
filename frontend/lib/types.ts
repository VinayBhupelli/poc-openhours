export interface Staff {
  id: string;
  business_id: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  default_capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityRule {
  id: string;
  business_id: string;
  staff_id: string;
  timezone: string;
  start_local: string;
  end_local: string;
  rrule: string;
  effective_from: string;
  effective_until: string | null;
  default_capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Slot {
  start: string;
  end: string;
  capacity: number;
}

export interface Booking {
  id: string;
  business_id: string;
  staff_id: string;
  customer_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BookingURL {
  id: string;
  business_id: string;
  staff_id: string | null;
  slug: string;
  is_active: boolean;
}
