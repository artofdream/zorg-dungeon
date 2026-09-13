import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  detectLocaleFromLocation,
  getLocale,
  setLocale,
  t,
} from "./core.js";

afterEach(() => {
  setLocale(DEFAULT_LOCALE);
});

describe("i18n core", () => {
  it("defaults to EN and translates FR", () => {
    expect(getLocale()).toBe("en");
    expect(t("howTo.title")).toBe("How to play");
    setLocale("fr");
    expect(t("howTo.title")).toBe("Comment jouer");
    expect(t("landing.startHereDifficulty")).toMatch(/Commencer ici/);
    expect(t("room.A.word")).toBe("Départ");
    expect(t("room.Z.word")).toBe("Sortie");
  });

  it("detects ?lang=fr and /fr path", () => {
    expect(detectLocaleFromLocation("?lang=fr", "/", null)).toBe("fr");
    expect(detectLocaleFromLocation("", "/fr", null)).toBe("fr");
    expect(detectLocaleFromLocation("", "/", "fr")).toBe("fr");
    expect(detectLocaleFromLocation("", "/", null)).toBe("en");
  });

  it("interpolates params", () => {
    expect(t("landing.generateButton", { band: "1" })).toBe("Generate Difficulty 1");
    setLocale("fr");
    expect(t("landing.generateButton", { band: "1" })).toBe("Générer Difficulté 1");
  });
});
