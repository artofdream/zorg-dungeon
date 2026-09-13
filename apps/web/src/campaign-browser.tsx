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
import { LocaleSwitcher, useLocale } from "./i18n/index.js";
import {
  difficultyChipLabel,
  difficultyEntryLabel,
  firstPlayableDifficulty1,
  getKnowledgeGuideHref,
  getKnowledgeJourneysHref,
  getKnowledgeLearnHref,
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
  const { t, locale } = useLocale();
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
  void locale; // re-render on locale change via useLocale

  function startAuthoredDifficulty1() {
    if (!startHere) return;
    setBand("1");
    onStartHereAuthored(startHere);
  }

  return (
    <main className="app">
      <div className="chrome-bar">
        <h1>{t("chrome.makerTitle")}</h1>
        <LocaleSwitcher />
      </div>
      <p className="lede">{t("landing.lede")}</p>

      <section className="how-to" aria-labelledby="how-to-play">
        <h2 id="how-to-play">{t("howTo.title")}</h2>
        <p className="hint">{t("landing.helperBlurb")}</p>
        <ol>
          <li>{t("howTo.step1")}</li>
          <li>{t("howTo.step2")}</li>
          <li>{t("howTo.step3")}</li>
          <li>{t("howTo.step4")}</li>
        </ol>
        <p className="learn-link">
          <a href={getKnowledgeLearnHref()}>{t("knowledge.learnLabel")}</a>
          <span className="hint">
            {" "}
            {t("knowledge.learnHint")}{" "}
            <a href={getKnowledgeGuideHref()}>{t("knowledge.guideLabel")}</a>
            {" · "}
            <a href={getKnowledgeJourneysHref()}>{t("knowledge.journeysLabel")}</a>
          </span>
        </p>
      </section>

      <div className="start-here">
        <button type="button" className="cta" disabled={!startHere} onClick={startAuthoredDifficulty1}>
          {t("landing.startHereDifficulty")}
        </button>
        <button type="button" className="cta cta-secondary" onClick={onStartHereGenerate}>
          {t("landing.startHereGenerate")}
        </button>
      </div>

      <section className="panel generate generate-top" aria-labelledby="practice-dungeon">
        <h2 id="practice-dungeon">{t("practice.title")}</h2>
        <p className="hint">{t("practice.hint")}</p>
        <div className="filters" aria-label={t("landing.generateAria")}>
          {GENERATION_BANDS.map((item) => (
            <button
              key={item}
              type="button"
              className={generateBand === item ? "selected" : ""}
              onClick={() => setGenerateBand(item)}
            >
              {t("landing.difficultyChip", { band: item })}
            </button>
          ))}
        </div>
        <div className="controls">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onGenerate(generateBand, false)}
          >
            {t("landing.generateButton", { band: generateBand })}
          </button>
        </div>
      </section>

      <details className="honesty">
        <summary>{t("honesty.summary")}</summary>
        <p>{t("honesty.details")}</p>
        <p className="hint">
          {t("landing.playableCounts", {
            playable: playableCount,
            unfinished: catalog.length - playableCount,
          })}
        </p>
      </details>

      <h2 className="section-label">{t("landing.pickLevel")}</h2>
      <div className="filters" role="tablist" aria-label={t("landing.difficultyAria")}>
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
        <summary>{t("filters.moreSummary")}</summary>
        <p className="hint">{t("filters.moreHint")}</p>
        <div className="filters" aria-label={t("landing.contractAria")}>
          <button
            type="button"
            className={contractId === "all" ? "selected" : ""}
            onClick={() => setContractId("all")}
          >
            {t("landing.allContracts")}
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

      <p className="hint">{t("landing.openHint")}</p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={showUnavailable}
          onChange={(ev) => setShowUnavailable(ev.target.checked)}
        />
        {t("landing.showUnfinished")}
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
                <span className="badge-start">{t("landing.startHereBadge")}</span>
              ) : null}
              <span className="title">{title}</span>
              <span className="meta">
                {entry.id}
                {difficultyEntryLabel(entry.difficulty)}
              </span>
              <span className="meta">
                {entry.pack}
                {entry.contractName ? ` · ${entry.contractName}` : ""}
                {entry.needsChoix ? t("landing.setupChoicesMeta") : ""}
              </span>
              <HeroTypeRow types={heroTypesFromLevelText(entry.text)} labelled />
              {!entry.playable ? (
                <span className="reason">
                  {t("landing.unfinishedPrefix")}
                  {entry.unavailableReasons.map(unavailableReasonLabel).join(" · ")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? <p className="hint">{t("landing.emptyFilter")}</p> : null}
    </main>
  );
}
