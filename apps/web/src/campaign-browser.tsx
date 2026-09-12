import { useMemo, useState } from "react";
import {
  authoredCampaignContracts,
  GENERATION_BANDS,
  groupCampaignByDifficulty,
  unavailableReasonLabel,
  type CampaignEntry,
  type GenerationBand,
} from "@zorg/engine";
import { HeroTypeRow } from "./hero-icon.js";
import { heroTypesFromLevelText } from "./hero-icons.js";
import { displayCampaignTitle } from "./labels.js";
import {
  HELPER_BLURB,
  HONESTY_DETAILS,
  HONESTY_SUMMARY,
  HOW_TO_PLAY_STEPS,
  HOW_TO_PLAY_TITLE,
  KID_LEDE,
  KNOWLEDGE_GUIDE_HREF,
  KNOWLEDGE_JOURNEYS_HREF,
  KNOWLEDGE_LEARN_HREF,
  LEARN_THE_RULES_LABEL,
  MORE_FILTERS_HINT,
  MORE_FILTERS_SUMMARY,
  PRACTICE_SECTION_HINT,
  PRACTICE_SECTION_TITLE,
  START_HERE_CARD_BADGE,
  START_HERE_DIFFICULTY_LABEL,
  START_HERE_GENERATE_LABEL,
  difficultyChipLabel,
  difficultyEntryLabel,
  firstPlayableDifficulty1,
} from "./first-run.js";

interface Props {
  catalog: CampaignEntry[];
  onPick: (entry: CampaignEntry) => void;
  onGenerate: (band: GenerationBand, assist?: boolean) => void;
  onStartHereAuthored: (entry: CampaignEntry) => void;
  onStartHereGenerate: () => void;
}

export function CampaignBrowser({
  catalog,
  onPick,
  onGenerate,
  onStartHereAuthored,
  onStartHereGenerate,
}: Props) {
  const groups = useMemo(() => groupCampaignByDifficulty(catalog), [catalog]);
  const contracts = useMemo(() => authoredCampaignContracts(), []);
  const startHere = useMemo(() => firstPlayableDifficulty1(catalog), [catalog]);
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

  function startAuthoredDifficulty1() {
    if (!startHere) return;
    setBand("1");
    onStartHereAuthored(startHere);
  }

  return (
    <main className="app">
      <h1>Zorg&apos;s Dungeon Maker</h1>
      <p className="lede">{KID_LEDE}</p>

      <section className="how-to" aria-labelledby="how-to-play">
        <h2 id="how-to-play">{HOW_TO_PLAY_TITLE}</h2>
        <p className="hint">{HELPER_BLURB}</p>
        <ol>
          {HOW_TO_PLAY_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="learn-link">
          <a href={KNOWLEDGE_LEARN_HREF}>{LEARN_THE_RULES_LABEL}</a>
          <span className="hint">
            {" "}
            — pictures and short sentences.{" "}
            <a href={KNOWLEDGE_GUIDE_HREF}>Player guide</a>
            {" · "}
            <a href={KNOWLEDGE_JOURNEYS_HREF}>Persona journeys</a>
          </span>
        </p>
      </section>

      <div className="start-here">
        <button type="button" className="cta" disabled={!startHere} onClick={startAuthoredDifficulty1}>
          {START_HERE_DIFFICULTY_LABEL}
        </button>
        <button type="button" className="cta cta-secondary" onClick={onStartHereGenerate}>
          {START_HERE_GENERATE_LABEL}
        </button>
      </div>

      <section className="panel generate generate-top" aria-labelledby="practice-dungeon">
        <h2 id="practice-dungeon">{PRACTICE_SECTION_TITLE}</h2>
        <p className="hint">{PRACTICE_SECTION_HINT}</p>
        <div className="filters" aria-label="Generate Difficulty">
          {GENERATION_BANDS.map((item) => (
            <button
              key={item}
              type="button"
              className={generateBand === item ? "selected" : ""}
              onClick={() => setGenerateBand(item)}
            >
              Difficulty {item}
            </button>
          ))}
        </div>
        <div className="controls">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onGenerate(generateBand, false)}
          >
            Generate Difficulty {generateBand}
          </button>
        </div>
      </section>

      <details className="honesty">
        <summary>{HONESTY_SUMMARY}</summary>
        <p>{HONESTY_DETAILS}</p>
        <p className="hint">
          {playableCount} playable · {catalog.length - playableCount} unfinished · quarantine and
          placeholder contracts 11–15 omitted
        </p>
      </details>

      <h2 className="section-label">Pick a level</h2>
      <div className="filters" role="tablist" aria-label="Difficulty">
        {groups.map((group) => (
          <button
            key={group.band}
            type="button"
            className={band === group.band ? "selected" : ""}
            onClick={() => setBand(group.band)}
          >
            {difficultyChipLabel(group.band, group.entries.length)}
          </button>
        ))}
      </div>

      <details className="more-filters">
        <summary>{MORE_FILTERS_SUMMARY}</summary>
        <p className="hint">{MORE_FILTERS_HINT}</p>
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
      </details>

      <p className="hint">Every playable level in this list is open.</p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={showUnavailable}
          onChange={(ev) => setShowUnavailable(ev.target.checked)}
        />
        Show unfinished levels
      </label>

      <div className="level-grid">
        {visible.map((entry) => {
          const title = displayCampaignTitle(entry);
          return (
            <button
              key={entry.id}
              type="button"
              className={`level-card${startHere && entry.id === startHere.id ? " start-here-card" : ""}`}
              disabled={!entry.playable}
              onClick={() => onPick(entry)}
            >
              {startHere && entry.id === startHere.id ? (
                <span className="badge-start">{START_HERE_CARD_BADGE}</span>
              ) : null}
              <span className="title">{title}</span>
              <span className="meta">
                {entry.id}
                {difficultyEntryLabel(entry.difficulty)}
              </span>
              <span className="meta">
                {entry.pack}
                {entry.contractName ? ` · ${entry.contractName}` : ""}
                {entry.needsChoix ? " · setup choices" : ""}
              </span>
              <HeroTypeRow types={heroTypesFromLevelText(entry.text)} labelled />
              {!entry.playable ? (
                <span className="reason">
                  Unfinished — {entry.unavailableReasons.map(unavailableReasonLabel).join(" · ")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <p className="hint">No levels in this filter. Try another Difficulty or show unfinished levels.</p>
      ) : null}
    </main>
  );
}
