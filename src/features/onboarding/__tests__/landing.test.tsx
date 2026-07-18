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

  it("starts onboarding before opening the board", () => {
    const markup = renderToStaticMarkup(<Landing />);

    expect(markup).not.toContain("Log in");
    expect(markup).toContain('href="/start"');
    expect(markup).not.toContain('href="/board"');
  });

  it("shows the backend demo launcher only when local demo mode is enabled", () => {
    const normalMarkup = renderToStaticMarkup(<Landing />);
    const developmentMarkup = renderToStaticMarkup(<Landing demoEnabled />);

    expect(normalMarkup).not.toContain("Instant demo");
    expect(developmentMarkup).toContain("Instant demo");
  });
});
