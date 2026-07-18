import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import { LoginForm } from "../login-form";

describe("LoginForm", () => {
  it("starts with auto-confirmed account creation using email and password", () => {
    const markup = renderToStaticMarkup(<LoginForm />);

    expect(markup).toContain('type="email"');
    expect(markup.match(/type="password"/g)).toHaveLength(2);
    expect(markup).toContain('minLength="8"');
    expect(markup).toContain("Confirm password");
    expect(markup).toContain("Show password");
    expect(markup).toContain("Create account");
    expect(markup).toContain("Already have an account? Sign in");
    expect(markup).not.toContain("Google");
    expect(markup).not.toContain("sign-in link");
  });
});
