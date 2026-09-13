import { describe, expect, it } from "vitest";
import { allMessageKeys, catalogFor, LOCALES } from "./core.js";
import { en } from "../locales/en.js";
import { fr } from "../locales/fr.js";

describe("i18n catalog coverage (ADR-0007)", () => {
  it("EN and FR have the same keys both ways", () => {
    const enKeys = Object.keys(en).sort();
    const frKeys = Object.keys(fr).sort();
    expect(frKeys).toEqual(enKeys);
    expect(allMessageKeys().sort()).toEqual(enKeys);
  });

  it("no empty catalog values", () => {
    for (const locale of LOCALES) {
      const catalog = catalogFor(locale);
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});
