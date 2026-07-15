import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Landing } from "../landing";

describe("Landing", () => {
  it("presents Sprout as one choreographed performance without carousel chrome", () => {
    const markup = renderToStaticMarkup(<Landing />);

    expect(markup).not.toContain("Current challenge");
    expect(markup).not.toContain("Available Sprout styles");
    expect(markup.match(/data-action=/g)).toHaveLength(4);
    expect(markup).toContain('data-action="money-burst"');
    expect(markup).toContain('data-action="victory-bounce"');
    expect(markup).toContain('data-action="confident-reset"');
    expect(markup).toContain('data-action="lucky-finale"');
  });
});
