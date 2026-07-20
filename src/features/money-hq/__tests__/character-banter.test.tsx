import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HqCharacterBanter } from "../character-banter";

describe("Money HQ character banter", () => {
  it("renders a dismissible, non-modal character message in the HQ design", () => {
    const markup = renderToStaticMarkup(
      <HqCharacterBanter
        banter={{
          id: "banter.2026-10.debtzilla.0",
          characterId: "debtzilla",
          characterName: "Debtzilla",
          characterSrc: "/assets/characters/debtzilla/debtzilla-bills.png",
          message: "Your debt grew legs. Unfortunately, they charge interest.",
          citedEvidenceId: "debt_change",
          tone: "roast",
        }}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain('class="hq-banter"');
    expect(markup).toContain('data-tone="roast"');
    expect(markup).toContain("Debtzilla");
    expect(markup).toContain("Your debt grew legs");
    expect(markup).toContain("Dismiss Debtzilla&#x27;s message");
    expect(markup).not.toContain("<dialog");
  });
});
