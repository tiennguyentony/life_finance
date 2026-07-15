# Static Data Boundary

Place immutable shared catalogs here only when gameplay consumes them. Expected future catalogs include locations, careers, event templates, and market instruments.

Rules:

- Keep source and effective date beside every real-world value.
- Version data that affects deterministic outcomes.
- Validate imported data before use.
- Never store mutable player state here.
- Do not add placeholder datasets solely to make the folder look complete.

`scenario-catalog.ts` is the immutable US gameplay catalog currently consumed by
the backend. Its salary and living-cost values are explicitly educational game
assumptions calibrated from cited source data, while statutory retirement, HSA,
and HDHP limits are pinned in a versioned benefit-policy entry. A run must store
the resolved snapshot and checksum; replay must never resolve against a newer
catalog version.
