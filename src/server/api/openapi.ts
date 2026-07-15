import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { readinessResponseSchema } from "../health/readiness";

import {
  apiErrorSchema,
  commandResponseSchema,
  createRunRequestSchema,
  createRunResponseSchema,
  gameCommandSchema,
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
  path: "/api/v1/runs",
  operationId: "createRun",
  summary: "Create an anonymous financial simulation run",
  request: {
    body: { content: { "application/json": { schema: createRunRequestSchema } } },
  },
  responses: {
    201: {
      description: "Run created; the access secret is returned only here",
      content: { "application/json": { schema: createRunResponseSchema } },
    },
    400: errorResponses[400],
    500: errorResponses[500],
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
  summary: "Submit one optimistic, idempotent game command",
  security: [{ runBearer: [] }],
  request: {
    params: runIdPathSchema,
    body: { content: { "application/json": { schema: gameCommandSchema } } },
  },
  responses: {
    200: {
      description: "Command accepted or replayed idempotently",
      content: { "application/json": { schema: commandResponseSchema } },
    },
    ...errorResponses,
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
