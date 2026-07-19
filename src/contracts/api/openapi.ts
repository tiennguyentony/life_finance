export const CURRENT_OPENAPI_DOCUMENT = Object.freeze({
  openapi: "3.1.0",
  info: {
    title: "Life Finance API",
    version: "1.0.0",
    description:
      "Same-origin browser API. Run credentials are stored only in an HttpOnly cookie.",
  },
  paths: {
    "/api/health": { get: { summary: "Process liveness" } },
    "/api/demo": {
      post: {
        summary: "Create an in-memory demo run (development only)",
      },
    },
    "/api/session": {
      get: { summary: "Restore the active run session" },
      delete: { summary: "Clear the active run session" },
    },
    "/api/onboarding/review": {
      post: { summary: "Review and normalize onboarding input" },
    },
    "/api/onboarding/parse": {
      post: { summary: "Optionally extract onboarding fields with AI" },
    },
    "/api/runs": {
      post: { summary: "Create a run and establish its cookie session" },
    },
    "/api/runs/{runId}": {
      get: { summary: "Read the active run as a RunView" },
    },
    "/api/runs/{runId}/tax": {
      get: { summary: "Read the run's current tax estimate and YTD totals" },
    },
    "/api/runs/{runId}/commands": {
      post: {
        summary: "Submit a versionless command intent for the active run",
      },
    },
  },
} as const);
