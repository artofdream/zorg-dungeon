/** English message catalog — source of truth for Maker display strings (ADR-0007). */
export const en = {
  // Chrome / landing
  "chrome.makerTitle": "Zorg's Dungeon Maker",
  "chrome.langEn": "EN",
  "chrome.langFr": "FR",
  "chrome.langSwitcher": "Language",
  "chrome.back": "← Campaign",
  "chrome.regenerate": "Regenerate",
  "chrome.practiceTag": "practice dungeon",
  "chrome.clearBoard": "Clear board",
  "chrome.skipToContent": "Skip to content",

  // Knowledge links
  "knowledge.learnLabel": "Learn the rules",
  "knowledge.guideLabel": "Player guide",
  "knowledge.journeysLabel": "Persona journeys",
  "knowledge.learnHint": "— pictures and short sentences.",

  // How to play / first-run
  "howTo.title": "How to play",
  "howTo.step1": "Pick an easy level, or press Generate Difficulty 1.",
  "howTo.step2": "Place rooms so Start (A) connects toward Exit (Z).",
  "howTo.step3": "Press Start fight.",
  "howTo.step4": "You win if you stop the heroes before they reach the exit.",
  "landing.lede":
    "Build a dungeon, then start the fight. Heroes walk on their own. Stop them before they reach the exit.",
  "landing.helperBlurb":
    "Success looks like this: you stopped every hero before anyone entered the exit. One next step at a time.",
  "landing.startHereDifficulty": "Start here — Difficulty 1",
  "landing.startHereGenerate": "Start here — Generate Difficulty 1",
  "landing.startHereBadge": "Start here",
  "landing.pickLevel": "Pick a level",
  "landing.openHint": "Every playable level in this list is open.",
  "landing.showUnfinished": "Show unfinished levels",
  "landing.emptyFilter": "No levels in this filter. Try another Difficulty or show unfinished levels.",
  "landing.allContracts": "All contracts",
  "landing.setupChoicesMeta": " · setup choices",
  "landing.unfinishedPrefix": "Unfinished — ",
  "landing.playableCounts": "{{playable}} playable · {{unfinished}} unfinished · quarantine and placeholder contracts 11–15 omitted",
  "landing.generateAria": "Generate Difficulty",
  "landing.difficultyAria": "Difficulty",
  "landing.contractAria": "Contract flavour filter",
  "landing.generateButton": "Generate Difficulty {{band}}",
  "landing.difficultyChip": "Difficulty {{band}}",

  "practice.title": "Practice dungeon",
  "practice.hint":
    "Makes a ready-to-play beginner dungeon. Authored levels above stay the main campaign.",
  "filters.moreSummary": "More filters (contract flavour)",
  "filters.moreHint":
    "Optional flavour labels only. They are not unlock systems — FR-4 gating is not built.",

  "honesty.summary":
    "This game is still being tested. Every playable level is open right now.",
  "honesty.details":
    "Engineer / honesty notes (not needed to play): Simulated engine tests — not a live production probe. Contract costs are labels only (FR-4 gating is not built). Levels with C rooms or Gunner duration stay unavailable — those rules are not invented here. Generated levels are Simulated engine output, not a live probe. See the honesty ledger and persona journeys.",
  "honesty.makerDetails":
    "Engineer notes: Simulated engine, not Live. The outcome here is the scheduler result (heroes at 0 HP / stopped, Z reached, or stalemate). A win means every hero has 0 HP and nobody entered Z — the kid headline is “you stopped them,” not “heroes are dead.” Engine scoreLevel (FR-43 / FR-44) is Simulated in tests; this view does not score extra constraints, bonuses, or mirror-world aggregates. Doors / wall-hatch direction follows the spawn-room orientation anchor (FR-7).",
  "honesty.makerGenerated":
    " This dungeon is generator output (parse + placement + FR-46 bounded search) — not a live production probe. FR-4 gating is still not built.",

  "maker.howTo":
    "Place rooms so Start connects toward Exit. Then Start fight. Stop the heroes before they reach the exit.",
  "maker.gateOk": "Looks good — rooms are connected. You can start the fight.",
  "maker.gateBlocked": "Start fight stays off until the rooms make one connected dungeon.",
  "maker.startFight": "Start fight",
  "maker.step": "Step",
  "maker.run": "Run",
  "maker.backToMaker": "Back to Maker",
  "maker.rooms": "Rooms",
  "maker.board": "Board",
  "maker.validation": "Validation",
  "maker.heroesNone": "Heroes: (none)",
  "maker.spellsPrefix": "Spells: ",
  "maker.placed": "· placed",
  "maker.tray": "· tray",
  "maker.startRoomDoors": " · start-room doors",
  "maker.boardHint":
    "Click a cell to place the selected room. Click a placed room to pick it up. Green outline marks the next cells beside rooms already on the board.",
  "maker.placing": " · placing {{name}}",
  "maker.nextLegal": "next legal cell",
  "maker.nextHint": "Next",
  "maker.heroRoster": "Hero roster",
  "maker.castSpell": "Cast {{name}}",
  "maker.castSpellFallback": "Cast spell",
  "maker.spellSpent": "· spent",
  "maker.spellReady": "· ready",
  "maker.heroesHead": "Heroes",
  "maker.stopped": "stopped",
  "maker.fell": " (fell)",
  "maker.asleep": " (asleep)",
  "maker.waiting": " (waiting)",
  "maker.gold": " · gold {{n}}",
  "maker.hp": " · HP {{hp}}",
  "maker.castMoveHint": "Click an empty cell to Move the active hero's room.",
  "maker.castSwapHint": "Click another room to Swap with the active hero's room.",
  "maker.castOkHint": "You can cast between finished steps.",
  "maker.castNeedStep": "Press Step at least once before casting.",
  "maker.choixLabel": "{{kind}} choice",
  "maker.difficultyLine": "Difficulty {{band}}",
  "maker.ledeAuthored": "{{title}} · Difficulty {{band}}",
  "maker.ledeGenerated": "{{title}} · Difficulty {{band}} · practice dungeon",

  "fight.title": "Fight",
  "fight.turnHelp":
    "Your turn help: press Step to let one hero act, or Run to finish. Cast a spell only between finished steps — never mid-action.",
  "fight.winGoal": "Goal: stop the heroes before they reach the exit.",
  "fight.winHeadline": "You stopped them before they reached the exit!",
  "fight.lossHeadline": "A hero reached the exit — you lose.",
  "fight.stalemateHeadline": "Stalemate — nothing further changes.",
  "fight.winHonesty":
    "Honesty: the engine marks a win when every hero has 0 HP and nobody entered Z. Kids see “you stopped them,” not “heroes are dead,” as the headline.",

  "setup.title": "Setup choices",
  "setup.hint": "Pick what you want on the board. Changing a choice clears the rooms.",
  "spells.title": "Spells",
  "placeInLine.label": "Place rooms in a line",
  "placeInLine.hint":
    "New here? Press Place rooms in a line to get a ready path from Start to Exit.",
  "board.emptyHint":
    "The board is empty. Pick a room on the left, or press Place rooms in a line.",
  "doors.faceTitle": "Doors face",

  "difficulty.chip": "Difficulty {{band}} (Difficulté {{band}})",
  "difficulty.chipCount": "Difficulty {{band}} (Difficulté {{band}}) ({{count}})",
  "difficulty.unspecified": "No Difficulty (no Difficulté)",
  "difficulty.unspecifiedCount": "No Difficulty (no Difficulté) ({{count}})",
  "difficulty.entry": " · Difficulty {{difficulty}}",

  // Room kid labels (letter stays as token)
  "room.A.label": "Start (A)",
  "room.Z.label": "Exit (Z)",
  "room.D.label": "Danger ({{damage}})",
  "room.E.label": "Element ({{element}})",
  "room.P.label": "Portal ({{entries}})",
  "room.O.label": "Gold ({{gold}})",
  "room.T.label": "Toll ({{cost}})",
  "room.C.label": "Special (C)",
  "room.A.word": "Start",
  "room.Z.word": "Exit",
  "room.D.word": "Danger",
  "room.P.word": "Portal",
  "room.O.word": "Gold",
  "room.T.word": "Toll",
  "room.C.word": "Special",

  "room.feed.A": "the start room",
  "room.feed.Z": "the exit (Zorg)",
  "room.feed.D": "a danger room",
  "room.feed.E": "an element room",
  "room.feed.P": "a portal room",
  "room.feed.O": "a gold room",
  "room.feed.T": "a toll room",
  "room.feed.C": "a special room",
  "room.feed.default": "the next room",

  "hero.Warrior": "Warrior · {{hp}} HP",
  "hero.Elf": "Elf · {{hp}} HP",
  "hero.Gunner": "Gunner · {{hp}} HP · {{shots}} shots",
  "hero.Mechanic": "Mechanic · {{hp}} HP",
  "hero.Princess": "Princess · {{hp}} HP",
  "hero.fallback": "Hero {{id}}",

  "spell.Attack": "Attack · {{damage}} damage",
  "spell.Teleport": "Teleport · {{steps}} steps",
  "spell.Selection": "Selection",
  "spell.Move": "Move",
  "spell.Swap": "Swap",
  "spell.Sleep": "Sleep",
  "spell.Wake": "Wake",
  "spell.Banality": "Banality",

  "campaign.untitled": "Untitled level",
  "choice.prefix": "choice",

  // Event feed
  "event.feedTitle": "What happened",
  "event.feedEmpty": "No events yet — press Step.",
  "event.technical": "Technical log (raw events)",
  "event.spawn": "{{hero}} entered the dungeon.",
  "event.move": "{{hero}} walked {{dir}}.",
  "event.enter": "{{hero}} entered {{room}}.",
  "event.damage": "{{hero}} took {{amount}} damage (HP {{hp}}).",
  "event.pickup": "{{hero}} picked up gold ({{amount}}).",
  "event.toll": "{{hero}} paid a toll ({{amount}} gold).",
  "event.goldDrop": "{{hero}} dropped gold.",
  "event.teleport": "{{hero}} teleported to another room.",
  "event.waitRoom": "{{hero}} is still waiting to enter.",
  "event.death": "{{hero}} fell.",
  "event.wait": "{{hero}} waited.",
  "event.cast": "You cast {{spell}}.",
  "event.sleep": "{{hero}} fell asleep.",
  "event.wake": "{{hero}} woke up.",
  "event.banality": "{{hero}} was hit by Banality.",
  "event.roomMove": "A room slid to a new place.",
  "event.shove": "{{hero}} shoved a room {{dir}}.",
  "event.fire": "{{hero}} fired {{dir}}.",
  "event.shell": "{{hero}} cleared a path with a shell.",
  "event.loss": "{{hero}} reached the exit.",
  "event.win": "You stopped them before they reached the exit.",
  "event.stalemate": "Nothing further changes.",

  // Hatch / orientation (display words)
  "hatch.right": "right",
  "hatch.up": "up",
  "hatch.left": "left",
  "hatch.down": "down",
  "hatch.doorsFace": "Doors face {{word}}",
  "hatch.helper":
    "Every room's doors face the same way, taken from the Start (A) rooms. The bright arrow shows that way. Change it here before you place.",
  "hatch.honesty":
    "Wall-hatch direction / orientation follows the spawn-room (A) anchor (FR-7). Start fight stays closed until FR-5–FR-7 hold.",
  "hatch.startDoors": " · start-room doors",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
