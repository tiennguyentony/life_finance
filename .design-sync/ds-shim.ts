// Host-environment shim for the design-sync bundle.
//
// `next/image` reads `process.env.__NEXT_IMAGE_OPTS` at module scope. In a
// plain browser bundle there is no `process`, so evaluating the bundle throws
// a ReferenceError and nothing is assigned to window.LifeFinance.
//
// Supplying an empty env is enough and is deliberately the minimum: the image
// component falls back to `configEnv || configContext || imageConfigDefault`,
// so an undefined __NEXT_IMAGE_OPTS resolves to Next's own defaults rather
// than to values invented here. This module must be imported before anything
// that pulls in next/image.
const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
g.process ??= { env: {} };

export {};
