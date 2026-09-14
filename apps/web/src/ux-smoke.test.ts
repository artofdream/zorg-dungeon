import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

describe("UX smoke (viewport / focus / reduced-motion / locale taps)", () => {
  it("Maker index.html has device-width viewport-fit=cover", () => {
    const html = readFileSync(join(webRoot, "index.html"), "utf8");
    expect(html).toMatch(/width=device-width/);
    expect(html).toMatch(/initial-scale=1/);
    expect(html).toMatch(/viewport-fit=cover/);
  });

  it("styles keep focus-visible rings and no bare outline:none", () => {
    const css = readFileSync(join(here, "styles.css"), "utf8");
    expect(css).toMatch(/:focus-visible\s*\{/);
    expect(css).not.toMatch(/outline\s*:\s*none/);
    expect(css).not.toMatch(/outline\s*:\s*0(?:px)?\s*;/);
  });

  it("styles include prefers-reduced-motion and skip-link", () => {
    const css = readFileSync(join(here, "styles.css"), "utf8");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/\.skip-link/);
    expect(css).toMatch(/--tap:\s*2\.75rem/);
  });

  it("locale switcher buttons meet tap token on narrow screens", () => {
    const css = readFileSync(join(here, "styles.css"), "utf8");
    expect(css).toMatch(/\.locale-switcher button[^{]*\{[^}]*min-height:\s*var\(--tap\)/s);
  });
});
