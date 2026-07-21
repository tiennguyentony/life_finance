// Barrel entry for design-sync: the shared, app-independent components.
//
// AppHeader is excluded on purpose — it reads the Next app-router pathname via
// usePathname() and renders the Supabase-backed LogoutButton, so it cannot
// render standalone. Its markup is documented in .design-sync/conventions.md
// instead.
//
// The shim import must stay first: it installs `process.env` before next/image
// (pulled in by Sprout) evaluates.
import "./ds-shim";

export * from "../src/components/sprout";
export * from "../src/components/async-state";
