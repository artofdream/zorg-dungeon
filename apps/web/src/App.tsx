import { useMemo, useState } from "react";
import {
  generateLevel,
  generatedCampaignEntry,
  type CampaignEntry,
  type DungeonLayout,
  type GenerationBand,
} from "@zorg/engine";
import { CampaignBrowser } from "./campaign-browser.js";
import { loadCampaignCatalog } from "./fixtures.js";
import { MakerPlay } from "./maker-play.js";

export function App() {
  const catalog = useMemo(() => loadCampaignCatalog(), []);
  const [selected, setSelected] = useState<CampaignEntry | null>(null);
  const [suggestedLayout, setSuggestedLayout] = useState<DungeonLayout | undefined>(undefined);
  const [generatedSeed, setGeneratedSeed] = useState<number | undefined>(undefined);

  function openAuthored(entry: CampaignEntry) {
    setSuggestedLayout(undefined);
    setGeneratedSeed(undefined);
    setSelected(entry);
  }

  function openGenerated(band: GenerationBand, seed?: number) {
    const generated = generateLevel({ difficulty: band, seed });
    setSuggestedLayout(generated.layout);
    setGeneratedSeed(generated.seed);
    setSelected(generatedCampaignEntry(generated));
  }

  if (selected?.playable) {
    const generated = selected.pack === "generated";
    return (
      <MakerPlay
        entry={selected}
        suggestedLayout={suggestedLayout}
        onBack={() => {
          setSelected(null);
          setSuggestedLayout(undefined);
          setGeneratedSeed(undefined);
        }}
        onRegenerate={
          generated
            ? () => openGenerated(selected.difficultyBand as GenerationBand, (generatedSeed ?? 0) + 1)
            : undefined
        }
      />
    );
  }

  return (
    <CampaignBrowser catalog={catalog} onPick={openAuthored} onGenerate={(band) => openGenerated(band)} />
  );
}
