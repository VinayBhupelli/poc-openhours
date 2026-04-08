package app

import (
	"testing"
	"time"
)

func TestRekeyOccurrenceStartMatchesEngineClock(t *testing.T) {
	// Old series: 9am–5pm IST → DB often stores start as 03:30 UTC on an anchor date.
	oldStart := time.Date(2026, 4, 3, 3, 30, 0, 0, time.UTC)
	// New series: 10am–3pm IST → 04:30 UTC same "wall" encoding as API stores.
	newStart := time.Date(2026, 4, 7, 4, 30, 0, 0, time.UTC)
	// One occurrence of old rule: Apr 8 2026 9:00 IST = 03:30 UTC
	oldOcc := time.Date(2026, 4, 8, 3, 30, 0, 0, time.UTC)

	got, err := rekeyOccurrenceStart(oldOcc, "Asia/Calcutta", oldStart, "Asia/Calcutta", newStart)
	if err != nil {
		t.Fatal(err)
	}
	// Engine uses civil 10:00 on localDate (Apr 8) in Calcutta.
	calcutta2, err := time.LoadLocation("Asia/Calcutta")
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2026, 4, 8, 10, 0, 0, 0, calcutta2).UTC()
	if !got.Equal(want) {
		t.Fatalf("got %v want %v (migration keys must match expandRuleWindows occurrence starts)", got, want)
	}
}
