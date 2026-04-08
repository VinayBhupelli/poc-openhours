package app

func valueOr(v *int32, def int32) int32 {
	if v == nil {
		return def
	}
	return *v
}

