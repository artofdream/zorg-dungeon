import { useEffect, useMemo, useState } from "react";
import {
  canCastNow,
  canStartExtermination,
  castSpell,
  createRun,
  defaultInlinePicks,
  defaultNamedChoices,
  enumerateSuppliedRooms,
  hatchDirection,
  listInlineChoixSlots,
  parseLevel,
  prepareCampaignLevel,
  selectActiveHero,
  stepRun,
  validateLayout,
  type CampaignEntry,
  type CastRequest,
  type DungeonLayout,
  type InlineChoixPicks,
  type Orientation,
  type PlacedRoom,
  type PlayerChoice,
  type SimulationState,
} from "@zorg/engine";
import { heroSlotLabel, roomLabel, roomSlotLabel, spellLabel, spellSlotLabel } from "./labels.js";

const ORIENTATIONS: Orientation[] = [0, 90, 180, 270];
const HATCH_GLYPH: Record<string, string> = {
  right: "→",
  up: "↑",
  left: "←",
  down: "↓",
};

interface Props {
  entry: CampaignEntry;
  onBack: () => void;
  /** Generator-suggested FR-5–FR-8 line. Authored campaign leaves this unset. */
  suggestedLayout?: DungeonLayout;
  onRegenerate?: () => void;
}

function snapshot(state: SimulationState): SimulationState {
  return { ...state, heroes: state.heroes.map((h) => ({ ...h })) };
}

function gridExtent(roomCount: number): { min: number; max: number } {
  const span = Math.max(6, roomCount + 2);
  return { min: -1, max: span - 2 };
}

export function MakerPlay({ entry, onBack, suggestedLayout, onRegenerate }: Props) {
  const authored = useMemo(() => parseLevel(entry.text), [entry.text]);
  const [named, setNamed] = useState(() => defaultNamedChoices(authored));
  const [inline, setInline] = useState<InlineChoixPicks>(() => defaultInlinePicks(authored));

  const level = useMemo(() => prepareCampaignLevel(authored, named, inline), [authored, named, inline]);
  const supplied = useMemo(() => enumerateSuppliedRooms(level), [level]);
  const extent = useMemo(() => gridExtent(supplied.length), [supplied.length]);
  const inlineSlots = useMemo(() => listInlineChoixSlots(authored), [authored]);

  const [orientation, setOrientation] = useState<Orientation>(0);
  const [rooms, setRooms] = useState<PlacedRoom[]>(() => suggestedLayout?.rooms ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(supplied[0]?.id ?? null);
  const [run, setRun] = useState<SimulationState | null>(null);
  const [spellPick, setSpellPick] = useState<number | null>(null);
  const [castError, setCastError] = useState<string | null>(null);

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
    // Reset when the campaign card changes (authored pick or regenerate).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suggested rooms follow entry.id
  }, [entry.id, entry.text]);

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
  const heroRoomId = run?.heroes.find((h) => h.spawned && !h.dead)?.roomId ?? null;
  const hatch = hatchDirection(orientation);
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
    <main className="app">
      <div className="topbar">
        <button type="button" onClick={onBack}>
          ← Campaign
        </button>
        <h1 style={{ margin: 0, fontSize: "1.35rem" }}>{entry.name}</h1>
        {onRegenerate ? (
          <button type="button" onClick={onRegenerate}>
            Regenerate
          </button>
        ) : null}
      </div>
      <p className="lede">
        {entry.id}
        {entry.difficulty !== null ? ` · Difficulté ${entry.difficulty}` : ""}
        {entry.pack === "generated" ? " · generated" : ""}
        {entry.contractName
          ? ` · ${entry.contractName} (cost ${entry.contractCost ?? "—"} flavour only)`
          : ""}
        . Place every supplied room, then start the fight with this level's
        heroes and spells.
      </p>
      <p className="honesty">
        Simulated engine, not Live. The outcome here is the scheduler result:
        heroes dead, Z reached, or stalemate. Engine `scoreLevel` (FR-43 /
        FR-44) is Simulated in tests; this view does not score extra
        constraints, bonuses, or mirror-world aggregates.
        {entry.pack === "generated"
          ? " This dungeon is generator output (parse + placement + FR-46 bounded search) — not a live production probe. FR-4 gating is still not built."
          : ""}
      </p>

      {entry.needsChoix ? (
        <section className="panel setup" style={{ marginBottom: "1rem" }}>
          <h2>Choix setup (FR-2)</h2>
          <p className="hint">Defaults are the first legal picks. Changing a choice clears the board.</p>
          {(authored.variables ?? []).map((variable) => {
            const choice = named[variable.name];
            const current = choice?.selected[0];
            if (variable.domain === "N" || variable.domain === "R") {
              return (
                <label key={variable.name}>
                  {variable.name} = choix({variable.n}, {variable.domain === "N" ? "ℕ" : "ℝ"})
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
                {slot.kind} choix
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
        <section className="panel">
          <h2>Rooms</h2>
          <p className="hint">
            Heroes: {level.heroes.map((h) => heroSlotLabel(h)).join(", ") || "(none)"}
            {(level.spells?.length ?? 0) > 0
              ? ` · Spells: ${level.spells!.map((s) => spellSlotLabel(s)).join(", ")}`
              : ""}
          </p>
          <div className="tray">
            {supplied.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className={selectedId === spec.id ? "selected" : ""}
                disabled={playing}
                onClick={() => setSelectedId(spec.id)}
              >
                {roomLabel(spec.def)} {placedIds.has(spec.id) ? "· placed" : "· tray"}
              </button>
            ))}
          </div>
          <h2 style={{ marginTop: "1rem" }}>Hatch / orientation</h2>
          <div className="orient">
            {ORIENTATIONS.map((deg) => (
              <button
                key={deg}
                type="button"
                className={orientation === deg ? "selected" : ""}
                disabled={playing}
                onClick={() => applyOrientation(deg)}
              >
                {deg}° {HATCH_GLYPH[hatchDirection(deg)]}
              </button>
            ))}
          </div>
          <button type="button" disabled={playing} onClick={placeInALine}>
            Place rooms in a line
          </button>
        </section>

        <section className="panel">
          <h2>Board</h2>
          <p className="hint">
            Click a cell to place the selected room. Click a placed room to pick it up. Hatch{" "}
            {HATCH_GLYPH[hatch]}.
          </p>
          <div className="board-wrap">
            <div
              className="board"
              style={{ gridTemplateColumns: `repeat(${extent.max - extent.min + 1}, 64px)` }}
            >
              {ys.flatMap((y) =>
                xs.map((x) => {
                  const room = boardLayout.rooms.find((r) => r.position.x === x && r.position.y === y);
                  const isHero = Boolean(room && heroRoomId === room.id);
                  return (
                    <button
                      key={`${x},${y}`}
                      type="button"
                      className={`cell${room ? " filled" : ""}${isHero ? " hero" : ""}`}
                      style={{ width: 64, height: 64 }}
                      onClick={() => onCellClick(x, y)}
                      aria-label={room ? `${roomLabel(room.def)} at ${x},${y}` : `Empty ${x},${y}`}
                    >
                      {room ? (
                        <>
                          <span className="hatch" aria-hidden>
                            {HATCH_GLYPH[hatch]}
                          </span>
                          <span className="kind">{roomLabel(room.def)}</span>
                          <span className="meta">
                            {x},{y}
                          </span>
                        </>
                      ) : (
                        <span className="meta">
                          {x},{y}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Validation</h2>
          {report.ok ? (
            <p className="ok">FR-5–FR-7 hold. Extermination is allowed (FR-8).</p>
          ) : (
            <ul className="issues">
              {report.issues.map((issue, i) => (
                <li key={`${issue.code}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}

          <h2 style={{ marginTop: "1rem" }}>Extermination</h2>
          <div className="controls">
            <button type="button" disabled={!gateOpen || playing} onClick={startRun}>
              Start
            </button>
            <button type="button" disabled={!run || run.outcome !== "in_progress"} onClick={stepPlayback}>
              Step
            </button>
            <button type="button" disabled={!run || run.outcome !== "in_progress"} onClick={runAll}>
              Run
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
              Back to Maker
            </button>
          </div>
          {run ? (
            <>
              {run.outcome !== "in_progress" ? (
                <p className={`banner ${run.outcome}`} role="status">
                  {run.outcome === "win"
                    ? "Win — every hero is dead (Simulated scheduler)."
                    : run.outcome === "loss"
                      ? "Loss — a hero reached Z (Simulated scheduler)."
                      : "Stalemate — nothing further changes (Simulated scheduler)."}
                </p>
              ) : null}
              <h2 style={{ marginTop: "1rem" }}>Spells (Φ)</h2>
              <p className="hint">
                {canCastNow(run)
                  ? pickedSpell?.def.type === "Move"
                    ? "Click an empty cell to Move the active hero's room."
                    : pickedSpell?.def.type === "Swap"
                      ? "Click another room to Swap with the active hero's room."
                      : "Cast is legal between completed actions."
                  : "Step at least once before casting. Never mid-action."}
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
                    {spellLabel(spell.def)} {spell.consumed ? "· spent" : "· ready"}
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
                  Cast {pickedSpell ? spellLabel(pickedSpell.def) : "spell"}
                </button>
              </div>
              {castError ? (
                <p className="issues">
                  <span>{castError}</span>
                </p>
              ) : null}
              <p className="hp">
                Outcome: <strong>{run.outcome}</strong>
                {run.heroes.map((h) => (
                  <span key={h.id}>
                    {" "}
                    · {h.def.type} {h.id} HP {h.hp}
                    {h.gold?.length ? ` gold ${h.gold.length}` : ""}
                    {h.dead ? " (dead)" : h.sleeping ? " (asleep)" : h.spawned ? "" : " (waiting)"}
                    {h.cell ? ` @ ${h.cell.x},${h.cell.y}` : ""}
                  </span>
                ))}
              </p>
              <pre className="log">
                {run.events.map((e) => JSON.stringify(e)).join("\n") || "(no events yet — press Step)"}
              </pre>
            </>
          ) : (
            <p className="hint">Start is disabled until the layout is a single valid dungeon.</p>
          )}
        </section>
      </div>
    </main>
  );
}
