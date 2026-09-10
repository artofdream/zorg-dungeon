import { manhattanDistance } from "@zorg/engine";

// Placeholder Maker shell: confirms the web app can build against the
// @zorg/engine package (see docs/adr/0002-*.md for why this split exists).
// Real room placement/validation (FR-5..FR-8) replaces this once Phase 1
// of the build plan (GAME_SPEC.md, section 5) starts.
export function App() {
  const spawnToBoss = manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 2 });

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Zorg's Dungeon Maker</h1>
      <p>Engine online. Sample dist(A, Z) = {spawnToBoss} (FR-10).</p>
      <p>The Maker's grid editor lands in Phase 1 — see GAME_SPEC.md.</p>
    </main>
  );
}
