package app

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"openhours-poc/backend/internal/db"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (a *API) availableStaff(w http.ResponseWriter, r *http.Request) {
	serviceID := r.URL.Query().Get("service_id")
	if serviceID == "" {
		writeJSON(w, 400, map[string]any{"error": "service_id required"})
		return
	}
	sid, err := parseUUID(serviceID)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid service_id"})
		return
	}
	rows, err := a.queries.ListRuleServicesByService(r.Context(), sid)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	seen := map[string]bool{}
	out := make([]string, 0)
	for _, rr := range rows {
		k := uuidToString(rr.StaffID)
		if k != "" && !seen[k] {
			seen[k] = true
			out = append(out, k)
		}
	}
	writeJSON(w, 200, map[string]any{"staff_ids": out})
}

func (a *API) availabilityPreview(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	staff := r.URL.Query().Get("staff_id")
	service := r.URL.Query().Get("service_id")
	fromRaw := r.URL.Query().Get("from")
	toRaw := r.URL.Query().Get("to")
	durationRaw := r.URL.Query().Get("duration_minutes")
	if staff == "" || service == "" || fromRaw == "" || toRaw == "" {
		writeJSON(w, 400, map[string]any{"error": "staff_id, service_id, from, to are required"})
		return
	}
	staffID, err := parseUUID(staff)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
		return
	}
	serviceID, err := parseUUID(service)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid service_id"})
		return
	}
	from, err := time.Parse(time.RFC3339, fromRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid from"})
		return
	}
	to, err := time.Parse(time.RFC3339, toRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid to"})
		return
	}
	dur := int32(30)
	if durationRaw != "" {
		if parsed, parseErr := time.ParseDuration(durationRaw + "m"); parseErr == nil {
			dur = int32(parsed.Minutes())
		}
	}
	slots, err := a.engine.GetAvailability(r.Context(), staffID, serviceID, from, to, dur, 1)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	log.Printf("availability_preview staff=%s service=%s range=%s..%s slots=%d elapsed_ms=%d", staff, service, from.Format(time.RFC3339), to.Format(time.RFC3339), len(slots), time.Since(started).Milliseconds())
	writeJSON(w, 200, map[string]any{"slots": slots, "count": len(slots)})
}

func (a *API) listBookings(w http.ResponseWriter, r *http.Request) {
	fromRaw := r.URL.Query().Get("from")
	toRaw := r.URL.Query().Get("to")
	if fromRaw == "" || toRaw == "" {
		// Avoid noisy errors when /v1/public/bookings is fetched without query (e.g. prefetch).
		if strings.HasPrefix(r.URL.Path, "/v1/public/") {
			writeJSON(w, 200, []any{})
			return
		}
		writeJSON(w, 400, map[string]any{"error": "from and to are required"})
		return
	}
	from, err := time.Parse(time.RFC3339, fromRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid from"})
		return
	}
	to, err := time.Parse(time.RFC3339, toRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid to"})
		return
	}
	items, err := a.queries.ListBookingsByBusinessRange(r.Context(), db.ListBookingsByBusinessRangeParams{
		// booking.sql expects:
		//   end_at > $3  (we pass `from`)
		//   start_at < $4 (we pass `to`)
		// sqlc binds params as (BusinessID, Column2, EndAt, StartAt),
		// so set EndAt=from and StartAt=to.
		BusinessID: a.business, Column2: false, EndAt: ts(from), StartAt: ts(to),
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if items == nil {
		items = []db.Booking{}
	}
	writeJSON(w, 200, items)
}

func (a *API) cancelBooking(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	item, err := a.queries.CancelBooking(r.Context(), id)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

func (a *API) createBooking(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	var req struct {
		// Support both legacy (capitalized) and snake_case JSON keys.
		// Public booking flow historically uses StaffID/ServiceID/StartAt/EndAt,
		// while admin/UI APIs tend to use staff_id/service_id/start_at/end_at.
		StaffID      string `json:"StaffID"`
		StaffIDAlt   string `json:"staff_id"`
		ServiceID    string `json:"ServiceID"`
		ServiceIDAlt string `json:"service_id"`

		CustomerID    string `json:"customer_id"`
		CustomerIDAlt string `json:"CustomerID"`
		CustomerEmail string `json:"customer_email"`
		CustomerName  string `json:"customer_name"`
		CustomerPhone string `json:"customer_phone"`

		StartAt    time.Time `json:"StartAt"`
		StartAtAlt time.Time `json:"start_at"`
		EndAt      time.Time `json:"EndAt"`
		EndAtAlt   time.Time `json:"end_at"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}

	staffRaw := req.StaffID
	if staffRaw == "" {
		staffRaw = req.StaffIDAlt
	}
	staffID, err := parseUUID(staffRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
		return
	}
	var customerID pgtype.UUID
	customerRaw := req.CustomerID
	if customerRaw == "" {
		customerRaw = req.CustomerIDAlt
	}
	if customerRaw != "" {
		customerID, err = parseUUID(customerRaw)
		if err != nil {
			writeJSON(w, 400, map[string]any{"error": "invalid customer_id"})
			return
		}
	} else {
		email := strings.TrimSpace(strings.ToLower(req.CustomerEmail))
		if email == "" {
			writeJSON(w, 400, map[string]any{"error": "customer_email or customer_id is required"})
			return
		}
		existing, err := a.queries.GetCustomerByBusinessEmail(r.Context(), db.GetCustomerByBusinessEmailParams{BusinessID: a.business, Btrim: email})
		if err == nil {
			customerID = existing.ID
		} else if errors.Is(err, pgx.ErrNoRows) {
			name := strings.TrimSpace(req.CustomerName)
			if name == "" {
				name = email
			}
			c, cerr := a.queries.CreateCustomer(r.Context(), db.CreateCustomerParams{
				BusinessID: a.business,
				FullName:   name,
				Email:      text(email),
				Phone:      text(strings.TrimSpace(req.CustomerPhone)),
			})
			if cerr != nil {
				writeJSON(w, 500, map[string]any{"error": cerr.Error()})
				return
			}
			customerID = c.ID
		} else {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
	}
	serviceRaw := req.ServiceID
	if serviceRaw == "" {
		serviceRaw = req.ServiceIDAlt
	}
	serviceID, err := parseUUID(serviceRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid service_id"})
		return
	}

	startAt := req.StartAt
	if startAt.IsZero() {
		startAt = req.StartAtAlt
	}
	endAt := req.EndAt
	if endAt.IsZero() {
		endAt = req.EndAtAlt
	}
	if startAt.IsZero() || endAt.IsZero() {
		writeJSON(w, 400, map[string]any{"error": "start_at and end_at are required"})
		return
	}

	tx, err := a.pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	defer tx.Rollback(r.Context())

	lockKey := fmt.Sprintf("%s:%s:%d", uuidToString(staffID), uuidToString(serviceID), startAt.Unix())
	if _, err := tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock(hashtext($1))", lockKey); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}

	qtx := a.queries.WithTx(tx)
	// Availability engine expands RRULE occurrence windows first; query a wide range
	// to avoid excluding the parent occurrence start for slots within it.
	availabilityFrom := startAt.Add(-24 * time.Hour)
	availabilityTo := endAt.Add(24 * time.Hour)
	slots, err := a.engine.GetAvailability(
		r.Context(),
		staffID,
		serviceID,
		availabilityFrom,
		availabilityTo,
		int32(endAt.Sub(startAt).Minutes()),
		1,
	)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	allowed := false
	for _, s := range slots {
		if s.Start.Equal(startAt) && s.End.Equal(endAt) {
			allowed = true
			break
		}
	}
	if !allowed {
		log.Printf("booking_conflict staff=%s service=%s start=%s elapsed_ms=%d", uuidToString(staffID), uuidToString(serviceID), startAt.Format(time.RFC3339), time.Since(started).Milliseconds())
		writeJSON(w, 409, map[string]any{"error": "slot already booked"})
		return
	}
	b, err := qtx.CreateBooking(r.Context(), db.CreateBookingParams{BusinessID: a.business, StaffID: staffID, CustomerID: customerID, ServiceID: serviceID, StartAt: ts(startAt), EndAt: ts(endAt), Status: "confirmed"})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	log.Printf("booking_created staff=%s service=%s start=%s elapsed_ms=%d", uuidToString(staffID), uuidToString(serviceID), startAt.Format(time.RFC3339), time.Since(started).Milliseconds())
	writeJSON(w, 201, b)
}

