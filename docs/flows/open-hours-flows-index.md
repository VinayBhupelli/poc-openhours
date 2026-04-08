# User & System Flows

## Writing Principles

These flows describe what OpenHours does from a product and system-behavior perspective. They should stay readable for product, architecture, and engineering readers without depending on implementation details like route names or database table names.

Each detailed flow should capture both sides in the same place:
- **User flow:** What the actor is trying to do and what choices they make.
- **System flow:** How OpenHours interprets the choice, applies recurrence, and preserves or resets occurrence-level changes.

Keep flows flat. If one flow depends on another, reference the related flow ID in the detailed flow body instead of nesting sub-flows.

## Flow Types

| Type | Use |
|------|-----|
| **Business** | User-visible behavior in the admin or client experience. |
| **Integration** | Cross-system behavior or public/admin API interaction that matters as a product contract. |
| **Runtime** | Internal system behavior such as recurrence expansion, exception/override resolution, cleanup, or re-keying. |

## Actors

| Actor | Description |
|-------|-------------|
| **Admin** | Manages staff open hours from the admin dashboard. For this phase, admin is the primary actor. |
| **Client** | Books against available open hours. Client flows are intentionally deferred until the admin flows are written. |
| **OpenHours System** | Applies recurrence rules, expands availability, stores exceptions/overrides, and keeps staff/service availability consistent. |

## Flow Index

Flows are numbered by category prefix so new flows can be added without renumbering unrelated categories:
- **STF-xxx**: Staff management
- **SVC-xxx**: Service management
- **CUS-xxx**: Customer management
- **CAL-xxx**: Calendar view and admin booking
- **OHV-xxx**: Open-hours dashboard viewing
- **OHC-xxx**: Open-hours creation
- **OHE-xxx**: Open-hours editing
- **OHD-xxx**: Open-hours deletion
- **OHR-xxx**: Open-hours resolution/runtime behavior
- **CLB-xxx**: Client-side booking
- **AVE-xxx**: Availability engine behavior

### Staff

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| STF-100 | Admin sees staff in the staff section | Business | Admin | staff.md |
| STF-200 | Admin creates staff | Business | Admin | staff.md |
| STF-300 | Admin updates staff | Business | Admin | staff.md |
| STF-400 | Admin deletes staff | Business | Admin | staff.md |

### Service

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| SVC-100 | Admin sees services in the service section | Business | Admin | service.md |
| SVC-200 | Admin creates service with a duration | Business | Admin | service.md |
| SVC-300 | Admin updates a service | Business | Admin | service.md |
| SVC-400 | Admin deletes a service | Business | Admin | service.md |

### Customer

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| CUS-100 | Admin sees customers in the customer section | Business | Admin | customer.md |
| CUS-200 | Admin creates a customer | Business | Admin | customer.md |
| CUS-300 | Admin updates a customer | Business | Admin | customer.md |
| CUS-400 | Admin deletes a customer | Business | Admin | customer.md |

### Calendar View

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| CAL-100 | Admin sees all bookings for staff and services | Business | Admin | open-hours-flows.md |
| CAL-200 | Admin switches the week to see bookings in another week | Business | Admin | open-hours-flows.md |
| CAL-300 | Admin filters bookings by staff and service | Business | Admin | open-hours-flows.md |
| CAL-400 | Admin books an appointment for a customer with a service and staff | Business | Admin | open-hours-flows.md |

### Viewing & Resolution

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| OHV-100 | Admin views staff open-hours dashboard | Business | Admin | open-hours-flows.md |
| OHR-100 | OpenHours dashboard resolves all the staff open-hour windows | Runtime | OpenHours System | open-hours-flows.md |

### Creating Open Hours

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| OHC-100 | Admin creates weekly staff open hours | Business | Admin | open-hours-flows.md |
| OHC-200 | Admin creates daily recurring staff open hours | Business | Admin | open-hours-flows.md |
| OHC-210 | Admin creates daily recurring staff open hours that end on a selected date | Business | Admin | open-hours-flows.md |
| OHC-220 | Admin creates daily recurring staff open hours that end after a number of occurrences | Business | Admin | open-hours-flows.md |
| OHC-300 | Admin creates weekday recurring staff open hours | Business | Admin | open-hours-flows.md |
| OHC-400 | Admin creates monthly recurring staff open hours | Business | Admin | open-hours-flows.md |
| OHC-500 | Admin creates non-repeating staff open hour | Business | Admin | open-hours-flows.md |
| OHC-600 | Admin creates custom recurring staff open hours | Business | Admin | open-hours-flows.md |

### Editing Open Hours

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| OHE-100 | Admin edits a single occurrence for the first time | Business | Admin | open-hours-flows.md |
| OHE-200 | Admin edits a single occurrence that was already edited earlier | Business | Admin | open-hours-flows.md |
| OHE-300 | Admin edits this and following occurrences and does not reset individual modifications | Business | Admin | open-hours-flows.md |
| OHE-400 | Admin edits this and following occurrences and accepts resetting individual modifications | Business | Admin | open-hours-flows.md |
| OHE-500 | Admin chooses this and following but on the first occurrence of the recurrence series | Business | Admin | open-hours-flows.md |
| OHE-600 | Admin edits the entire series and does not reset individual modifications | Business | Admin | open-hours-flows.md |
| OHE-700 | Admin edits the entire series and accepts resetting individual modifications | Business | Admin | open-hours-flows.md |

### Deleting Open Hours

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| OHD-100 | Admin deletes a single occurrence which is not edited before | Business | Admin | open-hours-flows.md |
| OHD-200 | Admin deletes a single occurrence that was already edited earlier | Business | Admin | open-hours-flows.md |
| OHD-300 | Admin deletes this and following occurrences | Business | Admin | open-hours-flows.md |
| OHD-400 | Admin chooses delete this and following on the first occurrence | Business | Admin | open-hours-flows.md |
| OHD-500 | Admin deletes the entire series | Business | Admin | open-hours-flows.md |

### Client Side Booking

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| CLB-100 | Client sees what services are available for booking | Business | Client | open-hours-flows.md |
| CLB-200 | Client books an appointment | Business | Client | open-hours-flows.md |

### Availability Engine

| ID | Name | Type | Actor | File |
|----|------|------|------|---------|
| AVE-100 | Availability engine resolves the open-hour windows shown to Admin in the dashboard week grid | Runtime | OpenHours System | open-hours-flows.md |
| AVE-200 | Availability engine resolves client bookable slots | Runtime | OpenHours System | open-hours-flows.md |

## Comments

- Staff, service, customer, calendar view, and open-hours flows are ordered to follow the admin dashboard areas and the setup dependencies between them.
- Client-side booking flows are listed after the admin setup and OpenHours management flows.
- Availability engine flows are listed last because they describe the runtime behavior behind admin and client availability displays.
- The create flows separate weekly, daily, weekday, monthly, non-repeating, and custom recurrence because those are separate admin choices even though they converge into rule-based availability.
- The edit and delete flows separate first-time occurrence edits, previously edited occurrence edits, reset behavior, and first-occurrence fallbacks because those change the expected system behavior.
