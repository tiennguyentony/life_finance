import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { SavedGamesPanel } from "../saved-games-panel";

describe("saved game surfaces", () => {
  it("renders a stable loading state while account saves are fetched", () => {
    expect(renderToStaticMarkup(<SavedGamesPanel />)).toContain(
      "Loading your saved games",
    );
  });
});
