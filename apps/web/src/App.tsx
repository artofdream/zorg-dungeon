import { useMemo, useState } from "react";
import type { CampaignEntry } from "@zorg/engine";
import { CampaignBrowser } from "./campaign-browser.js";
import { loadCampaignCatalog } from "./fixtures.js";
import { MakerPlay } from "./maker-play.js";

export function App() {
  const catalog = useMemo(() => loadCampaignCatalog(), []);
  const [selected, setSelected] = useState<CampaignEntry | null>(null);

  if (selected?.playable) {
    return <MakerPlay entry={selected} onBack={() => setSelected(null)} />;
  }

  return <CampaignBrowser catalog={catalog} onPick={setSelected} />;
}
