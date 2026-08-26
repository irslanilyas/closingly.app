import { describe, it, expect } from "vitest";
import { coerceTheme, DEFAULT_THEME, themeVars } from "@/lib/proposal-theme";

/**
 * coerceTheme is the entire security boundary between AI-generated template
 * output and the public share page a client opens. Everything here was
 * verified once, ad hoc, before this file existed — it's a permanent
 * regression test now, not a one-time check.
 */
describe("coerceTheme", () => {
  it("preserves a well-formed generation unchanged", () => {
    const kimi = {
      heading_font: "display",
      body_font: "serif",
      density: "spacious",
      paper: "#FBF7F2",
      ink: "#2C2420",
      accent: "#A16A50",
      header: "centered",
      section_label: "serif",
      divider: "hairline",
      bullet: "dot",
      investment: "plain",
      corners: "soft",
    };
    const theme = coerceTheme(kimi);
    expect(theme.header).toBe("centered");
    expect(theme.density).toBe("spacious");
    expect(theme.accent).toBe("#a16a50"); // lowercased
  });

  const injectionPayloads = [
    "red; background:url(https://evil.tld/x)",
    '#fff"onload=alert(1)',
    "javascript:alert(1)",
    "expression(alert(1))",
    "var(--secret)",
    "#fff;}</style><script>alert(1)</script>",
  ];

  it.each(injectionPayloads)("rejects a hostile colour value: %s", (payload) => {
    const theme = coerceTheme({ paper: payload, ink: payload, accent: payload });
    expect(theme.paper).toBe(DEFAULT_THEME.paper);
    const vars = JSON.stringify(themeVars(theme));
    expect(vars).not.toMatch(/evil|alert|<script/i);
  });

  it("drops an injected enum value rather than passing it through", () => {
    const theme = coerceTheme({
      header: 'block"><script>alert(1)</script>',
      bullet: "../../etc/passwd",
      density: {},
    });
    expect(theme.header).toBe("minimal");
    expect(theme.bullet).toBe("dot");
    expect(theme.density).toBe("normal");
  });

  it("repairs unreadable ink against paper", () => {
    const theme = coerceTheme({ paper: "#111111", ink: "#1a1a1a", accent: "#151515" });
    expect(theme.ink).toBe("#f5f5f4");
    expect(theme.accent).toBe(theme.ink);
  });

  it.each([null, undefined, "a string", 42, [], { design: "nested" }])(
    "never throws and always returns a complete theme for: %j",
    (junk) => {
      const theme = coerceTheme(junk);
      expect(Object.keys(theme)).toHaveLength(Object.keys(DEFAULT_THEME).length);
    }
  );

  it("rejects 3-digit hex shorthand — the regex requires 6", () => {
    expect(coerceTheme({ paper: "#fff" }).paper).toBe(DEFAULT_THEME.paper);
  });

  it("does not let a __proto__ key pollute Object.prototype", () => {
    const theme = coerceTheme(JSON.parse('{"__proto__":{"polluted":true},"header":"rule"}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(theme.header).toBe("rule");
  });
});
