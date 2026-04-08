package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	"openhours-poc/backend/internal/db"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func datePtr(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return dateFromTime(*t)
}

// cleanupRuleSeries removes child rows for a rule in FK-safe order.
// Intended for "delete entire series" semantics.
func cleanupRuleSeries(ctx context.Context, tx pgx.Tx, ruleID pgtype.UUID) error {
	// Delete children first.
	if _, err := tx.Exec(ctx, `
		DELETE FROM override_services
		WHERE override_id IN (SELECT id FROM availability_overrides WHERE rule_id = $1)
	`, ruleID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM availability_overrides WHERE rule_id = $1`, ruleID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM availability_exceptions WHERE rule_id = $1`, ruleID); err != nil {
		return err
	}
	// Keep service rows but make them inactive to avoid stale UI associations.
	if _, err := tx.Exec(ctx, `UPDATE availability_rule_services SET is_active = FALSE WHERE rule_id = $1`, ruleID); err != nil {
		return err
	}
	return nil
}

func (a *API) createRule(w http.ResponseWriter, r *http.Request) {
	var req struct {
		StaffID         string   `json:"staff_id"`
		RuleType        string   `json:"rule_type"`
		Timezone        string   `json:"timezone"`
		StartLocal      string   `json:"start_local"`
		EndLocal        string   `json:"end_local"`
		RRule           string   `json:"rrule"`
		EffectiveFrom   string   `json:"effective_from"`
		EffectiveUntil  *string  `json:"effective_until"`
		DefaultCapacity int32    `json:"default_capacity"`
		ServiceIDs      []string `json:"service_ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if req.RuleType != "weekly" && req.RuleType != "custom" {
		writeJSON(w, 400, map[string]any{"error": "rule_type must be 'weekly' or 'custom'"})
		return
	}
	startLocal, err := parseFlexibleTime(req.StartLocal)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "start_local: " + err.Error()})
		return
	}
	endLocal, err := parseFlexibleTime(req.EndLocal)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "end_local: " + err.Error()})
		return
	}
	effectiveFrom, err := parseFlexibleTime(req.EffectiveFrom)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "effective_from: " + err.Error()})
		return
	}
	effUntil, err := parseFlexibleTimePtr(req.EffectiveUntil)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "effective_until: " + err.Error()})
		return
	}
	staffID, err := parseUUID(req.StaffID)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
		return
	}
	rule, err := a.queries.CreateAvailabilityRule(r.Context(), db.CreateAvailabilityRuleParams{
		BusinessID: a.business, StaffID: staffID, RuleType: req.RuleType, Timezone: req.Timezone, StartLocal: pgtype.Timestamp{Time: startLocal, Valid: true}, EndLocal: pgtype.Timestamp{Time: endLocal, Valid: true}, Rrule: req.RRule,
		EffectiveFrom: dateFromTime(effectiveFrom), EffectiveUntil: datePtr(effUntil), DefaultCapacity: req.DefaultCapacity,
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	for _, sid := range req.ServiceIDs {
		serviceID, err := parseUUID(sid)
		if err != nil {
			writeJSON(w, 400, map[string]any{"error": "invalid service_id: " + sid})
			return
		}
		if _, err := a.queries.CreateAvailabilityRuleService(r.Context(), db.CreateAvailabilityRuleServiceParams{
			RuleID:    rule.ID,
			StaffID:   staffID,
			ServiceID: serviceID,
			IsActive:  true,
		}); err != nil {
			writeJSON(w, 500, map[string]any{"error": "availability_rule_services: " + err.Error()})
			return
		}
	}
	writeJSON(w, 201, rule)
}

func (a *API) updateRule(w http.ResponseWriter, r *http.Request) {
	ruleID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid rule id"})
		return
	}
	var req struct {
		RuleType        string    `json:"rule_type"`
		Timezone        string    `json:"timezone"`
		StartLocal      string    `json:"start_local"`
		EndLocal        string    `json:"end_local"`
		RRule           string    `json:"rrule"`
		EffectiveFrom   string    `json:"effective_from"`
		EffectiveUntil  *string   `json:"effective_until"`
		DefaultCapacity int32     `json:"default_capacity"`
		IsActive        bool      `json:"is_active"`
		ServiceIDs      *[]string `json:"service_ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if req.RuleType != "weekly" && req.RuleType != "custom" {
		writeJSON(w, 400, map[string]any{"error": "rule_type must be 'weekly' or 'custom'"})
		return
	}
	startLocal, err := parseFlexibleTime(req.StartLocal)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "start_local: " + err.Error()})
		return
	}
	endLocal, err := parseFlexibleTime(req.EndLocal)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "end_local: " + err.Error()})
		return
	}
	effectiveFrom, err := parseFlexibleTime(req.EffectiveFrom)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "effective_from: " + err.Error()})
		return
	}
	effUntil, err := parseFlexibleTimePtr(req.EffectiveUntil)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "effective_until: " + err.Error()})
		return
	}

	// For delete semantics (is_active=false), cleanup children in the same transaction
	// to avoid leaving orphan rows that still reference rule_id.
	tx, err := a.pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	defer tx.Rollback(r.Context())
	qtx := a.queries.WithTx(tx)

	item, err := qtx.UpdateAvailabilityRule(r.Context(), db.UpdateAvailabilityRuleParams{
		ID:              ruleID,
		RuleType:        req.RuleType,
		Timezone:        req.Timezone,
		StartLocal:      pgtype.Timestamp{Time: startLocal, Valid: true},
		EndLocal:        pgtype.Timestamp{Time: endLocal, Valid: true},
		Rrule:           req.RRule,
		EffectiveFrom:   dateFromTime(effectiveFrom),
		EffectiveUntil:  datePtr(effUntil),
		DefaultCapacity: req.DefaultCapacity,
		IsActive:        req.IsActive,
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}

	if !req.IsActive {
		if err := cleanupRuleSeries(r.Context(), tx, ruleID); err != nil {
			writeJSON(w, 500, map[string]any{"error": "cleanup rule series: " + err.Error()})
			return
		}
	}

	if req.ServiceIDs != nil {
		// If rule is being deleted, sync would just re-activate; skip.
		if req.IsActive {
			if err := a.syncAvailabilityRuleServices(r.Context(), ruleID, item.StaffID, *req.ServiceIDs); err != nil {
				writeJSON(w, 500, map[string]any{"error": err.Error()})
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, 200, item)
}

func (a *API) syncAvailabilityRuleServices(ctx context.Context, ruleID, staffID pgtype.UUID, serviceIDStrs []string) error {
	want := make(map[string]pgtype.UUID)
	for _, sid := range serviceIDStrs {
		u, err := parseUUID(sid)
		if err != nil {
			continue
		}
		want[uuidToString(u)] = u
	}
	existing, err := a.queries.ListAvailabilityRuleServicesByRule(ctx, db.ListAvailabilityRuleServicesByRuleParams{RuleID: ruleID, Column2: false})
	if err != nil {
		return err
	}
	for _, e := range existing {
		ks := uuidToString(e.ServiceID)
		if _, ok := want[ks]; !ok {
			if err := a.queries.SetAvailabilityRuleServiceState(ctx, db.SetAvailabilityRuleServiceStateParams{RuleID: ruleID, ServiceID: e.ServiceID, IsActive: false}); err != nil {
				return err
			}
		}
	}
	for _, u := range want {
		_, err := a.queries.CreateAvailabilityRuleService(ctx, db.CreateAvailabilityRuleServiceParams{RuleID: ruleID, StaffID: staffID, ServiceID: u, IsActive: true})
		if err != nil {
			_ = a.queries.SetAvailabilityRuleServiceState(ctx, db.SetAvailabilityRuleServiceStateParams{RuleID: ruleID, ServiceID: u, IsActive: true})
		}
	}
	return nil
}

func (a *API) listRules(w http.ResponseWriter, r *http.Request) {
	staff := r.URL.Query().Get("staff_id")
	if staff == "" {
		writeJSON(w, 400, map[string]any{"error": "staff_id is required"})
		return
	}
	staffID, err := parseUUID(staff)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
		return
	}
	items, err := a.queries.ListAvailabilityRulesByStaff(r.Context(), db.ListAvailabilityRulesByStaffParams{StaffID: staffID, Column2: true})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		svcs, err := a.queries.ListAvailabilityRuleServicesByRule(r.Context(), db.ListAvailabilityRuleServicesByRuleParams{RuleID: item.ID, Column2: true})
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
		ids := make([]string, 0, len(svcs))
		for _, s := range svcs {
			if s.IsActive {
				ids = append(ids, uuidToString(s.ServiceID))
			}
		}
		raw, err := json.Marshal(item)
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
		m["service_ids"] = ids
		out = append(out, m)
	}
	writeJSON(w, 200, out)
}

func (a *API) attachRuleService(w http.ResponseWriter, r *http.Request) {
	ruleID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid rule id"})
		return
	}
	var req struct {
		StaffID          string `json:"staff_id"`
		ServiceID        string `json:"service_id"`
		CapacityOverride *int32 `json:"capacity_override"`
		IsActive         bool   `json:"is_active"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	staffID, err := parseUUID(req.StaffID)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
		return
	}
	svcID, err := parseUUID(req.ServiceID)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid service_id"})
		return
	}
	item, err := a.queries.CreateAvailabilityRuleService(r.Context(), db.CreateAvailabilityRuleServiceParams{RuleID: ruleID, StaffID: staffID, ServiceID: svcID, CapacityOverride: int4(req.CapacityOverride), IsActive: req.IsActive})
	if err != nil {
		_ = a.queries.SetAvailabilityRuleServiceState(r.Context(), db.SetAvailabilityRuleServiceStateParams{RuleID: ruleID, ServiceID: svcID, IsActive: req.IsActive})
		writeJSON(w, 200, map[string]any{"updated": true})
		return
	}
	writeJSON(w, 201, item)
}

// adminMergedOpenHoursSlots expands recurrence rules and applies exceptions/overrides server-side,
// then merges per-service windows into distinct time blocks suitable for the admin grid.
func (a *API) adminMergedOpenHoursSlots(w http.ResponseWriter, r *http.Request) {
	staffRaw := r.URL.Query().Get("staff_id")
	fromRaw := r.URL.Query().Get("from")
	toRaw := r.URL.Query().Get("to")
	tzRaw := r.URL.Query().Get("time_zone")
	if staffRaw == "" || fromRaw == "" || toRaw == "" {
		writeJSON(w, 400, map[string]any{"error": "staff_id, from, to are required"})
		return
	}
	staffID, err := parseUUID(staffRaw)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid staff_id"})
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

	if tzRaw == "" {
		tzRaw = "UTC"
	}
	loc, err := time.LoadLocation(tzRaw)
	if err != nil {
		loc = time.UTC
	}

	services, err := a.queries.ListServicesByBusiness(r.Context(), db.ListServicesByBusinessParams{
		BusinessID: a.business,
		Column2:    true,
	})
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}

	// Preload override_services for the staff+range so overridden occurrences report the correct
	// service set even if the series' rule services were later changed.
	//
	// Keyed by (rule_id string, original_occurrence_start unix).
	overrideServiceIDs := map[string][]string{}
	rules, err := a.queries.ListAvailabilityRulesByStaff(r.Context(), db.ListAvailabilityRulesByStaffParams{
		StaffID:  staffID,
		Column2: true, // active only
	})
	if err == nil {
		for _, rr := range rules {
			// Skip rules that can't contribute windows in the requested range.
			if rr.EffectiveFrom.Valid && rr.EffectiveFrom.Time.After(to) {
				continue
			}
			if rr.EffectiveUntil.Valid {
				// effective_until is a DATE; treat it as end-of-day in rule TZ.
				if rr.EffectiveUntil.Time.Before(from) {
					continue
				}
			}

			ovrs, _ := a.queries.ListAvailabilityOverridesByRuleRange(r.Context(), db.ListAvailabilityOverridesByRuleRangeParams{
				RuleID:                 rr.ID,
				OriginalOccurrenceStart:   ts(from),
				OriginalOccurrenceStart_2: ts(to),
			})
			for _, ov := range ovrs {
				svcs, err := a.queries.ListOverrideServices(r.Context(), ov.ID)
				if err != nil {
					continue
				}
				if len(svcs) == 0 {
					continue
				}
				ids := make([]string, 0, len(svcs))
				for _, s := range svcs {
					ids = append(ids, uuidToString(s.ServiceID))
				}
				k := fmt.Sprintf("%s|%d", uuidToString(rr.ID), ov.OriginalOccurrenceStart.Time.Unix())
				overrideServiceIDs[k] = ids
			}
		}
	}

	type mergedSlot struct {
		date            string
		start           time.Time
		end             time.Time
		ruleID          *string
		occurrenceStart *string
		serviceIDs      map[string]bool
	}

	merged := map[string]*mergedSlot{}

	for _, svc := range services {
		svcIDStr := uuidToString(svc.ID)
		if svcIDStr == "" {
			continue
		}

		windows, err := a.engine.GetResolvedWindows(r.Context(), staffID, svc.ID, from, to)
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}

		for _, win := range windows {
			ruleIDStr := ""
			occStr := ""
			ridValid := win.RuleID != nil && win.RuleID.Valid
			if ridValid {
				ruleIDStr = uuidToString(*win.RuleID)
				if win.OccurrenceStart != nil {
					occStr = win.OccurrenceStart.UTC().Format(time.RFC3339)
				}
			}

			startUnix := win.Start.Unix()
			endUnix := win.End.Unix()
			occUnix := int64(-1)
			if win.OccurrenceStart != nil {
				occUnix = win.OccurrenceStart.Unix()
			}

			ovk := ""
			if ridValid && ruleIDStr != "" && occUnix != -1 {
				ovk = fmt.Sprintf("%s|%d", ruleIDStr, occUnix)
			}

			key := fmt.Sprintf("%s|%d|%d|%d", ruleIDStr, occUnix, startUnix, endUnix)
			if _, ok := merged[key]; !ok {
				date := win.Start.In(loc).Format("2006-01-02")
				var ridPtr *string
				var occPtr *string
				if ridValid && ruleIDStr != "" {
					ridPtr = &ruleIDStr
					if occStr != "" {
						occPtr = &occStr
					}
				}
				svcSet := map[string]bool{svcIDStr: true}
				if ovk != "" {
					if ids, ok := overrideServiceIDs[ovk]; ok && len(ids) > 0 {
						svcSet = map[string]bool{}
						for _, id := range ids {
							if id != "" {
								svcSet[id] = true
							}
						}
					}
				}
				merged[key] = &mergedSlot{
					date:            date,
					start:           win.Start,
					end:             win.End,
					ruleID:          ridPtr,
					occurrenceStart: occPtr,
					serviceIDs:      svcSet,
				}
			} else {
				// If this occurrence has explicit override services, trust that set.
				if ovk != "" {
					if ids, ok := overrideServiceIDs[ovk]; ok && len(ids) > 0 {
						merged[key].serviceIDs = map[string]bool{}
						for _, id := range ids {
							if id != "" {
								merged[key].serviceIDs[id] = true
							}
						}
						continue
					}
				}
				merged[key].serviceIDs[svcIDStr] = true
			}
		}
	}

	out := make([]map[string]any, 0, len(merged))
	for _, ms := range merged {
		serviceIDs := make([]string, 0, len(ms.serviceIDs))
		for id := range ms.serviceIDs {
			serviceIDs = append(serviceIDs, id)
		}
		sort.Strings(serviceIDs)

		item := map[string]any{
			"date":        ms.date,
			"start":       ms.start.UTC().Format(time.RFC3339),
			"end":         ms.end.UTC().Format(time.RFC3339),
			"service_ids": serviceIDs,
		}
		if ms.ruleID != nil {
			item["rule_id"] = *ms.ruleID
		}
		if ms.occurrenceStart != nil {
			item["occurrence_start"] = *ms.occurrenceStart
		}
		out = append(out, item)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i]["date"].(string) != out[j]["date"].(string) {
			return out[i]["date"].(string) < out[j]["date"].(string)
		}
		return out[i]["start"].(string) < out[j]["start"].(string)
	})

	writeJSON(w, 200, map[string]any{"slots": out, "count": len(out)})
}

// deleteConflictingOverrides removes sibling rows sharing (rule_id, original_occurrence_start)
// with keepID. override_services must be deleted first (FK to availability_overrides).
func deleteConflictingOverrides(ctx context.Context, tx pgx.Tx, ruleID pgtype.UUID, originalOccStart pgtype.Timestamptz, keepID pgtype.UUID) error {
	_, err := tx.Exec(ctx, `
		DELETE FROM override_services
		WHERE override_id IN (
			SELECT id FROM availability_overrides
			WHERE rule_id = $1 AND original_occurrence_start = $2 AND id <> $3
		)
	`, ruleID, originalOccStart, keepID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		DELETE FROM availability_overrides
		WHERE rule_id = $1 AND original_occurrence_start = $2 AND id <> $3
	`, ruleID, originalOccStart, keepID)
	return err
}

// deleteOverridesFromRuleFromOccurrence removes overrides at or after fromOcc on ruleID and their override_services rows.
func deleteOverridesFromRuleFromOccurrence(ctx context.Context, tx pgx.Tx, ruleID pgtype.UUID, fromOcc pgtype.Timestamptz) error {
	_, err := tx.Exec(ctx, `
		DELETE FROM override_services
		WHERE override_id IN (
			SELECT id FROM availability_overrides
			WHERE rule_id = $1 AND original_occurrence_start >= $2
		)
	`, ruleID, fromOcc)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		DELETE FROM availability_overrides
		WHERE rule_id = $1 AND original_occurrence_start >= $2
	`, ruleID, fromOcc)
	return err
}

func (a *API) mutateRule(w http.ResponseWriter, r *http.Request) {
	ruleID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid rule id"})
		return
	}
	var req struct {
		Mode     string  `json:"mode"` // edit_this_occurence | edit_this_and_following | edit_entire_series | delete_this_occurence | delete_this_and_following | delete_this_series
		RuleType *string `json:"rule_type"`
		Timing   *struct {
			Timezone       string     `json:"timezone"`
			StartLocal     time.Time  `json:"start_local"`
			EndLocal       time.Time  `json:"end_local"`
			RRule          string     `json:"rrule"`
			EffectiveFrom  time.Time  `json:"effective_from"`
			EffectiveUntil *time.Time `json:"effective_until"`
		} `json:"timing"`
		ServiceIDs                   []string   `json:"service_ids"`
		Capacity                     *int32     `json:"capacity"`
		StaffID                      string     `json:"staff_id"`
		OccurrenceStart              *time.Time `json:"occurrence_start"`
		ResetIndividualModifications bool       `json:"reset_individual_modifications"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}

	if req.RuleType != nil && *req.RuleType != "" && *req.RuleType != "weekly" && *req.RuleType != "custom" {
		writeJSON(w, 400, map[string]any{"error": "rule_type must be 'weekly' or 'custom'"})
		return
	}

	switch req.Mode {
	case "edit_this_occurence":
		a.editThisOccurence(w, r, ruleID, req.Timing, req.ServiceIDs, req.Capacity, req.StaffID, req.OccurrenceStart)
	case "edit_this_and_following":
		a.editThisAndFollowing(w, r, ruleID, req.Timing, req.ServiceIDs, req.Capacity, req.StaffID, req.OccurrenceStart, req.ResetIndividualModifications, req.RuleType)
	case "edit_entire_series":
		a.editEntireSeries(w, r, ruleID, req.Timing, req.ServiceIDs, req.Capacity, req.StaffID, req.ResetIndividualModifications, req.RuleType)
	case "delete_this_occurence":
		a.deleteThisOccurence(w, r, ruleID, req.StaffID, req.OccurrenceStart)
	case "delete_this_and_following":
		a.deleteThisAndFollowing(w, r, ruleID, req.StaffID, req.OccurrenceStart)
	case "delete_this_series":
		a.deleteThisSeries(w, r, ruleID, req.StaffID)
	default:
		writeJSON(w, 400, map[string]any{"error": fmt.Sprintf("unknown mode %q", req.Mode)})
	}
}

// deleteThisOccurence deletes one occurrence by creating an exception, and removes any override for that occurrence.
func (a *API) deleteThisOccurence(w http.ResponseWriter, r *http.Request, ruleID pgtype.UUID, staffIDStr string, occurrenceStart *time.Time) {
	if occurrenceStart == nil {
		writeJSON(w, 400, map[string]any{"error": "occurrence_start required for delete_this_occurence mode"})
		return
	}
	staffID, _ := parseUUID(staffIDStr)

	tx, err := a.pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	defer tx.Rollback(r.Context())

	orig := ts(*occurrenceStart)
	// Remove any override for this occurrence (and its services) so it doesn't conflict.
	if _, err := tx.Exec(r.Context(), `
		DELETE FROM override_services
		WHERE override_id IN (
			SELECT id FROM availability_overrides WHERE rule_id = $1 AND original_occurrence_start = $2
		)
	`, ruleID, orig); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if _, err := tx.Exec(r.Context(), `
		DELETE FROM availability_overrides
		WHERE rule_id = $1 AND original_occurrence_start = $2
	`, ruleID, orig); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}

	// Create exception (idempotent).
	if _, err := tx.Exec(r.Context(), `
		INSERT INTO availability_exceptions (business_id, rule_id, staff_id, occurrence_start, reason)
		VALUES ($1,$2,$3,$4,'deleted')
		ON CONFLICT (rule_id, occurrence_start)
		DO UPDATE SET reason = 'deleted'
	`, a.business, ruleID, staffID, orig); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"mutation": "delete_this_occurence", "rule_id": uuidToString(ruleID)})
}

// deleteThisSeries deletes entire series: marks rule inactive and cleans up child rows.
func (a *API) deleteThisSeries(w http.ResponseWriter, r *http.Request, ruleID pgtype.UUID, staffIDStr string) {
	tx, err := a.pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	defer tx.Rollback(r.Context())

	// Mark rule inactive.
	if _, err := tx.Exec(r.Context(), `UPDATE availability_rules SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, ruleID); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	if err := cleanupRuleSeries(r.Context(), tx, ruleID); err != nil {
		writeJSON(w, 500, map[string]any{"error": "cleanup rule series: " + err.Error()})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"mutation": "delete_this_series", "rule_id": uuidToString(ruleID)})
}

// editThisOccurence creates/updates an override for a single occurrence.
func (a *API) editThisOccurence(w http.ResponseWriter, r *http.Request, ruleID pgtype.UUID, timing *struct {
	Timezone       string     `json:"timezone"`
	StartLocal     time.Time  `json:"start_local"`
	EndLocal       time.Time  `json:"end_local"`
	RRule          string     `json:"rrule"`
	EffectiveFrom  time.Time  `json:"effective_from"`
	EffectiveUntil *time.Time `json:"effective_until"`
}, serviceIDs []string, capacity *int32, staffIDStr string, occurrenceStart *time.Time) {
	if occurrenceStart == nil {
		writeJSON(w, 400, map[string]any{"error": "occurrence_start required for edit_this_occurence mode"})
		return
	}
	newStart := *occurrenceStart
	newEnd := newStart.Add(30 * time.Minute)
	if timing != nil {
		newStart = timing.StartLocal
		newEnd = timing.EndLocal
	}
	capArg := int4(capacity)
	staffID, _ := parseUUID(staffIDStr)

	var o db.AvailabilityOverride
	orig := ts(*occurrenceStart)
	row := a.pool.QueryRow(r.Context(), `
		INSERT INTO availability_overrides (
			business_id, rule_id, staff_id, original_occurrence_start, new_start, new_end, capacity, is_closed, is_active
		) VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,TRUE)
		ON CONFLICT (rule_id, original_occurrence_start)
		DO UPDATE SET
			staff_id = EXCLUDED.staff_id,
			new_start = EXCLUDED.new_start,
			new_end = EXCLUDED.new_end,
			capacity = EXCLUDED.capacity,
			is_closed = EXCLUDED.is_closed,
			is_active = EXCLUDED.is_active,
			updated_at = NOW()
		RETURNING id, business_id, rule_id, staff_id, original_occurrence_start, new_start, new_end, capacity, is_closed, is_active, created_at, updated_at
	`, a.business, ruleID, staffID, orig, ts(newStart), ts(newEnd), capArg)
	if err := row.Scan(&o.ID, &o.BusinessID, &o.RuleID, &o.StaffID, &o.OriginalOccurrenceStart, &o.NewStart, &o.NewEnd, &o.Capacity, &o.IsClosed, &o.IsActive, &o.CreatedAt, &o.UpdatedAt); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}

	if _, err := a.pool.Exec(r.Context(), `UPDATE override_services SET is_active = FALSE WHERE override_id = $1`, o.ID); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	for _, sid := range serviceIDs {
		sidU, err := parseUUID(sid)
		if err != nil {
			continue
		}
		if _, err := a.pool.Exec(r.Context(), `
			INSERT INTO override_services (override_id, service_id, is_active)
			VALUES ($1,$2,TRUE)
			ON CONFLICT (override_id, service_id)
			DO UPDATE SET is_active = TRUE
		`, o.ID, sidU); err != nil {
			writeJSON(w, 500, map[string]any{"error": err.Error()})
			return
		}
	}
	writeJSON(w, 200, map[string]any{"mutation": "single_occurrence", "override_id": uuidToString(o.ID)})
}

// editThisAndFollowing splits the series: truncates the old rule before occurrenceStart
// and creates a new rule from that date forward. Exceptions and overrides on or
// after the split date are migrated (re-keyed) to the new rule.
func (a *API) editThisAndFollowing(w http.ResponseWriter, r *http.Request, ruleID pgtype.UUID, timing *struct {
	Timezone       string     `json:"timezone"`
	StartLocal     time.Time  `json:"start_local"`
	EndLocal       time.Time  `json:"end_local"`
	RRule          string     `json:"rrule"`
	EffectiveFrom  time.Time  `json:"effective_from"`
	EffectiveUntil *time.Time `json:"effective_until"`
}, serviceIDs []string, capacity *int32, staffIDStr string, occurrenceStart *time.Time, resetIndividualModifications bool, ruleTypeArg *string) {
	if occurrenceStart == nil {
		writeJSON(w, 400, map[string]any{"error": "occurrence_start required for edit_this_and_following mode"})
		return
	}

	ctx := r.Context()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "begin tx: " + err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	// 1. Fetch old rule
	oldRule, err := db.New(tx).GetAvailabilityRuleByID(ctx, ruleID)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "fetch rule: " + err.Error()})
		return
	}

	staffID, _ := parseUUID(staffIDStr)
	oldTZ := oldRule.Timezone
	oldStartLocal := oldRule.StartLocal.Time

	// Determine new rule properties (apply timing changes if provided)
	newTZ := oldTZ
	newStartLocal := oldRule.StartLocal.Time
	newEndLocal := oldRule.EndLocal.Time
	newRRule := oldRule.Rrule
	newCap := oldRule.DefaultCapacity
	newRuleType := oldRule.RuleType
	if newRuleType == "" {
		newRuleType = "weekly"
	}
	if ruleTypeArg != nil && *ruleTypeArg != "" {
		newRuleType = *ruleTypeArg
	}
	if timing != nil {
		newTZ = timing.Timezone
		newStartLocal = timing.StartLocal
		newEndLocal = timing.EndLocal
		newRRule = timing.RRule
	}
	if capacity != nil {
		newCap = *capacity
	}
	timingChanged := !newStartLocal.Equal(oldStartLocal) || newTZ != oldTZ

	// 2. Compute split date: the calendar date of occurrenceStart in the old rule's timezone.
	oldLoc, err := time.LoadLocation(oldTZ)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "load tz: " + err.Error()})
		return
	}
	splitLocalDate := occurrenceStart.In(oldLoc)
	dayBefore := splitLocalDate.AddDate(0, 0, -1)
	splitDateStr := splitLocalDate.Format("2006-01-02")

	// If the split point is the first day of the series (effective_from), then
	// "this and following" is equivalent to editing the entire series; do not split.
	effFromDay := oldRule.EffectiveFrom.Time.In(oldLoc).Format("2006-01-02")
	if splitDateStr == effFromDay {
		// Let the dedicated handler apply rule updates + optional reset/rekey behavior.
		// Roll back this tx (safe even if it already rolled back via defer).
		_ = tx.Rollback(ctx)
		a.editEntireSeries(w, r, ruleID, timing, serviceIDs, capacity, staffIDStr, resetIndividualModifications, ruleTypeArg)
		return
	}

	// 3. Truncate old rule: set effective_until = day before split
	if _, err := tx.Exec(ctx, `UPDATE availability_rules SET effective_until = $2, updated_at = NOW() WHERE id = $1`,
		ruleID, dayBefore.Format("2006-01-02")); err != nil {
		writeJSON(w, 500, map[string]any{"error": "truncate old rule: " + err.Error()})
		return
	}

	// 4. Create new rule starting from split date
	var newRuleID pgtype.UUID
	effUntil := datePtr(nil)
	if timing != nil && timing.EffectiveUntil != nil {
		effUntil = dateFromTime(*timing.EffectiveUntil)
	} else if oldRule.EffectiveUntil.Valid {
		effUntil = oldRule.EffectiveUntil
	}
	splitDate, _ := time.Parse("2006-01-02", splitDateStr)
	row := tx.QueryRow(ctx, `
		INSERT INTO availability_rules (business_id, staff_id, rule_type, timezone, start_local, end_local, rrule, effective_from, effective_until, default_capacity)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id`,
		a.business, staffID, newRuleType, newTZ,
		pgtype.Timestamp{Time: newStartLocal, Valid: true},
		pgtype.Timestamp{Time: newEndLocal, Valid: true},
		newRRule,
		pgtype.Date{Time: splitDate, Valid: true},
		effUntil,
		newCap,
	)
	if err := row.Scan(&newRuleID); err != nil {
		writeJSON(w, 500, map[string]any{"error": "create new rule: " + err.Error()})
		return
	}

	// 5. Copy service mappings (use request service_ids if provided, else copy from old rule)
	svcIDs := serviceIDs
	if len(svcIDs) == 0 {
		rows, err := tx.Query(ctx, `SELECT service_id FROM availability_rule_services WHERE rule_id = $1 AND is_active = TRUE`, ruleID)
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": "list old rule services: " + err.Error()})
			return
		}
		for rows.Next() {
			var sid pgtype.UUID
			if rows.Scan(&sid) == nil {
				svcIDs = append(svcIDs, uuidToString(sid))
			}
		}
		rows.Close()
	}

	// 5b. Optionally reset per-occurrence modifications from the split onward.
	// When true: delete both exceptions and overrides (and override_services) >= occurrenceStart,
	// and skip migrating them to the new rule.
	if resetIndividualModifications {
		if _, err := tx.Exec(ctx,
			`DELETE FROM availability_exceptions WHERE rule_id = $1 AND occurrence_start >= $2`,
			ruleID, ts(*occurrenceStart)); err != nil {
			writeJSON(w, 500, map[string]any{"error": "reset future exceptions: " + err.Error()})
			return
		}
		if err := deleteOverridesFromRuleFromOccurrence(ctx, tx, ruleID, ts(*occurrenceStart)); err != nil {
			writeJSON(w, 500, map[string]any{"error": "reset future overrides: " + err.Error()})
			return
		}
	}
	for _, sid := range svcIDs {
		sidU, err := parseUUID(sid)
		if err != nil {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO availability_rule_services (rule_id, staff_id, service_id, is_active)
			VALUES ($1,$2,$3,TRUE)
			ON CONFLICT (rule_id, service_id) DO UPDATE SET is_active = TRUE`,
			newRuleID, staffID, sidU); err != nil {
			writeJSON(w, 500, map[string]any{"error": "copy services: " + err.Error()})
			return
		}
	}

	// 6. Migrate exceptions on or after the split occurrence to the new rule (unless reset).
	if !resetIndividualModifications {
		excRows, err := tx.Query(ctx,
			`SELECT id, occurrence_start FROM availability_exceptions WHERE rule_id = $1 AND occurrence_start >= $2`,
			ruleID, ts(*occurrenceStart))
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": "list exceptions: " + err.Error()})
			return
		}
		type excRow struct {
			id    pgtype.UUID
			occTS time.Time
		}
		var excs []excRow
		for excRows.Next() {
			var e excRow
			if err := excRows.Scan(&e.id, &e.occTS); err != nil {
				excRows.Close()
				writeJSON(w, 500, map[string]any{"error": "scan exception: " + err.Error()})
				return
			}
			excs = append(excs, e)
		}
		excRows.Close()

		for _, e := range excs {
			newOcc := e.occTS
			if timingChanged {
				rekeyed, err := rekeyOccurrenceStart(e.occTS, oldTZ, oldStartLocal, newTZ, newStartLocal)
				if err != nil {
					continue
				}
				newOcc = rekeyed
			}
			if _, err := tx.Exec(ctx,
				`DELETE FROM availability_exceptions WHERE rule_id = $1 AND occurrence_start = $2 AND id <> $3`,
				newRuleID, ts(newOcc), e.id); err != nil {
				writeJSON(w, 500, map[string]any{"error": "migrate exception cleanup: " + err.Error()})
				return
			}
			if _, err := tx.Exec(ctx,
				`UPDATE availability_exceptions SET rule_id = $2, occurrence_start = $3 WHERE id = $1`,
				e.id, newRuleID, ts(newOcc)); err != nil {
				writeJSON(w, 500, map[string]any{"error": "migrate exception: " + err.Error()})
				return
			}
		}
	}

	// 7. Migrate overrides on or after the split occurrence to the new rule (unless reset).
	if !resetIndividualModifications {
		ovrRows, err := tx.Query(ctx,
			`SELECT id, original_occurrence_start FROM availability_overrides WHERE rule_id = $1 AND original_occurrence_start >= $2`,
			ruleID, ts(*occurrenceStart))
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": "list overrides: " + err.Error()})
			return
		}
		type ovrRow struct {
			id    pgtype.UUID
			occTS time.Time
		}
		var ovrs []ovrRow
		for ovrRows.Next() {
			var o ovrRow
			if err := ovrRows.Scan(&o.id, &o.occTS); err != nil {
				ovrRows.Close()
				writeJSON(w, 500, map[string]any{"error": "scan override: " + err.Error()})
				return
			}
			ovrs = append(ovrs, o)
		}
		ovrRows.Close()

		for _, o := range ovrs {
			newOcc := o.occTS
			if timingChanged {
				rekeyed, err := rekeyOccurrenceStart(o.occTS, oldTZ, oldStartLocal, newTZ, newStartLocal)
				if err != nil {
					continue
				}
				newOcc = rekeyed
			}
			if err := deleteConflictingOverrides(ctx, tx, newRuleID, ts(newOcc), o.id); err != nil {
				writeJSON(w, 500, map[string]any{"error": "migrate override cleanup: " + err.Error()})
				return
			}
			if _, err := tx.Exec(ctx,
				`UPDATE availability_overrides SET rule_id = $2, original_occurrence_start = $3, updated_at = NOW() WHERE id = $1`,
				o.id, newRuleID, ts(newOcc)); err != nil {
				writeJSON(w, 500, map[string]any{"error": "migrate override: " + err.Error()})
				return
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, 500, map[string]any{"error": "commit: " + err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{
		"mutation":    "series_split",
		"old_rule_id": uuidToString(ruleID),
		"new_rule_id": uuidToString(newRuleID),
	})
}

// editEntireSeries updates the entire series and re-keys exceptions/overrides.
func (a *API) editEntireSeries(w http.ResponseWriter, r *http.Request, ruleID pgtype.UUID, timing *struct {
	Timezone       string     `json:"timezone"`
	StartLocal     time.Time  `json:"start_local"`
	EndLocal       time.Time  `json:"end_local"`
	RRule          string     `json:"rrule"`
	EffectiveFrom  time.Time  `json:"effective_from"`
	EffectiveUntil *time.Time `json:"effective_until"`
}, serviceIDs []string, capacity *int32, staffIDStr string, resetIndividualModifications bool, ruleTypeArg *string) {
	ctx := r.Context()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "begin tx: " + err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	oldRule, err := db.New(tx).GetAvailabilityRuleByID(ctx, ruleID)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "fetch rule: " + err.Error()})
		return
	}
	oldTZ := oldRule.Timezone
	oldStartLocal := oldRule.StartLocal.Time

	staffID, _ := parseUUID(staffIDStr)

	if resetIndividualModifications {
		// Reset all per-occurrence modifications for this rule.
		if _, err := tx.Exec(ctx, `DELETE FROM availability_exceptions WHERE rule_id = $1`, ruleID); err != nil {
			writeJSON(w, 500, map[string]any{"error": "reset exceptions: " + err.Error()})
			return
		}
		if _, err := tx.Exec(ctx, `
			DELETE FROM override_services
			WHERE override_id IN (SELECT id FROM availability_overrides WHERE rule_id = $1)
		`, ruleID); err != nil {
			writeJSON(w, 500, map[string]any{"error": "reset override_services: " + err.Error()})
			return
		}
		if _, err := tx.Exec(ctx, `DELETE FROM availability_overrides WHERE rule_id = $1`, ruleID); err != nil {
			writeJSON(w, 500, map[string]any{"error": "reset overrides: " + err.Error()})
			return
		}
	}

	if timing != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE availability_rules SET
				rule_type = $2, timezone = $3, start_local = $4, end_local = $5, rrule = $6,
				effective_from = $7, effective_until = $8, default_capacity = $9,
				is_active = TRUE, updated_at = NOW()
			WHERE id = $1`,
			ruleID, func() string {
				if ruleTypeArg != nil && *ruleTypeArg != "" {
					return *ruleTypeArg
				}
				if oldRule.RuleType != "" {
					return oldRule.RuleType
				}
				return "weekly"
			}(), timing.Timezone,
			pgtype.Timestamp{Time: timing.StartLocal, Valid: true},
			pgtype.Timestamp{Time: timing.EndLocal, Valid: true},
			timing.RRule,
			dateFromTime(timing.EffectiveFrom),
			datePtr(timing.EffectiveUntil),
			valueOr(capacity, oldRule.DefaultCapacity),
		); err != nil {
			writeJSON(w, 500, map[string]any{"error": "update rule: " + err.Error()})
			return
		}

		// When the rule's occurrence clock or TZ changes, per-occurrence rows keyed by UTC instant must move:
		// exceptions use occurrence_start; overrides use original_occurrence_start (same rekey helper).
		// Only runs when we are keeping individual modifications (no reset) and timing actually changed.
		timingChanged := !timing.StartLocal.Equal(oldStartLocal) || timing.Timezone != oldTZ
		if timingChanged && !resetIndividualModifications {
			excRows, err := tx.Query(ctx,
				`SELECT id, occurrence_start FROM availability_exceptions WHERE rule_id = $1`, ruleID)
			if err != nil {
				writeJSON(w, 500, map[string]any{"error": "list exceptions: " + err.Error()})
				return
			}
			type excRow struct {
				id    pgtype.UUID
				occTS time.Time
			}
			var excs []excRow
			for excRows.Next() {
				var e excRow
				if err := excRows.Scan(&e.id, &e.occTS); err != nil {
					excRows.Close()
					writeJSON(w, 500, map[string]any{"error": "scan exception: " + err.Error()})
					return
				}
				excs = append(excs, e)
			}
			excRows.Close()

			for _, e := range excs {
				rekeyed, err := rekeyOccurrenceStart(e.occTS.UTC(), oldTZ, oldStartLocal, timing.Timezone, timing.StartLocal)
				if err != nil {
					continue
				}
				if rekeyed.UTC().Equal(e.occTS.UTC()) {
					continue
				}
				if _, err := tx.Exec(ctx,
					`DELETE FROM availability_exceptions WHERE rule_id = $1 AND occurrence_start = $2 AND id <> $3`,
					ruleID, ts(rekeyed), e.id); err != nil {
					writeJSON(w, 500, map[string]any{"error": "rekey exception cleanup: " + err.Error()})
					return
				}
				if _, err := tx.Exec(ctx,
					`UPDATE availability_exceptions SET occurrence_start = $2 WHERE id = $1`,
					e.id, ts(rekeyed)); err != nil {
					writeJSON(w, 500, map[string]any{"error": "rekey exception: " + err.Error()})
					return
				}
			}

			ovrRows, err := tx.Query(ctx,
				`SELECT id, original_occurrence_start FROM availability_overrides WHERE rule_id = $1 AND is_active = TRUE`,
				ruleID)
			if err != nil {
				writeJSON(w, 500, map[string]any{"error": "list overrides: " + err.Error()})
				return
			}
			type ovrRow struct {
				id    pgtype.UUID
				occTS time.Time
			}
			var ovrs []ovrRow
			for ovrRows.Next() {
				var o ovrRow
				if err := ovrRows.Scan(&o.id, &o.occTS); err != nil {
					ovrRows.Close()
					writeJSON(w, 500, map[string]any{"error": "scan override: " + err.Error()})
					return
				}
				ovrs = append(ovrs, o)
			}
			ovrRows.Close()

			for _, o := range ovrs {
				rekeyed, err := rekeyOccurrenceStart(o.occTS.UTC(), oldTZ, oldStartLocal, timing.Timezone, timing.StartLocal)
				if err != nil {
					continue
				}
				if rekeyed.UTC().Equal(o.occTS.UTC()) {
					continue
				}
				if err := deleteConflictingOverrides(ctx, tx, ruleID, ts(rekeyed), o.id); err != nil {
					writeJSON(w, 500, map[string]any{"error": "rekey override cleanup: " + err.Error()})
					return
				}
				if _, err := tx.Exec(ctx,
					`UPDATE availability_overrides SET original_occurrence_start = $2, updated_at = NOW() WHERE id = $1`,
					o.id, ts(rekeyed)); err != nil {
					writeJSON(w, 500, map[string]any{"error": "rekey override: " + err.Error()})
					return
				}
			}
		}
	}

	if len(serviceIDs) > 0 {
		qtx := db.New(tx)
		existing, err := qtx.ListAvailabilityRuleServicesByRule(ctx, db.ListAvailabilityRuleServicesByRuleParams{RuleID: ruleID, Column2: false})
		if err != nil {
			writeJSON(w, 500, map[string]any{"error": "list rule services: " + err.Error()})
			return
		}
		want := map[string]pgtype.UUID{}
		for _, sid := range serviceIDs {
			u, err := parseUUID(sid)
			if err != nil {
				continue
			}
			want[uuidToString(u)] = u
		}
		for _, e := range existing {
			if _, ok := want[uuidToString(e.ServiceID)]; !ok {
				if err := qtx.SetAvailabilityRuleServiceState(ctx, db.SetAvailabilityRuleServiceStateParams{RuleID: ruleID, ServiceID: e.ServiceID, IsActive: false}); err != nil {
					writeJSON(w, 500, map[string]any{"error": "deactivate rule service: " + err.Error()})
					return
				}
			}
		}
		for _, u := range want {
			// Use a single UPSERT statement: inside a transaction, any error aborts the tx,
			// so we must not rely on "try insert then fallback update".
			if _, err := tx.Exec(ctx, `
				INSERT INTO availability_rule_services (rule_id, staff_id, service_id, is_active)
				VALUES ($1, $2, $3, TRUE)
				ON CONFLICT (rule_id, service_id)
				DO UPDATE SET staff_id = EXCLUDED.staff_id, is_active = TRUE, updated_at = NOW()
			`, ruleID, staffID, u); err != nil {
				writeJSON(w, 500, map[string]any{"error": "sync rule service: " + err.Error()})
				return
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, 500, map[string]any{"error": "commit: " + err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"mutation": "rule_updated", "mode": "edit_entire_series"})
}

// deleteThisAndFollowing truncates the series from occurrenceStart onward.
func (a *API) deleteThisAndFollowing(w http.ResponseWriter, r *http.Request, ruleID pgtype.UUID, staffIDStr string, occurrenceStart *time.Time) {
	if occurrenceStart == nil {
		writeJSON(w, 400, map[string]any{"error": "occurrence_start required for delete_this_and_following mode"})
		return
	}

	ctx := r.Context()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "begin tx: " + err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	oldRule, err := db.New(tx).GetAvailabilityRuleByID(ctx, ruleID)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "fetch rule: " + err.Error()})
		return
	}

	loc, err := time.LoadLocation(oldRule.Timezone)
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "load tz: " + err.Error()})
		return
	}

	// If the truncation point is on the first day of the series (effective_from),
	// truncating would set effective_until < effective_from. Treat this as deleting
	// the entire series.
	occDay := occurrenceStart.In(loc).Format("2006-01-02")
	effFromDay := oldRule.EffectiveFrom.Time.In(loc).Format("2006-01-02")
	if occDay == effFromDay {
		if _, err := tx.Exec(ctx, `UPDATE availability_rules SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, ruleID); err != nil {
			writeJSON(w, 500, map[string]any{"error": "delete series: " + err.Error()})
			return
		}
		if err := cleanupRuleSeries(ctx, tx, ruleID); err != nil {
			writeJSON(w, 500, map[string]any{"error": "cleanup rule series: " + err.Error()})
			return
		}
		if err := tx.Commit(ctx); err != nil {
			writeJSON(w, 500, map[string]any{"error": "commit: " + err.Error()})
			return
		}
		writeJSON(w, 200, map[string]any{"mutation": "delete_this_series", "rule_id": uuidToString(ruleID)})
		return
	}

	dayBefore := occurrenceStart.In(loc).AddDate(0, 0, -1).Format("2006-01-02")

	if _, err := tx.Exec(ctx,
		`UPDATE availability_rules SET effective_until = $2, updated_at = NOW() WHERE id = $1`,
		ruleID, dayBefore); err != nil {
		writeJSON(w, 500, map[string]any{"error": "truncate rule: " + err.Error()})
		return
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM availability_exceptions WHERE rule_id = $1 AND occurrence_start >= $2`,
		ruleID, ts(*occurrenceStart)); err != nil {
		writeJSON(w, 500, map[string]any{"error": "cleanup exceptions: " + err.Error()})
		return
	}

	// Remove overrides at/after the truncation point.
	// Must delete override_services first (FK to availability_overrides).
	if err := deleteOverridesFromRuleFromOccurrence(ctx, tx, ruleID, ts(*occurrenceStart)); err != nil {
		writeJSON(w, 500, map[string]any{"error": "cleanup overrides: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, 500, map[string]any{"error": "commit: " + err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"mutation": "delete_this_and_following", "rule_id": uuidToString(ruleID)})
}
