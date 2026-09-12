import { useEffect, useMemo, useState } from "react";
import {
  canCastNow,
  canStartExtermination,
  castSpell,
  createRun,
  defaultInlinePicks,
  defaultNamedChoices,
  enumerateSuppliedRooms,
  listInlineChoixSlots,
  parseLevel,
  prepareCampaignLevel,
  selectActiveHero,
  stepRun,
  validateLayout,
  type CampaignEntry,
  type CastRequest,
  type DungeonLayout,
  type HeroSlot,
  type InlineChoixPicks,
  type Orientation,
  type PlacedRoom,
  type PlayerChoice,
  type SimulationState,
} from "@zorg/engine";
import { HatchCompass, RoomHatchMark } from "./hatch-mark.js";
import { HeroFigurineLegend, HeroIcon } from "./hero-icon.js";
import { collectHeroTypes } from "./hero-icons.js";
import {
  EVENT_FEED_EMPTY,
  EVENT_FEED_TITLE,
  EVENT_TECHNICAL_SUMMARY,
  formatEventFeed,
} from "./event-copy.js";
import {
  displayCampaignTitle,
  heroSlotLabel,
  roomKidLabel,
  roomKidWord,
  roomLabel,
  roomSlotLabel,
  roomTypeCss,
  spellKidLabel,
  spellSlotLabel,
} from "./labels.js";
import {
  boardCellAriaLabel,
  describeHatch,
  HATCH_HELPER,
  HATCH_HONESTY,
  MAKER_ORIENTATIONS,
  selectedRoomHatchLabel,
} from "./orientation-ui.js";
import {
  BACK_TO_MAKER_LABEL,
  DOORS_FACE_TITLE,
  EMPTY_BOARD_HINT,
  FIGHT_PANEL_TITLE,
  FIGHT_TURN_HELP,
  HONESTY_SUMMARY,
  KNOWLEDGE_GUIDE_HREF,
  KNOWLEDGE_LEARN_HREF,
  LEARN_THE_RULES_LABEL,
  MAKER_GATE_BLOCKED,
  MAKER_GATE_OK,
  MAKER_GENERATED_HONESTY,
  MAKER_HONESTY_DETAILS,
  MAKER_HOW_TO,
  outcomeHeadline,
  PLACE_IN_LINE_HINT,
  PLACE_IN_LINE_LABEL,
  RUN_LABEL,
  SETUP_CHOICES_HINT,
  SETUP_CHOICES_TITLE,
  SPELLS_TITLE,
  START_FIGHT_LABEL,
  STEP_LABEL,
  WIN_GOAL_HINT,
  difficultyEntryLabel,
} from "./first-run.js";

interface Props {
  entry: CampaignEntry;
  onBack: () => void;
  /** Generator-suggested FR-5–FR-8 line. Authored campaign leaves this unset. */
  suggestedLayout?: DungeonLayout;
  onRegenerate?: () => void;
  /** Start-here paths only: soft auto-line when the board would otherwise begin empty (#36). */
  beginnerAssist?: boolean;
}

function snapshot(state: SimulationState): SimulationState {
  return { ...state, heroes: state.heroes.map((h) => ({ ...h })) };
}

function gridExtent(roomCount: number): { min: number; max: number } {
  const span = Math.max(6, roomCount + 2);
  return { min: -1, max: span - 2 };
}

export function MakerPlay({ entry, onBack, suggestedLayout, onRegenerate, beginnerAssist = false }: Props) {
  const authored = useMemo(() => parseLevel(entry.text), [entry.text]);
  const [named, setNamed] = useState(() => defaultNamedChoices(authored));
  const [inline, setInline] = useState<InlineChoixPicks>(() => defaultInlinePicks(authored));

  const level = useMemo(() => prepareCampaignLevel(authored, named, inline), [authored, named, inline]);
  const supplied = useMemo(() => enumerateSuppliedRooms(level), [level]);
  const extent = useMemo(() => gridExtent(supplied.length), [supplied.length]);
  const inlineSlots = useMemo(() => listInlineChoixSlots(authored), [authored]);

  const [orientation, setOrientation] = useState<Orientation>(0);
  const [rooms, setRooms] = useState<PlacedRoom[]>(() => suggestedLayout?.rooms ?? []);
  const [assistApplied, setAssistApplied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(supplied[0]?.id ?? null);
  const [run, setRun] = useState<SimulationState | null>(null);
  const [spellPick, setSpellPick] = useState<number | null>(null);
  const [castError, setCastError] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);

  const layout: DungeonLayout = useMemo(
    () => ({ rooms: rooms.map((r) => ({ ...r, orientation })) }),
    [rooms, orientation],
  );
  const report = useMemo(() => validateLayout(level, layout), [level, layout]);
  const placedIds = new Set(rooms.map((r) => r.id));
  const gateOpen = canStartExtermination(level, layout);
  const playing = run !== null;

  useEffect(() => {
    setRooms(suggestedLayout?.rooms ?? []);
    setSelectedId(null);
    setRun(null);
    setSpellPick(null);
    setCastError(null);
    setAssistApplied(false);
    // Reset when the campaign card changes (authored pick or regenerate).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suggested rooms follow entry.id
  }, [entry.id, entry.text]);

  useEffect(() => {
    if (playing || assistApplied || suggestedLayout?.rooms?.length) return;
    if (!beginnerAssist || supplied.length === 0) return;
    const ordered = [
      ...supplied.filter((spec) => spec.def.type === "A"),
      ...supplied.filter((spec) => spec.def.type !== "A" && spec.def.type !== "Z"),
      ...supplied.filter((spec) => spec.def.type === "Z"),
    ];
    setRooms(
      ordered.map((spec, i) => ({
        id: spec.id,
        def: spec.def,
        position: { x: i, y: 1 },
        orientation,
      })),
    );
    setSelectedId(null);
    setAssistApplied(true);
  }, [beginnerAssist, playing, assistApplied, suggestedLayout, supplied, orientation]);

  useEffect(() => {
    if (!playing && selectedId === null && supplied[0]) {
      setSelectedId(supplied[0].id);
    }
  }, [playing, selectedId, supplied]);

  function resetBoard() {
    setRooms([]);
    setSelectedId(null);
    setRun(null);
    setSpellPick(null);
    setCastError(null);
  }

  function placeAt(x: number, y: number) {
    if (playing) return;
    const existing = rooms.find((r) => r.position.x === x && r.position.y === y);
    if (existing) {
      setRooms(rooms.filter((r) => r.id !== existing.id));
      setSelectedId(existing.id);
      return;
    }
    if (!selectedId) return;
    const spec = supplied.find((s) => s.id === selectedId);
    if (!spec) return;
    setRooms([
      ...rooms.filter((r) => r.id !== selectedId),
      { id: spec.id, def: spec.def, position: { x, y }, orientation },
    ]);
    const nextUnplaced = supplied.find((s) => s.id !== selectedId && !placedIds.has(s.id));
    setSelectedId(nextUnplaced?.id ?? null);
  }

  function applyOrientation(next: Orientation) {
    setOrientation(next);
    setRooms((current) => current.map((r) => ({ ...r, orientation: next })));
  }

  function placeInALine() {
    if (playing) return;
    const ordered = [
      ...supplied.filter((spec) => spec.def.type === "A"),
      ...supplied.filter((spec) => spec.def.type !== "A" && spec.def.type !== "Z"),
      ...supplied.filter((spec) => spec.def.type === "Z"),
    ];
    setRooms(
      ordered.map((spec, i) => ({
        id: spec.id,
        def: spec.def,
        position: { x: i, y: 1 },
        orientation,
      })),
    );
    setSelectedId(null);
  }

  function startRun() {
    if (!gateOpen) return;
    setSpellPick(null);
    setCastError(null);
    setRun(createRun(level, layout));
  }

  function stepPlayback() {
    if (!run || run.outcome !== "in_progress") return;
    const { state } = stepRun(run);
    setRun(snapshot(state));
  }

  function runAll() {
    if (!run) return;
    let current = run;
    while (current.outcome === "in_progress") {
      const { state, events } = stepRun(current);
      current = state;
      if (events.length === 0) break;
    }
    setRun(snapshot(current));
  }

  const boardLayout = run?.layout ?? layout;
  const heroesOnBoard = (run?.heroes ?? []).filter((h) => h.spawned && !h.dead && h.roomId);
  const hatch = describeHatch(orientation);
  const selectedSpec = supplied.find((spec) => spec.id === selectedId);
  const active = run ? selectActiveHero(run.heroes) : undefined;
  const pickedSpell = run && spellPick !== null ? run.spells[spellPick] : undefined;
  const ys = Array.from({ length: extent.max - extent.min + 1 }, (_, i) => extent.max - i);
  const xs = Array.from({ length: extent.max - extent.min + 1 }, (_, i) => extent.min + i);

  function applyCast(extra: Omit<CastRequest, "spellId">) {
    if (!run || spellPick === null) return;
    try {
      const { state } = castSpell(run, { spellId: spellPick, ...extra });
      setRun(snapshot(state));
      setCastError(null);
      setSpellPick(null);
    } catch (err) {
      setCastError(err instanceof Error ? err.message : String(err));
    }
  }

  function onCellClick(x: number, y: number) {
    if (!playing) {
      placeAt(x, y);
      return;
    }
    if (!run || !pickedSpell || pickedSpell.consumed || !canCastNow(run)) return;
    const occupant = boardLayout.rooms.find((r) => r.position.x === x && r.position.y === y);
    if (pickedSpell.def.type === "Move" && !occupant) {
      applyCast({ dest: { x, y } });
      return;
    }
    if (pickedSpell.def.type === "Swap" && occupant && occupant.id !== active?.roomId) {
      applyCast({ otherRoomId: occupant.id });
    }
  }

  function castPicked() {
    if (!run || !pickedSpell || !canCastNow(run)) return;
    if (pickedSpell.def.type === "Attack" || pickedSpell.def.type === "Teleport") {
      applyCast({});
      return;
    }
    if (pickedSpell.def.type === "Sleep" || pickedSpell.def.type === "Wake" || pickedSpell.def.type === "Banality") {
      if (active) applyCast({ heroId: active.id });
    }
  }

  function updateNamed(name: string, selected: unknown[]) {
    const next: PlayerChoice = { variableName: name, selected };
    setNamed((current) => ({ ...current, [name]: next }));
    resetBoard();
  }

  function updateInline(kind: "rooms" | "heroes" | "spells", index: number, pickIndex: number, slotN: number) {
    setInline((current) => {
      const copy: InlineChoixPicks = {
        rooms: current.rooms.map((row) => [...row]),
        heroes: current.heroes.map((row) => [...row]),
        spells: current.spells.map((row) => [...row]),
      };
      const row = [...(copy[kind][index] ?? [])];
      if (slotN <= 1) copy[kind][index] = [pickIndex];
      else {
        const pos = row.indexOf(pickIndex);
        if (pos >= 0) row.splice(pos, 1);
        else if (row.length < slotN) row.push(pickIndex);
        copy[kind][index] = row;
      }
      return copy;
    });
    resetBoard();
  }

  return (
    <main className="app app-play">
      <div className="topbar">
        <button type="button" onClick={onBack}>
          ← Campaign
        </button>
        <h1 className="play-title">{displayCampaignTitle(entry)}</h1>
        {onRegenerate ? (
          <button type="button" onClick={onRegenerate}>
            Regenerate
          </button>
        ) : null}
      </div>
      <p className="lede">
        {WIN_GOAL_HINT}
        {difficultyEntryLabel(entry.difficulty)}
        {entry.pack === "generated" ? " · practice" : ""}
        {entry.contractName ? ` · ${entry.contractName}` : ""}
      </p>
      <p className="hint meta-id">{displayCampaignTitle(entry)} · {entry.id}</p>
      <p className="hint">
        {MAKER_HOW_TO}{" "}
        <a href={KNOWLEDGE_LEARN_HREF} target="_blank" rel="noreferrer">
          {LEARN_THE_RULES_LABEL}
        </a>
        {" · "}
        <a href={KNOWLEDGE_GUIDE_HREF} target="_blank" rel="noreferrer">
          Player guide
        </a>
      </p>
      <details className="honesty">
        <summary>{HONESTY_SUMMARY}</summary>
        <p>
          {MAKER_HONESTY_DETAILS} {HATCH_HONESTY}
          {entry.pack === "generated" ? MAKER_GENERATED_HONESTY : ""}
        </p>
      </details>

      {entry.needsChoix ? (
        <section className="panel setup">
          <h2>{SETUP_CHOICES_TITLE}</h2>
          <p className="hint">{SETUP_CHOICES_HINT}</p>
          {(authored.variables ?? []).map((variable) => {
            const choice = named[variable.name];
            const current = choice?.selected[0];
            if (variable.domain === "N" || variable.domain === "R") {
              return (
                <label key={variable.name}>
                  {variable.name} = pick {variable.n} ({variable.domain === "N" ? "whole numbers" : "numbers"})
                  <input
                    type="number"
                    min={0}
                    max={20}
                    disabled={playing}
                    value={typeof current === "number" ? current : 1}
                    onChange={(ev) => updateNamed(variable.name, [Number(ev.target.value)])}
                  />
                </label>
              );
            }
            if (!Array.isArray(variable.domain)) return null;
            return (
              <label key={variable.name}>
                {variable.name}
                <select
                  disabled={playing}
                  value={JSON.stringify(current)}
                  onChange={(ev) => updateNamed(variable.name, [JSON.parse(ev.target.value)])}
                >
                  {variable.domain.map((opt) => (
                    <option key={JSON.stringify(opt)} value={JSON.stringify(opt)}>
                      {String(opt)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          {inlineSlots.map((slot) => {
            const picks =
              slot.kind === "room"
                ? inline.rooms[slot.index]
                : slot.kind === "hero"
                  ? inline.heroes[slot.index]
                  : inline.spells[slot.index];
            const selected = picks?.[0] ?? 0;
            const labeler =
              slot.kind === "room" ? roomSlotLabel : slot.kind === "hero" ? heroSlotLabel : spellSlotLabel;
            const kindKey = slot.kind === "room" ? "rooms" : slot.kind === "hero" ? "heroes" : "spells";
            return (
              <label key={`${slot.kind}-${slot.index}`}>
                <span className="choix-label">
                  {slot.kind} choice
                  {slot.kind === "hero" ? (
                    <span className="hero-type-row">
                      {collectHeroTypes(slot.options as HeroSlot[]).map((type) => (
                        <HeroIcon key={type} type={type} size="sm" decorative />
                      ))}
                    </span>
                  ) : null}
                </span>
                <select
                  disabled={playing}
                  value={selected}
                  onChange={(ev) => updateInline(kindKey, slot.index, Number(ev.target.value), slot.n)}
                >
                  {slot.options.map((opt, i) => (
                    <option key={i} value={i}>
                      {labeler(opt as never)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </section>
      ) : null}

      <div className="layout">
        <section className="panel panel-rooms">
          <h2>Rooms</h2>
          <div className="hero-roster" aria-label="Hero roster">
            {level.heroes.length === 0 ? (
              <p className="hint">Heroes: (none)</p>
            ) : (
              level.heroes.map((slot, i) => {
                const types = collectHeroTypes([slot]);
                return (
                  <span key={`${heroSlotLabel(slot)}-${i}`} className="hero-roster-item">
                    {types.map((type) => (
                      <HeroIcon key={type} type={type} size="sm" decorative />
                    ))}
                    <span>{heroSlotLabel(slot)}</span>
                  </span>
                );
              })
            )}
          </div>
          {(level.spells?.length ?? 0) > 0 ? (
            <p className="hint">Spells: {level.spells!.map((s) => spellSlotLabel(s)).join(", ")}</p>
          ) : null}
          <HeroFigurineLegend />
          <div className="tray">
            {supplied.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className={selectedId === spec.id ? "selected" : ""}
                disabled={playing}
                onClick={() => setSelectedId(spec.id)}
                aria-label={selectedRoomHatchLabel(
                  roomKidLabel(spec.def),
                  orientation,
                  spec.def.type === "A",
                )}
              >
                {roomKidLabel(spec.def)} {placedIds.has(spec.id) ? "· placed" : "· tray"}
                <span className="tray-hatch">
                  {hatch.doorsFaceLabel}
                  {spec.def.type === "A" ? " · start-room doors" : ""}
                </span>
              </button>
            ))}
          </div>
          <h2 style={{ marginTop: "1rem" }}>{DOORS_FACE_TITLE}</h2>
          <p className="hint">{HATCH_HELPER}</p>
          <HatchCompass orientation={orientation} />
          <div className="orient">
            {MAKER_ORIENTATIONS.map((deg) => (
              <button
                key={deg}
                type="button"
                className={orientation === deg ? "selected" : ""}
                disabled={playing}
                onClick={() => applyOrientation(deg)}
              >
                {describeHatch(deg).degreesLabel}
              </button>
            ))}
          </div>
          <p className="hint">{PLACE_IN_LINE_HINT}</p>
          <button type="button" className="btn-block btn-primary" disabled={playing} onClick={placeInALine}>
            {PLACE_IN_LINE_LABEL}
          </button>
        </section>

        <section className="panel panel-board">
          <h2>Board</h2>
          <p className="hint">
            {rooms.length === 0 && !playing ? EMPTY_BOARD_HINT + " " : ""}
            Click a cell to place the selected room. Click a placed room to pick it up.{" "}
            {hatch.doorsFaceLabel}
            {selectedSpec ? ` · placing ${roomKidLabel(selectedSpec.def)}` : ""}.
          </p>
          <div className="board-wrap">
            <div
              className="board"
              style={{ gridTemplateColumns: `repeat(${extent.max - extent.min + 1}, var(--cell))` }}
            >
              {ys.flatMap((y) =>
                xs.map((x) => {
                  const room = boardLayout.rooms.find((r) => r.position.x === x && r.position.y === y);
                  const occupants = room
                    ? heroesOnBoard.filter((h) => h.roomId === room.id)
                    : [];
                  const isHero = occupants.length > 0;
                  const isSelectedPlaced = Boolean(room && selectedId === room.id);
                  const isAnchor = room?.def.type === "A";
                  const isPreview =
                    !playing && !room && Boolean(selectedSpec) && hoverCell?.x === x && hoverCell?.y === y;
                  const previewName = isPreview && selectedSpec ? roomKidLabel(selectedSpec.def) : undefined;
                  return (
                    <button
                      key={`${x},${y}`}
                      type="button"
                      className={`cell${room ? " filled" : ""}${isHero ? " hero" : ""}${
                        isSelectedPlaced ? " selected-room" : ""
                      }${isPreview ? " preview" : ""}${isAnchor ? " anchor" : ""}${
                        room ? ` ${roomTypeCss(room.def)}` : isPreview && selectedSpec ? ` ${roomTypeCss(selectedSpec.def)}` : ""
                      }`}
                      onClick={() => onCellClick(x, y)}
                      onPointerEnter={(ev) => {
                        if (ev.pointerType === "mouse") setHoverCell({ x, y });
                      }}
                      onPointerLeave={() =>
                        setHoverCell((cur) => (cur?.x === x && cur?.y === y ? null : cur))
                      }
                      data-hatch={room || isPreview ? hatch.cardinal : undefined}
                      aria-label={[
                        boardCellAriaLabel({
                          roomName: room ? roomKidLabel(room.def) : previewName,
                          x,
                          y,
                          orientation,
                          preview: isPreview,
                          selected: isSelectedPlaced,
                          isAnchor,
                        }),
                        occupants.length
                          ? occupants.map((h) => h.def.type).join(", ")
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {room || isPreview ? <RoomHatchMark orientation={orientation} /> : null}
                      {occupants.length > 0 ? (
                        <span className="cell-heroes">
                          {occupants.map((h) => (
                            <HeroIcon key={h.id} type={h.def.type} size="sm" />
                          ))}
                        </span>
                      ) : null}
                      {room ? (
                        <>
                          <span className="kind">{roomKidWord(room.def)}</span>
                          <span className="meta">
                            {roomLabel(room.def)} · {hatch.glyph}
                          </span>
                        </>
                      ) : (
                        <span className="meta">
                          {isPreview && selectedSpec
                            ? `${roomKidWord(selectedSpec.def)} · ${roomLabel(selectedSpec.def)}`
                            : `${x},${y}`}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </section>

        <section className="panel panel-play">
          <h2>Validation</h2>
          {report.ok ? (
            <p className="ok">{MAKER_GATE_OK}</p>
          ) : rooms.length === 0 ? (
            <p className="hint">{EMPTY_BOARD_HINT}</p>
          ) : (
            <ul className="issues">
              {report.issues.map((issue, i) => (
                <li key={`${issue.code}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}

          <h2 style={{ marginTop: "1rem" }}>{FIGHT_PANEL_TITLE}</h2>
          <p className="hint">{WIN_GOAL_HINT}</p>
          <p className="hint">{FIGHT_TURN_HELP}</p>
          <div className="controls">
            <button type="button" className="btn-primary" disabled={!gateOpen || playing} onClick={startRun}>
              {START_FIGHT_LABEL}
            </button>
            <button type="button" disabled={!run || run.outcome !== "in_progress"} onClick={stepPlayback}>
              {STEP_LABEL}
            </button>
            <button type="button" disabled={!run || run.outcome !== "in_progress"} onClick={runAll}>
              {RUN_LABEL}
            </button>
            <button
              type="button"
              disabled={!run}
              onClick={() => {
                setRun(null);
                setSpellPick(null);
                setCastError(null);
              }}
            >
              {BACK_TO_MAKER_LABEL}
            </button>
          </div>
          {run ? (
            <>
              {run.outcome !== "in_progress" ? (
                <p className={`banner ${run.outcome}`} role="status">
                  {outcomeHeadline(run.outcome)}
                </p>
              ) : null}
              <h2 style={{ marginTop: "1rem" }}>{SPELLS_TITLE}</h2>
              <p className="hint">
                {canCastNow(run)
                  ? pickedSpell?.def.type === "Move"
                    ? "Click an empty cell to Move the active hero's room."
                    : pickedSpell?.def.type === "Swap"
                      ? "Click another room to Swap with the active hero's room."
                      : "You can cast between finished steps."
                  : "Press Step at least once before casting."}
              </p>
              <div className="tray">
                {run.spells.map((spell) => (
                  <button
                    key={spell.id}
                    type="button"
                    className={spellPick === spell.id ? "selected" : ""}
                    disabled={spell.consumed || !canCastNow(run)}
                    onClick={() => setSpellPick(spell.id)}
                  >
                    {spellKidLabel(spell.def)} {spell.consumed ? "· spent" : "· ready"}
                  </button>
                ))}
              </div>
              <div className="controls">
                <button
                  type="button"
                  disabled={
                    !pickedSpell ||
                    pickedSpell.consumed ||
                    !canCastNow(run) ||
                    pickedSpell.def.type === "Move" ||
                    pickedSpell.def.type === "Swap" ||
                    pickedSpell.def.type === "Selection"
                  }
                  onClick={castPicked}
                >
                  Cast {pickedSpell ? spellKidLabel(pickedSpell.def) : "spell"}
                </button>
              </div>
              {castError ? (
                <p className="issues">
                  <span>{castError}</span>
                </p>
              ) : null}
              <div className="hp">
                <p className="hp-head">
                  Heroes
                  {run.outcome !== "in_progress" ? (
                    <>
                      {" "}
                      · <strong>{run.outcome === "win" ? "stopped" : run.outcome}</strong>
                    </>
                  ) : null}
                </p>
                {run.heroes.map((h) => (
                  <span
                    key={h.id}
                    className={`hero-roster-item${h.dead ? " dead" : ""}${
                      active?.id === h.id ? " active" : ""
                    }`}
                  >
                    <HeroIcon type={h.def.type} size="sm" decorative />
                    <span>
                      {h.def.type} · HP {h.hp}
                      {h.gold?.length ? ` · gold ${h.gold.length}` : ""}
                      {h.dead ? " (fell)" : h.sleeping ? " (asleep)" : h.spawned ? "" : " (waiting)"}
                    </span>
                  </span>
                ))}
              </div>
              <h2 style={{ marginTop: "1rem" }}>{EVENT_FEED_TITLE}</h2>
              <ul className="event-feed" aria-live="polite">
                {formatEventFeed(run.events, run.heroes).length === 0 ? (
                  <li className="hint">{EVENT_FEED_EMPTY}</li>
                ) : (
                  formatEventFeed(run.events, run.heroes).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))
                )}
              </ul>
              <details className="honesty technical-log">
                <summary>{EVENT_TECHNICAL_SUMMARY}</summary>
                <pre className="log">
                  {run.events.map((e) => JSON.stringify(e)).join("\n") || EVENT_FEED_EMPTY}
                </pre>
              </details>
            </>
          ) : (
            <p className="hint">
              {gateOpen ? MAKER_GATE_OK : MAKER_GATE_BLOCKED}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
