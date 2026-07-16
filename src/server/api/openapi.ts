import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { readinessResponseSchema } from "../health/readiness";
import {
  aiExplanationApiRequestSchema,
  aiExplanationApiResponseSchema,
} from "../ai/education-contracts";
import {
  aiWorldEventApiRequestSchema,
  aiWorldEventApiResponseSchema,
} from "../ai/world-director-contracts";
import {
  aiDebriefApiRequestSchema,
  aiDebriefApiResponseSchema,
} from "../ai/debrief-contracts";

import {
  apiErrorSchema,
  getRunResponseSchema,
  runIdPathSchema,
} from "./contracts";
import {
  commandV2ResponseSchema,
  checkpointV2QuerySchema,
  checkpointV2ResponseSchema,
  createRunV2RequestSchema,
  createRunV2ResponseSchema,
  gameCommandV2PublicSchema,
  getRunV2ResponseSchema,
  migrateRunV2ResponseSchema,
  runIdV2PathSchema,
} from "./contracts-v2";

const registry = new OpenAPIRegistry();
registry.registerComponent("securitySchemes", "runBearer", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "opaque 256-bit run secret",
  description: "Send the run secret only in the Authorization header.",
});

const errorResponses = {
  400: {
    description: "Invalid request",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  401: {
    description: "Run not found or credential invalid",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  409: {
    description: "Revision or idempotency conflict",
    content: { "application/json": { schema: apiErrorSchema } },
  },
  500: {
    description: "Internal persistence failure",
    content: { "application/json": { schema: apiErrorSchema } },
  },
} as const;

const legacyWriteDeprecatedResponse = {
  description:
    "Legacy state is read-only; create a v2 run or migrate an existing save.",
  content: { "application/json": { schema: apiErrorSchema } },
} as const;

registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  operationId: "getDeploymentReadiness",
  summary: "Verify deployment configuration and required backend dependencies",
  responses: {
    200: {
      description: "Deployment is ready",
      content: { "application/json": { schema: readinessResponseSchema } },
    },
    503: {
      description: "One or more required backend dependencies are unavailable",
      content: { "application/json": { schema: readinessResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v2/runs",
  operationId: "createRunV2",
  summary: "Create a native catalog-backed schema-v2 run",
  request: {
    body: { content: { "application/json": { schema: createRunV2RequestSchema } } },
  },
  responses: {
    201: {
      description: "Native v2 run created; the access secret is returned only here",
      content: { "application/json": { schema: createRunV2ResponseSchema } },
    },
    400: errorResponses[400],
    500: errorResponses[500],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v2/runs/{runId}/checkpoint",
  operationId: "getCheckpointV2",
  summary: "Build reconciled checkpoint evidence from immutable monthly records",
  security: [{ runBearer: [] }],
  request: {
    params: runIdV2PathSchema,
    query: checkpointV2QuerySchema,
  },
  responses: {
    200: {
      description: "Deterministic checkpoint evidence",
      content: { "application/json": { schema: checkpointV2ResponseSchema } },
    },
    400: errorResponses[400],
    401: errorResponses[401],
    500: errorResponses[500],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v2/runs/{runId}",
  operationId: "getRunV2",
  summary: "Read a schema-v2 authoritative state",
  security: [{ runBearer: [] }],
  request: { params: runIdV2PathSchema },
  responses: {
    200: {
      description: "Authoritative schema-v2 run state",
      content: { "application/json": { schema: getRunV2ResponseSchema } },
    },
    400: errorResponses[400],
    401: errorResponses[401],
    500: errorResponses[500],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v2/runs/{runId}/migrate",
  operationId: "migrateRunV2",
  summary: "Migrate an authenticated legacy save to authoritative schema v2",
  security: [{ runBearer: [] }],
  request: { params: runIdV2PathSchema },
  responses: {
    200: {
      description: "Migrated state, or the identical result of an earlier migration",
      content: { "application/json": { schema: migrateRunV2ResponseSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v2/runs/{runId}/commands",
  operationId: "submitCommandV2",
  summary:
    "Submit a player-authored v2 strategy/action or request server-owned monthly processing",
  security: [{ runBearer: [] }],
  request: {
    params: runIdV2PathSchema,
    body: { content: { "application/json": { schema: gameCommandV2PublicSchema } } },
  },
  responses: {
    200: {
      description: "Command accepted or replayed with the original immutable result",
      content: { "application/json": { schema: commandV2ResponseSchema } },
    },
    ...errorResponses,
    502: {
      description: "Tax service returned unusable authoritative evidence",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    503: {
      description: "Tax service is temporarily unavailable; no state was committed",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v2/runs/{runId}/ai/explanation",
  operationId: "createAdaptiveExplanationV2",
  summary: "Generate a grounded adaptive lesson with deterministic fallback",
  security: [{ runBearer: [] }],
  request: {
    params: runIdV2PathSchema,
    body: { content: { "application/json": { schema: aiExplanationApiRequestSchema } } },
  },
  responses: {
    200: {
      description: "Structured lesson and authoritative state with updated learning memory",
      content: { "application/json": { schema: aiExplanationApiResponseSchema } },
    },
    400: errorResponses[400],
    401: errorResponses[401],
    409: errorResponses[409],
    500: errorResponses[500],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v2/runs/{runId}/ai/world-event",
  operationId: "createAiWorldEventV2",
  summary: "Select one fair bounded event targeting demonstrated exposure",
  security: [{ runBearer: [] }],
  request: {
    params: runIdV2PathSchema,
    body: { content: { "application/json": { schema: aiWorldEventApiRequestSchema } } },
  },
  responses: {
    200: {
      description: "Engine-validated event queued with AI or deterministic narrative",
      content: { "application/json": { schema: aiWorldEventApiResponseSchema } },
    },
    400: errorResponses[400],
    401: errorResponses[401],
    409: errorResponses[409],
    500: errorResponses[500],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v2/runs/{runId}/ai/debrief",
  operationId: "createAiDebriefV2",
  summary: "Explain the immutable final grade using bounded run evidence",
  security: [{ runBearer: [] }],
  request: {
    params: runIdV2PathSchema,
    body: { content: { "application/json": { schema: aiDebriefApiRequestSchema } } },
  },
  responses: {
    200: {
      description: "Grounded final debrief with deterministic fallback",
      content: { "application/json": { schema: aiDebriefApiResponseSchema } },
    },
    400: errorResponses[400], 401: errorResponses[401],
    409: errorResponses[409], 500: errorResponses[500],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/runs",
  operationId: "createRun",
  summary: "Legacy schema-v1 creation is retired",
  deprecated: true,
  responses: {
    410: legacyWriteDeprecatedResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/runs/{runId}",
  operationId: "getRun",
  summary: "Read the authoritative state of a run",
  security: [{ runBearer: [] }],
  request: { params: runIdPathSchema },
  responses: {
    200: {
      description: "Authoritative run state",
      content: { "application/json": { schema: getRunResponseSchema } },
    },
    400: errorResponses[400],
    401: errorResponses[401],
    500: errorResponses[500],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/runs/{runId}/commands",
  operationId: "submitCommand",
  summary: "Legacy schema-v1 commands are retired",
  deprecated: true,
  request: {
    params: runIdPathSchema,
  },
  responses: {
    410: legacyWriteDeprecatedResponse,
  },
});

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Life Finance API",
      version: "2.0.0",
      description: "Versioned authoritative API for deterministic financial runs.",
    },
    servers: [{ url: "/", description: "Current deployment" }],
  });
}
