# Static Data Boundary

Place immutable shared catalogs here only when gameplay consumes them. Expected future catalogs include locations, careers, event templates, and market instruments.

Rules:

- Keep source and effective date beside every real-world value.
- Version data that affects deterministic outcomes.
- Validate imported data before use.
- Never store mutable player state here.
- Do not add placeholder datasets solely to make the folder look complete.
