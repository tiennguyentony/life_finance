import { register } from "node:module";

register("./typescript-loader.mjs", import.meta.url);
await import("./generate-operational-event-dataset.ts");
