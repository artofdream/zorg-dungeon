# ADR-0002: TypeScript monorepo, 2D now, 3D-and-native deferred behind one renderer interface

- Status: Accepted
- Date: 2026-09-09

## Context

Target progression is 2D (board-game style) now, 3D later, deployed to
laptop (web), then tablets and phones (Android first for validation).
NFR-1 (determinism) and NFR-4/NFR-10 (fast, isolated, headless testing of
the solver and hero AI) need to hold throughout that progression.

A game engine such as Unity or Godot would also reach web+mobile+3D from one
project, and a Unity license is available if this direction is revisited.
The trade-off: those engines fuse simulation and presentation, which makes
the deterministic, UI-free unit testing NFR-1/NFR-10 ask for harder to keep
cheap in CI (headless render setups, license activation per CI run), and
makes `scripts/check-requirements-trace.mjs` (linking FR/NFR IDs to plain
test files) awkward against engine-native test frameworks.

## Decision

- `packages/engine`: pure TypeScript, no DOM/engine dependency. Owns every
  FR-xx/NFR-xx behavior and is exhaustively unit-tested (Vitest) in CI in
  seconds, with no build/device step.
- `apps/web`: the Maker, Vite + React. Renders the dungeon on a plain 2D
  canvas now (matches the board-game phase). A future 3D pass swaps in
  three.js / react-three-fiber behind the same room-state props — engine
  code does not change.
- Laptop target: `apps/web` running directly in a browser.
- Tablet/phone target (Android first): wrap the built `apps/web` output with
  Capacitor to produce an installable Android app with zero UI fork. Revisit
  React Native only if Capacitor's WebView performance becomes a real
  constraint once 3D lands.
- Figma is available for mocking up the Maker's UI before building it, and
  the existing Unity license stays a fallback if the 2D-canvas → three.js →
  Capacitor path hits a wall — not adopted now, per the trade-off above.

## Consequences

One engine codebase, one UI codebase, for the whole 2D→3D / laptop→tablet→
phone progression. The only two things that change over time are which
renderer is mounted (canvas vs. three.js) and which shell runs `apps/web`
(browser vs. Capacitor) — `packages/engine` never has to know.
