<!--
  Flip to Match Game
  License: MIT. You may use, copy, modify, and distribute this code freely,
  provided you keep the copyright and permission notice. See LICENSE.
-->
# Flip to Match Game - Step-By-Step Assignment Guide

This guide explains, step by step, how the memory game must work from a player's and developer's perspective. It replaces prior notes and serves as the single source of truth for scope and acceptance.

## Player Experience (Step by Step)
1) Open Game
- Load the page and see a start dialog prompting for player name, email address, and a grid size.

2) Choose Grid
- Rows and Columns are each 2-5.
- If rows x columns is odd, one slot remains empty (position may vary).

3) Start Game
- Click Start. The dialog closes, the board renders, and the Restart button enables.
- The status message switches to an intro: "<name>, find all the matching pairs!"

4) Board Layout
- The board shows a grid of face-down cards. Each card front displays a "?".
- Each card has exactly one matching pair. The back of a card shows an emoji (as an image) when flipped.

5) First Flip Starts Timer
- The first card click starts the timer. Time and score update every ~250ms.

6) Flip + Compare
- Click a card -> it flips to reveal the emoji image.
- Click a second card -> input locks while comparing.
  - If both cards match: behavior depends on the wizard option (see 2a); cards always become inactive (matched state).
  - If they do not match: they stay revealed briefly (<=1s), then flip back automatically.

7) Progress, Score, and Moves
- Moves increment on each pair comparison (every time two cards are revealed).
- Score starts at pairs x 100 and decays over time at a steady per-second penalty.
- Status shows progress: "Great work, <name>! <found> / <total> pairs found."
- The best score per grid variant (by total slots) is stored locally in the browser and shown in the scoreboard.
 - After each win, a full result (name, email, grid, score, time, moves) is saved to the browser's local database (IndexedDB) for offline history.

8) Win State
- When all pairs are matched, stop the timer and show a win overlay with name, final time, moves, and final score. Confetti animates.
- The overlay appears after the final flip/fade completes and the game UI is hidden behind the overlay; Restart is available in the overlay.

9) Restart
- Clicking Restart reopens the dialog with the last selections prefilled. Board/timer/score reset.

## Functional Requirements (Checklist)
- Odd totals allowed: if rows x columns is odd, render pairs only (one empty slot remains in the grid).
- Card faces: fronts always show "?", backs show emoji (as images) on flip.
- Exact pairs: each emoji appears in exactly two cards.
- Lock while comparing two flips; ignore extra clicks until resolved.
- Matched card behavior is configurable:
  - Hide matched ON: matched pairs fade/scale and hide; their slots remain reserved (no layout shift).
  - Hide matched OFF: matched pairs stay revealed and disabled.
- Timer starts on the first flip; timer and score update at ~250ms intervals.
- Score = pairs x 100 minus a time-based penalty; grid orientation (e.g., 4x5 vs 5x4) must not affect the final score for equal completion times.
- Status messages: intro, progress, try-again (on mismatch), and win.
- Responsive layout: board resizes cards to avoid scrollbars; maintains ~1:1.2 card aspect.
- Accessibility: ARIA labels announce hidden/revealed/matched; start dialog is modal with focus management and visible focus styles.

## Developer Steps (How to Implement)
1) Structure
- `index.html`: provide header, controls (status, scoreboard, restart), a `.game-board` container, a start dialog, and a win overlay.

2) State & DOM Map
- In `app.js`, maintain a single `state` object (config, cardsInPlay, matchesFound, busy lock, moves, score, timer).
- Cache key DOM elements in a `DOM` map for efficient updates.

3) Validation
- On Start submit, read name + email + rows + columns.
- Ensure 2-5 bounds for both. If invalid, display inline error and return.
 - Validate email format before starting.

4) Deck Building
- Compute totalPairs = (rows x columns) / 2.
- Select `totalPairs` unique emojis and duplicate each to form pairs.
- Shuffle the resulting list; if total is odd, add a single empty slot (no card) to preserve layout.

5) Rendering
- Clear the board and append a button for each card.
- Each card markup:
  - Front: `?`
  - Back: an emoji rendered as an image (e.g., generated SVG data-URI) so the back is a true image element.

6) Flip Animation
- Use 3D transforms (`rotateY`) with `backface-visibility: hidden` so only one face is visible at a time.
- Either flip faces individually (front -> 180deg, back -> 0deg) or rotate an inner container; include WebKit prefixes for Safari.
- Add/remove the `.is-flipped` class on the card to animate.

7) Interaction Logic
- On first flip, start the timer.
- Push flipped card into `state.cardsInPlay`.
- When two cards are in play, set `state.busy = true`, compare their dataset values, and resolve:
  - Match: mark both as matched and leave flipped; increment `matchesFound` and `moves`.
  - Mismatch: wait <=1s, flip both back; increment `moves`.
- Clear `cardsInPlay` and release the busy lock after resolution.

8) Score & Timer
- Start timer on first flip, update elapsed time and score periodically.
- Score decays over time using a simple per-second penalty derived from max score.
- Persist and display best score per grid variant using localStorage.
 - Persist per-game results (name, email, rows, columns, slots, score, maxScore, timeMs, moves, timestamp) in IndexedDB.

9) Win Flow
- If `matchesFound === totalPairs`, stop the timer, update the final stats, and show the win overlay + confetti after the final animation finishes.

10) Restart Flow
- Reopen the start dialog, reset state/timer/score, and prefill the last selections.

## Acceptance Criteria (Step-By-Step)
1) Can start when rows and columns are between 2-5; odd totals allowed (one empty slot).
2) Starting creates a board of face-down "?" cards; each card has one matching pair.
3) First flip starts a running timer; time and score update ~every 250ms.
4) On flip of two cards, input locks; match behavior follows the wizard option (hide or keep revealed); mismatch flips both back <=1s later.
5) Progress text shows `<found> / <total>` pairs; moves increment per comparison.
6) On completing all pairs, a win overlay appears with name, time, moves, and score; confetti animates.
7) Restart returns to the dialog with previous values prefilled; board/time/score reset.
8) Board fits viewport without scrollbars; cards maintain aspect; orientation does not affect score for equal completion times.
9) Screen readers announce card states; focus is managed properly in the dialog and controls.

## Manual Test Plan (Do These Steps)
- Validate inputs: odd totals start; grid shows one empty slot; even totals fully filled.
- Try 2x2, 4x4, 4x5, 5x4 grids; confirm no scrollbars and proper sizing.
- Flip quickly and try to click more while two are revealed -> further clicks ignored until resolved.
- With Hide matched ON: confirm matched cards fade/scale and disappear; with OFF: confirm matched cards remain revealed and disabled.
- Check scoring decreases over time and is equal for 4x5 vs 5x4 with the same finish time.
- Verify status messages change appropriately; win overlay shows correct stats.
- Keyboard tab through controls and dialog; ARIA labels reflect hidden/revealed/matched.

## Troubleshooting
- Back not visible after flip -> ensure `.is-flipped` applied and `backface-visibility: hidden` + vendor prefixes present.
- Flicker/blank during flip -> don't fade fronts to `opacity: 0` at the beginning of rotation; rely on 3D faces.
- Images missing -> ensure back face uses an `<img>` (inline SVG or file path) with valid `src` and sizing rules.

## Future Enhancements
- Persist high scores (localStorage) per grid.
- Sound effects and theme packs (alternate emoji/image sets).
- Keyboard controls and richer screen reader hints.
