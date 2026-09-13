/**
 * Automated browser probes for persona journeys (GitHub #46).
 *
 * Maps to docs/PLAYER_JOURNEYS.md optional probes for J-KID / J-HELPER /
 * J-CAMPAIGN / J-PRACTICE / J-HONESTY. Labels come from first-run.ts.
 *
 * Simulated evidence only — not Live & Probed, not a STATUS_LEDGER promotion.
 * Do not invent FR-4 / C / Gunner duration behavior; honesty text may name them.
 */
import { expect, test, type Page } from "@playwright/test";

const HOW_TO_PLAY = "How to play";
const START_HERE_DIFFICULTY = "Start here — Difficulty 1";
const START_HERE_GENERATE = "Start here — Generate Difficulty 1";
const START_FIGHT = "Start fight";
const PLACE_IN_LINE = "Place rooms in a line";
const HONESTY_SUMMARY = "This game is still being tested. Every playable level is open right now.";

/** Kid-facing regions must stay free of engineer jargon (first-run JARGON). */
const KID_JARGON = /FR-4|C room|Gunner duration|ledger/i;

async function openLanding(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Zorg.*Dungeon Maker/i })).toBeVisible();
}

test.describe("persona journey probes (Simulated)", () => {
  test("landing: How to play + both Start here; kid copy has no FR-4 / C room / Gunner duration / ledger", async ({
    page,
  }) => {
    await openLanding(page);

    const howTo = page.locator("section.how-to");
    await expect(howTo.getByRole("heading", { name: HOW_TO_PLAY })).toBeVisible();
    await expect(howTo.locator("ol li")).toHaveCount(4);
    await expect(page.getByRole("button", { name: START_HERE_DIFFICULTY })).toBeVisible();
    await expect(page.getByRole("button", { name: START_HERE_GENERATE })).toBeVisible();

    const kidBlob = [
      await page.locator("p.lede").innerText(),
      await howTo.innerText(),
      await page.locator("div.start-here").innerText(),
      await page.locator("section.generate-top").innerText(),
      await page.locator("h2.section-label").innerText(),
    ].join("\n");
    expect(kidBlob).not.toMatch(KID_JARGON);
  });

  test("authored catalog is default; unfinished toggle defaults off", async ({ page }) => {
    await openLanding(page);

    await expect(page.getByRole("heading", { name: "Pick a level" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Difficulty" })).toBeVisible();
    await expect(page.locator(".level-grid .level-card").first()).toBeVisible();

    const unfinished = page.getByLabel("Show unfinished levels");
    await expect(unfinished).toBeVisible();
    await expect(unfinished).not.toBeChecked();

    // Authored grid shows pack names; generated pack is not a catalog card.
    const packs = await page.locator(".level-grid .level-card .meta").allInnerTexts();
    expect(packs.some((t) => /base-classic|base-mirror|expansion/i.test(t))).toBe(true);
    expect(packs.every((t) => !/\bgenerated\b/i.test(t))).toBe(true);
  });

  test("honesty disclosure still contains Simulated / FR-4 / C / Gunner notes", async ({ page }) => {
    await openLanding(page);

    const details = page.locator("details.honesty").first();
    await expect(details.getByText(HONESTY_SUMMARY)).toBeVisible();
    await details.locator("summary").click();
    const body = await details.innerText();
    expect(body).toMatch(/Simulated/);
    expect(body).toMatch(/FR-4/);
    expect(body).toMatch(/C rooms/);
    expect(body).toMatch(/Gunner duration/);
  });

  test("Start here — Difficulty 1 opens a playable authored Difficulty 1 card", async ({ page }) => {
    await openLanding(page);

    await page.getByRole("button", { name: START_HERE_DIFFICULTY }).click();

    const maker = page.locator("main.app-play");
    await expect(maker).toBeVisible();
    await expect(maker).toHaveAttribute("data-pack", /^(?!generated$).+/);
    await expect(maker).toHaveAttribute("data-difficulty-band", "1");

    const title = (await page.locator("h1.play-title").innerText()).trim();
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toMatch(/^Untitled/i);

    await expect(page.locator("p.lede")).toContainText(/Difficulty 1/);
    await expect(page.locator("p.lede")).not.toContainText(/practice/);
    await expect(page.getByRole("button", { name: "Regenerate" })).toHaveCount(0);

    await expect(page.getByRole("button", { name: PLACE_IN_LINE })).toBeVisible();
    // Start-here authored uses beginner assist → line layout → Start fight enabled.
    await expect(page.getByRole("button", { name: START_FIGHT })).toBeEnabled({ timeout: 10_000 });
  });

  test("Start here — Generate Difficulty 1 opens pack === generated band 1; fight can enable", async ({
    page,
  }) => {
    await openLanding(page);

    await page.getByRole("button", { name: START_HERE_GENERATE }).click();

    const maker = page.locator("main.app-play");
    await expect(maker).toBeVisible();
    await expect(maker).toHaveAttribute("data-pack", "generated");
    await expect(maker).toHaveAttribute("data-difficulty-band", "1");

    await expect(page.locator("p.lede")).toContainText(/Difficulty 1/);
    await expect(page.locator("p.lede")).toContainText(/practice/);
    await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
    await expect(page.getByRole("button", { name: PLACE_IN_LINE })).toBeVisible();

    // Suggested generator layout (or Place rooms in a line) unlocks Start fight.
    const startFight = page.getByRole("button", { name: START_FIGHT });
    if (await startFight.isDisabled()) {
      await page.getByRole("button", { name: PLACE_IN_LINE }).click();
    }
    await expect(startFight).toBeEnabled({ timeout: 10_000 });
  });
});
