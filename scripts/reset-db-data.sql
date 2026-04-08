-- Wipe all application data (keeps schema). Run after: make migrate
-- Re-seed: make seed (from project root)

TRUNCATE TABLE
  override_services,
  availability_overrides,
  availability_exceptions,
  availability_rule_services,
  availability_rules,
  bookings,
  booking_urls,
  staff_services
RESTART IDENTITY CASCADE;
