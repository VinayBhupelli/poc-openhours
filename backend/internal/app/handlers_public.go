package app

import (
	"net/http"

	"openhours-poc/backend/internal/db"

	"github.com/go-chi/chi/v5"
)

func (a *API) publicBookingURL(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	item, err := a.queries.GetBookingURLBySlug(r.Context(), slug)
	if err != nil {
		writeJSON(w, 404, map[string]any{"error": "booking url not found"})
		return
	}
	writeJSON(w, 200, item)
}

func (a *API) publicServices(w http.ResponseWriter, r *http.Request) {
	staffRaw := r.URL.Query().Get("staff_id")
	if staffRaw != "" {
		staffID, err := parseUUID(staffRaw)
		if err != nil {
			writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
			return
		}
		items, err := a.queries.ListServicesByStaff(r.Context(), db.ListServicesByStaffParams{StaffID: staffID, BusinessID: a.business})
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, 200, items)
		return
	}
	items, err := a.queries.ListServicesByBusiness(r.Context(), db.ListServicesByBusinessParams{BusinessID: a.business, Column2: true})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, items)
}

func (a *API) publicStaff(w http.ResponseWriter, r *http.Request) {
	serviceRaw := r.URL.Query().Get("service_id")
	if serviceRaw == "" {
		items, err := a.queries.ListStaffByBusiness(r.Context(), db.ListStaffByBusinessParams{BusinessID: a.business, Column2: true})
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, 200, items)
		return
	}
	serviceID, err := parseUUID(serviceRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid service_id"})
		return
	}
	items, err := a.queries.ListStaffByService(r.Context(), db.ListStaffByServiceParams{ServiceID: serviceID, BusinessID: a.business})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, items)
}

