# H2Game - Card Flip Memory Game

## Game Description
H2Game is a responsive, accessible, offline-ready card flip memory game. Pick a grid, flip two cards at a time, and find all matching pairs. The game features smooth 3D flip animations, time-based scoring, and a celebratory win screen with confetti. It works entirely from local files - no server or network required.

### How to Play
- Open `index.html` in your browser.
- Enter your name and choose the number of rows and columns (2-5). Odd totals are allowed; one slot remains empty.
- Choose whether matched cards should disappear: leave the "Hide matched cards after a brief animation" box checked to remove matched cards, or uncheck it to keep them visible (but disabled).
- Click a card to flip it. Flip a second card to check for a match.
- Matches either stay revealed (if hiding is disabled) or briefly animate and disappear. Mismatches flip back after a short delay.
- Finish all pairs to see your time, moves, and final score. Use Restart to play again.

### Flip + Compare
- First flip starts the timer.
- When two cards are face up, input locks until comparison resolves.
- Match behavior (configurable in the wizard):
  - Hide matched ON: both cards stay flipped, then briefly fade/scale and disappear; the win popup waits for the final animation.
  - Hide matched OFF: both cards stay flipped/visible and are disabled.
- Mismatch: both cards remain revealed briefly and then flip back automatically.
- Moves increments once per comparison (every pair of flips).

### Key Features
- Works fully offline (local HTML/CSS/JS; no external assets)
- 3D card flip animations with cross-browser fallbacks
- Timer and time-based scoring
- Adaptive board sizing (no scrollbars)
- Accessible labels and focus handling
- Configurable matched-card behavior (hide matched cards or keep them visible)
- Win overlay with inline Restart; hides game UI behind the popup for a clean finish

## Project Structure
- `index.html` - Markup, start wizard, scoreboard, game board, and win overlay
- `styles.css` - Layout, responsive grid, animations, and theming
- `app.js` - Game logic, deck builder, timer/score, and interactions

## License (MIT)
This project is licensed under the MIT License.

- You may use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software.
- Attribution required: keep the copyright notice and permission notice in all copies/substantial portions.

See the LICENSE file for the full text.

## Trademarks
- "Memory" is a registered trademark of Ravensburger in many jurisdictions. This project is not affiliated with, sponsored by, or endorsed by Ravensburger. The title used here is descriptive ("Card Flip Memory Game"). If you plan to publish, consider using a distinct title (e.g., "Card Flip Match Game").
