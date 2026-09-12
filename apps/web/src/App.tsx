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
  const [beginnerAssist, setBeginnerAssist] = useState(false);

  function openAuthored(entry: CampaignEntry, assist = false) {
    setSuggestedLayout(undefined);
    setGeneratedSeed(undefined);
    setBeginnerAssist(assist);
    setSelected(entry);
  }

  function openGenerated(band: GenerationBand, seed?: number, assist = false) {
    const generated = generateLevel({ difficulty: band, seed });
    setSuggestedLayout(generated.layout);
    setGeneratedSeed(generated.seed);
    setBeginnerAssist(assist);
    setSelected(generatedCampaignEntry(generated));
  }

  if (selected?.playable) {
    const generated = selected.pack === "generated";
    return (
      <MakerPlay
        entry={selected}
        suggestedLayout={suggestedLayout}
        beginnerAssist={beginnerAssist}
        onBack={() => {
          setSelected(null);
          setSuggestedLayout(undefined);
          setGeneratedSeed(undefined);
          setBeginnerAssist(false);
        }}
        onRegenerate={
          generated
            ? () => openGenerated(selected.difficultyBand as GenerationBand, (generatedSeed ?? 0) + 1, beginnerAssist)
            : undefined
        }
      />
    );
  }

  return (
    <CampaignBrowser
      catalog={catalog}
      onPick={(entry) => openAuthored(entry, false)}
      onGenerate={(band, assist) => openGenerated(band, undefined, assist ?? false)}
      onStartHereAuthored={(entry) => openAuthored(entry, true)}
      onStartHereGenerate={() => openGenerated("1", undefined, true)}
    />
  );
}
