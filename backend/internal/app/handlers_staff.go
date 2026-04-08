package app

import (
	"net/http"

	"openhours-poc/backend/internal/db"

	"github.com/go-chi/chi/v5"
)

func (a *API) listStaff(w http.ResponseWriter, r *http.Request) {
	items, err := a.queries.ListStaffByBusiness(r.Context(), db.ListStaffByBusinessParams{BusinessID: a.business, Column2: true})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, items)
}

func (a *API) createStaff(w http.ResponseWriter, r *http.Request) {
	var req struct{ DisplayName, Email string }
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.CreateStaff(r.Context(), db.CreateStaffParams{BusinessID: a.business, DisplayName: req.DisplayName, Email: text(req.Email)})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 201, item)
}

func (a *API) updateStaff(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	var req struct {
		DisplayName, Email string
		IsActive           bool
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	item, err := a.queries.UpdateStaff(r.Context(), db.UpdateStaffParams{ID: id, DisplayName: req.DisplayName, Email: text(req.Email), IsActive: req.IsActive})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

func (a *API) deleteStaff(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid id"})
		return
	}
	existing, err := a.queries.GetStaffByID(r.Context(), id)
	if err != nil {
		writeJSON(w, 404, map[string]any{"error": "not found"})
		return
	}
	item, err := a.queries.UpdateStaff(r.Context(), db.UpdateStaffParams{ID: id, DisplayName: existing.DisplayName, Email: existing.Email, IsActive: false})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, item)
}

