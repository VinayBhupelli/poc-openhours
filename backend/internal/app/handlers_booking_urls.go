package app

import (
	"net/http"

	"openhours-poc/backend/internal/db"

	"github.com/jackc/pgx/v5/pgtype"
)

func (a *API) listBookingURLs(w http.ResponseWriter, r *http.Request) {
	items, err := a.queries.ListBookingURLsByBusiness(r.Context(), a.business)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if items == nil {
		items = []db.BookingUrl{}
	}
	writeJSON(w, 200, items)
}

func (a *API) createBookingURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		StaffID string `json:"staff_id"`
		Slug    string `json:"slug"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	var staffID pgtype.UUID
	if req.StaffID != "" {
		var err error
		staffID, err = parseUUID(req.StaffID)
		if err != nil {
			writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
			return
		}
	}
	item, err := a.queries.CreateBookingURL(r.Context(), db.CreateBookingURLParams{
		BusinessID: a.business, StaffID: staffID, Slug: req.Slug, IsActive: true,
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 201, item)
}

