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

  it("routes every entry point through sign-in", () => {
    const markup = renderToStaticMarkup(<Landing />);

    expect(markup).toContain("Log in");
    expect(markup).toContain("Play now");
    expect(markup).toContain('href="/login"');
    expect(markup).not.toContain('href="/start"');
    expect(markup).not.toContain('href="/board"');
  });

  it("pitches the simulation in the hero", () => {
    const markup = renderToStaticMarkup(<Landing />);

    expect(markup).toContain("A financial life simulation");
    expect(markup).toContain("Learn money by living the choices");
    expect(markup).toContain("One month per turn");
    expect(markup).toContain("Real life events");
    expect(markup).toContain("Goal: financial independence");
  });

  it("explains how a run plays using the game cast", () => {
    const markup = renderToStaticMarkup(<Landing />);

    expect(markup).toContain("How a run plays");
    expect(markup).toContain("Choose your life");
    expect(markup).toContain("Plan the month");
    expect(markup).toContain("Life happens");
    expect(markup).toContain("Reach independence");
    expect(markup).toContain("/assets/characters/mr-layoff/");
    expect(markup).toContain("/assets/characters/debtzilla/");
    expect(markup).toContain("/assets/characters/luckycat/");
  });

  it("shows the backend demo launcher only when local demo mode is enabled", () => {
    const normalMarkup = renderToStaticMarkup(<Landing />);
    const developmentMarkup = renderToStaticMarkup(<Landing demoEnabled />);

    expect(normalMarkup).not.toContain("Instant demo");
    expect(developmentMarkup).toContain("Instant demo");
  });
});
