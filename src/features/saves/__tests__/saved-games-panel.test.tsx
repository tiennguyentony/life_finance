import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { ActiveSaveBanner, SavedGamesPanel } from "../saved-games-panel";

describe("saved game surfaces", () => {
  it("renders a stable loading state while account saves are fetched", () => {
    expect(renderToStaticMarkup(<SavedGamesPanel />)).toContain(
      "Loading your saved games",
    );
  });

  it("does not invent a continue action before an active save is loaded", () => {
    expect(renderToStaticMarkup(<ActiveSaveBanner />)).toBe("");
  });
});
