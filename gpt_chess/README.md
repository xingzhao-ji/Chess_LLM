# The Gilded Vale

A complete browser chess game for two people sharing one device. The fantasy marble board, sunset valley, and separately rendered ivory and obsidian sculptures are based on the supplied 2048 × 1143 reference, which superseded the initial blurry image. The scene is a perspective 2.5D recreation, not an identical 3D reconstruction of the source image.

## Play

Open the deployed Site, choose a piece, and click a legal destination or drag to a square. Arrow keys navigate; Enter or Space selects. F flips the board, V switches between scenery and a clear tactical board, I toggles immersion, and Escape clears the selection. Mobile defaults to tactical view.

Settings provide legal move guides, last-move highlighting, automatic turning, reduced motion, and two lighting treatments. Sound is opt-in and synthesized locally: quiet waterfall noise and piece movement tones. No audio or image requests leave the Site during play.

New games can be untimed or 3+2, 5+3, 10+5, or 15+10. Clocks start after the first white move. Wall-clock timing remains accurate through hidden tabs and reloads. Pausing, takebacks, and agreed draws require confirmation. Takebacks restore the pre-move position and clock snapshot; ended games remain final. Games persist in local browser storage and export to PGN from the journal. The game is local multiplayer; it does not provide online matchmaking or a computer opponent.

## Structure

- `dist/game.js`: rules integration, timers, persistence, PGN.
- `dist/geometry.js`: shared projective rendering and hit-test transforms.
- `dist/board.js`: accessible grid, sculptures, dragging, keyboard controls.
- `dist/app.js`: interface state, dialogs, game lifecycle.
- `dist/style.css`: responsive presentation and motion preferences.
- `dist/audio.js`: opt-in synthesized ambience and piece sounds.
- `dist/vendor/chess.js`: pinned chess.js 1.4.0, BSD-2-Clause; license adjacent.
- `dist/assets`: optimized production images, reference, and sprite definitions.
- `source-art`: original generated PNG assets, retained as editable masters.

Run `npm test` with Node 20+; there are no install-time or runtime package dependencies. Serve `dist` from any static HTTP server to develop. From this directory, run `python3 -m http.server 8080 --directory dist`, then open http://localhost:8080. The application is buildless; no compilation step is needed. Deployment-specific Site metadata is intentionally excluded from this GitHub copy.

## Validation

Rule and integration checks cover opening perft, castling and castling through check, en passant, all promotions, checkmate, automatic draws, clocks including background intervals and reloads, pause/resume, undo, PGN round trips, corrupt saves, and every board coordinate in both orientations and views. DOM interaction checks are run separately in an emulated DOM. A browser preview tool was unavailable during implementation; visual behavior and native pointer/touch/fullscreen/audio behavior have not received a real-browser pass.

Draw adjudication is casual: threefold repetition and the fifty-move rule apply automatically instead of requiring a tournament-style claim. The original reference is accessible from Settings, and the recreation is explicitly identified there.
