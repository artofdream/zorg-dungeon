import { buildCampaignCatalog, type CampaignEntry } from "@zorg/engine";

const rawFixtures = import.meta.glob("../../../packages/engine/fixtures/{base-classic,base-extras,contracts}/**/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function loadCampaignCatalog(): CampaignEntry[] {
  const files = Object.entries(rawFixtures).map(([path, text]) => ({
    path: path.replace(/^.*\/fixtures\//, ""),
    text,
  }));
  return buildCampaignCatalog(files);
}
