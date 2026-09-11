import { useMemo, useState } from "react";
import {
  canStartExtermination,
  createRun,
  enumerateSuppliedRooms,
  hatchDirection,
  phase1DemoLevel,
  stepRun,
  validateLayout,
  type DungeonLayout,
  type Orientation,
  type PlacedRoom,
  type RoomDef,
  type SimulationState,
} from "@zorg/engine";

const ORIENTATIONS: Orientation[] = [0, 90, 180, 270];
const GRID_MIN = -1;
const GRID_MAX = 4;
const HATCH_GLYPH: Record<string, string> = {
  right: "→",
  up: "↑",
  left: "←",
  down: "↓",
};

function roomLabel(def: RoomDef): string {
  switch (def.type) {
    case "A":
    case "Z":
      return def.type;
    case "D":
      return `D(${def.damage})`;
    case "E":
      return `E(${def.element})`;
    case "P":
      return `P(${def.entries})`;
    case "O":
      return `O(${def.gold})`;
    case "T":
      return `T(${def.cost})`;
    case "C":
      return `C(${def.args.join(",")})`;
  }
}

function ys(): number[] {
  const out: number[] = [];
  for (let y = GRID_MAX; y >= GRID_MIN; y--) out.push(y);
  return out;
}

function xs(): number[] {
  const out: number[] = [];
  for (let x = GRID_MIN; x <= GRID_MAX; x++) out.push(x);
  return out;
}

export function App() {
  const level = useMemo(() => phase1DemoLevel(), []);
  const supplied = useMemo(() => enumerateSuppliedRooms(level), [level]);
  const [orientation, setOrientation] = useState<Orientation>(0);
  const [rooms, setRooms] = useState<PlacedRoom[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(supplied[0]?.id ?? null);
  const [run, setRun] = useState<SimulationState | null>(null);

  const layout: DungeonLayout = useMemo(
    () => ({ rooms: rooms.map((r) => ({ ...r, orientation })) }),
    [rooms, orientation],
  );
  const report = useMemo(() => validateLayout(level, layout), [level, layout]);
  const placedIds = new Set(rooms.map((r) => r.id));
  const gateOpen = canStartExtermination(level, layout);
  const playing = run !== null;

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

  function placeExampleLine() {
    if (playing) return;
    const byId = new Map(supplied.map((spec) => [spec.id, spec]));
    const order = ["A:0", "D:0", "Z:0"];
    setRooms(
      order.flatMap((id, i) => {
        const spec = byId.get(id);
        return spec
          ? [{ id: spec.id, def: spec.def, position: { x: i, y: 1 }, orientation }]
          : [];
      }),
    );
    setSelectedId(null);
  }

  function startRun() {
    if (!gateOpen) return;
    setRun(createRun(level, layout));
  }

  function stepPlayback() {
    if (!run || run.outcome !== "in_progress") return;
    const { state } = stepRun(run);
    setRun({ ...state, heroes: state.heroes.map((h) => ({ ...h })) });
  }

  function runAll() {
    if (!run) return;
    let current = run;
    while (current.outcome === "in_progress") {
      const { state, events } = stepRun(current);
      current = state;
      if (events.length === 0) break;
    }
    setRun({ ...current, heroes: current.heroes.map((h) => ({ ...h })) });
  }

  const heroRoomId = run?.heroes.find((h) => h.spawned && !h.dead)?.roomId ?? null;
  const hatch = hatchDirection(orientation);

  return (
    <main className="app">
      <h1>Zorg's Dungeon Maker</h1>
      <p className="lede">
        Phase 2 engine: A / Z / D / E and Warrior + Elf. This Maker demo still
        places A / Z / D and plays a Warrior — logic lives in <code>@zorg/engine</code>.
      </p>
      <p className="honesty">
        Status: engine-simulated (Vitest). Not Probed, not Live. See docs/STATUS_LEDGER.md.
      </p>

      <div className="layout">
        <section className="panel">
          <h2>Rooms</h2>
          <p className="hint">Demo level: {level.name}. Warrior(2) vs D(2).</p>
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
          <button type="button" disabled={playing} onClick={placeExampleLine}>
            Example A–D–Z line
          </button>
        </section>

        <section className="panel">
          <h2>Board</h2>
          <p className="hint">Click a cell to place the selected room. Click a placed room to pick it up. Hatch {HATCH_GLYPH[hatch]}.</p>
          <div className="board-wrap">
            <div
              className="board"
              style={{ gridTemplateColumns: `repeat(${GRID_MAX - GRID_MIN + 1}, 72px)` }}
            >
              {ys().flatMap((y) =>
                xs().map((x) => {
                  const room = layout.rooms.find((r) => r.position.x === x && r.position.y === y);
                  const isHero = Boolean(room && heroRoomId === room.id);
                  return (
                    <button
                      key={`${x},${y}`}
                      type="button"
                      className={`cell${room ? " filled" : ""}${isHero ? " hero" : ""}`}
                      onClick={() => placeAt(x, y)}
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
              onClick={() => setRun(null)}
            >
              Back to Maker
            </button>
          </div>
          {run ? (
            <>
              <p className="hp">
                Outcome: <strong>{run.outcome}</strong>
                {run.heroes.map((h) => (
                  <span key={h.id}>
                    {" "}
                    · {h.def.type} {h.id} HP {h.hp}
                    {h.dead ? " (dead)" : h.spawned ? "" : " (waiting)"}
                    {h.cell ? ` @ ${h.cell.x},${h.cell.y}` : ""}
                  </span>
                ))}
              </p>
              <pre className="log">
                {run.events
                  .map((e) => JSON.stringify(e))
                  .join("\n") || "(no events yet — press Step)"}
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
