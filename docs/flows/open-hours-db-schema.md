# OpenHours DB Tables

This document explains the main OpenHours database tables in simple terms: why each table exists, what we store in it, and when we write to it.

This intentionally does not explain `staff`, `customers`, `app_users`, `businesses`, or `booking_urls`.

## Big Picture

OpenHours keeps availability and bookings separate.

Availability answers: "When is this staff member open for this service?"

Bookings answer: "Which of those open times are already taken?"

The system starts from base open-hour rules, applies any deleted or edited occurrences, then removes confirmed bookings when it needs client-bookable appointment slots.

## Table Summary

| Table | Simple purpose |
|-------|----------------|
| `services` | Stores what can be booked, like haircut, consultation, or massage. |
| `staff_services` | Stores a direct staff-to-service link. |
| `service_durations` | Stores extra duration and price options for a service. |
| `availability_rules` | Stores the base open-hour rule for a staff member. |
| `availability_rule_services` | Stores which services are allowed during a base open-hour rule. |
| `availability_exceptions` | Stores deleted single occurrences from a recurring rule. |
| `availability_overrides` | Stores edited single occurrences from a recurring rule. |
| `override_services` | Stores which services are allowed during an edited single occurrence. |
| `bookings` | Stores actual appointments. |

## `services`

**Why we need it**

`services` tells OpenHours what the business offers and what clients/admins can book.

Examples:
- Haircut
- Consultation
- Dental cleaning

**What we store**

- Service name
- Default duration
- Optional buffer before and after
- Default capacity
- Whether the service is active

**When we store it**

- When Admin creates a service.
- When Admin updates a service name, duration, buffers, capacity, or active state.
- When the dashboard or booking page needs to show available service choices.

**How it is used**

- Client chooses a service before seeing appointment slots.
- Admin attaches services to open-hour rules.
- Availability uses the service duration to split open windows into bookable appointment slots.

## `staff_services`

**Why we need it**

`staff_services` is a direct link between staff and services.

It answers: "Can this staff member provide this service?"

**What we store**

- Staff
- Service
- Whether that staff-service link is active

**When we store it**

- When the system needs a direct staff-to-service relationship.
- When staff/service setup changes.

**How it is used**

- It helps public booking discover which staff can provide a selected service.
- Staff can also be discovered through open-hour service links, but this table gives a direct staff-service mapping.

## `service_durations`

**Why we need it**

`services.duration_minutes` gives a default duration. `service_durations` allows a service to have extra duration options.

Example:
- Consultation: 30 minutes
- Consultation: 60 minutes

**What we store**

- Service
- Duration in minutes
- Optional price
- Whether the duration option is active

**When we store it**

- When Admin adds an extra duration option for a service.
- When Admin updates or removes a duration option.

**How it is used**

- It can support booking flows where the same service has multiple duration choices.
- In basic availability, the selected duration decides how open windows are split into appointment slots.

## `availability_rules`

**Why we need it**

`availability_rules` stores the base schedule for a staff member.

This is the main table for staff open hours.

Instead of storing every future occurrence as a separate row, the system stores one rule and expands it when needed.

Examples:
- Every Monday from 9 AM to 5 PM
- Every weekday from 10 AM to 3 PM
- Does not repeat on April 7 from 9 AM to 5 PM
- Daily until a selected date

**What we store**

- Staff
- Rule type
- Time zone
- Local start time
- Local end time
- Recurrence rule
- Effective start date
- Optional effective end date
- Default capacity
- Whether the rule is active

**When we store it**

- When Admin creates weekly, daily, weekday, monthly, custom, or non-repeating open hours.
- When Admin edits the entire series.
- When Admin chooses "this and following" and the system needs to split the old series into an old rule and a new rule.
- When Admin deletes an entire series, the rule is marked inactive.
- When Admin deletes "this and following", the old rule is shortened so it ends before the selected occurrence.

**How it is used**

- The availability engine expands the rule into real date/time windows for the selected range.
- The admin dashboard uses the expanded windows to render open-hour blocks.
- Client booking uses the expanded windows as the starting point for bookable slots.

## `availability_rule_services`

**Why we need it**

One open-hour rule can allow one or more services.

`availability_rule_services` stores which services are allowed during a base open-hour rule.

Example:
- Jane is open Monday 9 AM to 5 PM for Haircut and Consultation.
- The base rule is stored once in `availability_rules`.
- Haircut and Consultation are stored as service links in `availability_rule_services`.

**What we store**

- Open-hour rule
- Staff
- Service
- Optional capacity override
- Whether the service link is active

**When we store it**

- When Admin creates an open-hour rule and selects services.
- When Admin changes which services apply to an entire series.
- When Admin creates a new rule during "this and following".
- When service links are deactivated instead of removing the base rule.

**How it is used**

- The availability engine only expands base rules that are linked to the requested service.
- The admin dashboard loops through services and groups the same rule occurrence across services into one dashboard block.
- Different rules with the same time are not merged together, because they need to remain separately editable/deletable.

## `availability_exceptions`

**Why we need it**

`availability_exceptions` stores deleted single occurrences.

We need this because deleting one Monday from a weekly rule should not delete the whole weekly rule.

**What we store**

- Open-hour rule
- Staff
- Original occurrence start
- Reason, usually deleted

**When we store it**

- When Admin deletes a single occurrence that was not edited before.
- When Admin deletes a single occurrence that was edited earlier, after the edited override is removed.

**How it is used**

- The availability engine expands the base rule, then removes any occurrence listed in `availability_exceptions`.
- The dashboard and client booking will not show that deleted occurrence.

## `availability_overrides`

**Why we need it**

`availability_overrides` stores edited single occurrences.

We need this because changing one occurrence should not change the entire recurring rule.

Example:
- Base rule: every Monday 9 AM to 5 PM.
- One Monday is changed to 10 AM to 2 PM.
- The base rule stays the same.
- The edited Monday is stored in `availability_overrides`.

**What we store**

- Open-hour rule
- Staff
- Original occurrence start
- New start time
- New end time
- Optional capacity
- Whether the occurrence is closed
- Whether the override is active

**When we store it**

- When Admin edits a single occurrence for the first time.
- When Admin edits a single occurrence that was already edited earlier.
- When the system needs to preserve individual modifications while editing this-and-following or the entire series.
- When reset individual modifications is accepted, related overrides are removed.

**How it is used**

- The availability engine expands the base rule, finds the matching override, and uses the edited time instead of the base time.
- The original occurrence start is kept so future edit/delete actions can still target the correct occurrence.

## `override_services`

**Why we need it**

An edited occurrence can have a different service selection than the base recurring rule.

`override_services` stores which services apply to that edited occurrence.

Example:
- Base rule allows Haircut and Consultation.
- One edited occurrence only allows Consultation.
- That edited service selection is stored in `override_services`.

**What we store**

- Edited occurrence override
- Service
- Whether that service link is active

**When we store it**

- When Admin edits a single occurrence and selects services for that edited occurrence.
- When Admin edits the same single occurrence again, old override service links are deactivated and the new selected services are stored.
- When an override is deleted, its override service links are removed first.

**How it is used**

- The availability engine uses `override_services` to decide which services can use the edited occurrence.
- If an override applies to one service but not another, the non-selected service does not show the base occurrence for that date.
- Override-only windows can still be shown when the main recurrence no longer includes the service but the edited occurrence still does.

## `bookings`

**Why we need it**

`bookings` stores real appointments.

Availability tells us when a staff member could be booked. `bookings` tells us which of those times are already taken.

**What we store**

- Staff
- Customer
- Service
- Start time
- End time
- Status, such as confirmed or cancelled
- Optional source rule or source override reference

**When we store it**

- When Admin books an appointment for a customer.
- When Client books an appointment.
- When an appointment is cancelled, the booking status is changed to cancelled.

**How it is used**

- Calendar view shows bookings by week.
- Client availability removes confirmed bookings from the list of bookable slots.
- Booking creation checks availability again before inserting the confirmed booking.

## How The Tables Work Together

### Creating Open Hours

When Admin creates open hours:

1. OpenHours creates one row in `availability_rules`.
2. OpenHours creates one or more rows in `availability_rule_services`.
3. Nothing is stored in `availability_exceptions` or `availability_overrides` yet, because no individual occurrence has been changed.

### Editing One Occurrence

When Admin edits one occurrence:

1. The base row in `availability_rules` stays as-is.
2. OpenHours creates or updates one row in `availability_overrides`.
3. OpenHours stores the edited occurrence's selected services in `override_services`.
4. The availability engine shows the override instead of the base occurrence for that date.

### Deleting One Occurrence

When Admin deletes one occurrence:

1. OpenHours stores the deleted occurrence in `availability_exceptions`.
2. If that occurrence had an override, OpenHours removes the related `override_services` and `availability_overrides`.
3. The availability engine removes that occurrence when it expands the base rule.

### Editing This And Following

When Admin edits "this and following":

1. OpenHours shortens the old `availability_rules` row so it ends before the selected occurrence.
2. OpenHours creates a new `availability_rules` row that starts from the selected occurrence.
3. OpenHours creates `availability_rule_services` rows for the new rule.
4. If Admin keeps individual modifications, future exceptions and overrides are moved or re-keyed to the new rule.
5. If Admin resets individual modifications, future `availability_exceptions`, `availability_overrides`, and `override_services` are removed.

### Editing The Entire Series

When Admin edits the entire series:

1. OpenHours updates the existing `availability_rules` row.
2. OpenHours updates which services are active in `availability_rule_services`.
3. If Admin keeps individual modifications, existing exceptions and overrides are preserved and re-aligned when needed.
4. If Admin resets individual modifications, related `availability_exceptions`, `availability_overrides`, and `override_services` are removed.

### Deleting This And Following

When Admin deletes "this and following":

1. If the selected occurrence is the first occurrence, OpenHours treats it like deleting the entire series.
2. Otherwise, OpenHours shortens the existing `availability_rules` row so it ends before the selected occurrence.
3. OpenHours removes future `availability_exceptions`, `availability_overrides`, and `override_services` that no longer apply.

### Deleting The Entire Series

When Admin deletes the entire series:

1. OpenHours marks the `availability_rules` row inactive.
2. OpenHours cleans up related occurrence changes from `availability_exceptions`, `availability_overrides`, and `override_services`.
3. OpenHours deactivates related service links in `availability_rule_services`.

### Showing Admin Dashboard Open Hours

When Admin views the open-hours dashboard:

1. OpenHours reads active services.
2. OpenHours resolves active `availability_rules` for each service.
3. OpenHours removes deleted occurrences from `availability_exceptions`.
4. OpenHours applies edited occurrences from `availability_overrides` and `override_services`.
5. OpenHours groups the same rule occurrence across services into one dashboard block.
6. OpenHours keeps different rules separate even if they have the same time, so edit/delete actions still target the correct rule.

### Showing Client Bookable Slots

When Client views availability:

1. OpenHours starts with open windows from `availability_rules` and `availability_rule_services`.
2. OpenHours removes deleted occurrences from `availability_exceptions`.
3. OpenHours applies edited occurrences from `availability_overrides` and `override_services`.
4. OpenHours splits the remaining windows into appointment-sized slots.
5. OpenHours removes slots that overlap confirmed `bookings`.
6. Client sees only the final bookable slots.

