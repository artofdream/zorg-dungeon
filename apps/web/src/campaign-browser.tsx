import { useMemo, useState } from "react";
import {
  authoredCampaignContracts,
  GENERATION_BANDS,
  groupCampaignByDifficulty,
  unavailableReasonLabel,
  UNSPECIFIED_DIFFICULTY,
  type CampaignEntry,
  type GenerationBand,
} from "@zorg/engine";

interface Props {
  catalog: CampaignEntry[];
  onPick: (entry: CampaignEntry) => void;
  onGenerate: (band: GenerationBand) => void;
}

export function CampaignBrowser({ catalog, onPick, onGenerate }: Props) {
  const groups = useMemo(() => groupCampaignByDifficulty(catalog), [catalog]);
  const contracts = useMemo(() => authoredCampaignContracts(), []);
  const [band, setBand] = useState<string>(groups[0]?.band ?? "1");
  const [contractId, setContractId] = useState<string>("all");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [generateBand, setGenerateBand] = useState<GenerationBand>("1");

  const visible = useMemo(() => {
    const group = groups.find((g) => g.band === band)?.entries ?? [];
    return group.filter((entry) => {
      if (contractId !== "all" && entry.contractId !== contractId) return false;
      if (!showUnavailable && !entry.playable) return false;
      return true;
    });
  }, [groups, band, contractId, showUnavailable]);

  const playableCount = catalog.filter((e) => e.playable).length;

  return (
    <main className="app">
      <h1>Zorg's Dungeon Maker</h1>
      <p className="lede">
        Pick a <strong>Difficulté</strong>, open an authored level, place its
        rooms, then start the fight. After the campaign, you can also generate
        a practice dungeon for the same Difficulté bands.
      </p>
      <p className="honesty">
        Simulated engine tests — not a live production probe. Contract costs are
        labels only (FR-4 gating is not built). Levels with C rooms or Gunner
        duration stay unavailable. Generated levels are Simulated engine output,
        not a live probe. See the honesty ledger.
      </p>

      <p className="hint">
        {playableCount} playable · {catalog.length - playableCount} unavailable ·
        quarantine and Blabla contracts 11–15 omitted
      </p>

      <h2 className="panel" style={{ marginBottom: "0.75rem" }}>
        Difficulté
      </h2>
      <div className="filters" role="tablist" aria-label="Difficulté">
        {groups.map((group) => (
          <button
            key={group.band}
            type="button"
            className={band === group.band ? "selected" : ""}
            onClick={() => setBand(group.band)}
          >
            {group.band === UNSPECIFIED_DIFFICULTY
              ? `No Difficulté (${group.entries.length})`
              : `Difficulté ${group.band} (${group.entries.length})`}
          </button>
        ))}
      </div>

      <div className="filters" aria-label="Contract flavour filter">
        <button
          type="button"
          className={contractId === "all" ? "selected" : ""}
          onClick={() => setContractId("all")}
        >
          All contracts
        </button>
        {contracts.map((contract) => (
          <button
            key={contract.id}
            type="button"
            className={contractId === contract.id ? "selected" : ""}
            onClick={() => setContractId(contract.id)}
          >
            {contract.name}
            {contract.costPoints !== null ? ` · ${contract.costPoints} pts` : ""}
          </button>
        ))}
      </div>

      <p className="hint">
        Contract points are labels only. Every playable level in this list is
        open.
      </p>
      <label className="hint" style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={showUnavailable}
          onChange={(ev) => setShowUnavailable(ev.target.checked)}
        />
        Show unavailable (C / Gunner duration / unresolved)
      </label>

      <div className="level-grid" style={{ marginTop: "0.85rem" }}>
        {visible.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="level-card"
            disabled={!entry.playable}
            onClick={() => onPick(entry)}
          >
            <span className="title">{entry.name || entry.id}</span>
            <span className="meta">
              {entry.id}
              {entry.difficulty !== null ? ` · Difficulté ${entry.difficulty}` : ""}
            </span>
            <span className="meta">
              {entry.pack}
              {entry.contractName
                ? ` · ${entry.contractName}${
                    entry.contractCost !== null ? ` (cost ${entry.contractCost}` : ""
                  }${entry.contractCostNote ? `; ${entry.contractCostNote}` : ""}${
                    entry.contractCost !== null ? ")" : ""
                  }`
                : ""}
              {entry.needsChoix ? " · choix setup" : ""}
            </span>
            {!entry.playable ? (
              <span className="reason">
                Unavailable — {entry.unavailableReasons.map(unavailableReasonLabel).join(" · ")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="hint">No levels in this filter. Try another Difficulté or show unavailable.</p>
      ) : null}

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <h2>Generate a practice dungeon</h2>
        <p className="hint">
          Additive — the authored campaign above stays the default. The engine
          builds a legal A–Z corridor for Difficulté 1–4 (the authored numeric
          bands). No C rooms, no Gunner duration, no contract unlock.
        </p>
        <div className="filters" aria-label="Generate Difficulté">
          {GENERATION_BANDS.map((item) => (
            <button
              key={item}
              type="button"
              className={generateBand === item ? "selected" : ""}
              onClick={() => setGenerateBand(item)}
            >
              Difficulté {item}
            </button>
          ))}
        </div>
        <div className="controls">
          <button type="button" onClick={() => onGenerate(generateBand)}>
            Generate Difficulté {generateBand}
          </button>
        </div>
      </section>
    </main>
  );
}
