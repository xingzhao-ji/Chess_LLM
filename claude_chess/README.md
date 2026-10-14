# claude_chess

A playable 3D fantasy chess game on a marble and gold board above a sunset valley. Two players can share one screen, or one player can face the computer.

## Play

Open `index.html` in a recent browser (Chrome, Safari, Firefox or Edge). It loads three.js from jsDelivr, so it needs an internet connection. Some browsers block local module scripts; if the page stays on the loading screen, serve the folder instead:

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Controls

- Click a piece, then a glowing square, or drag the piece.
- Drag the scenery to turn the camera; scroll or pinch to zoom.
- Left and right arrow keys step through the game. With the board focused, arrow keys move a cursor and Enter picks.
- U takes back a move, F flips sides, O toggles the overhead view, R resets the camera, M mutes, N starts a new game.

In a two-player game the camera turns to whoever moves next and the pieces turn to face them. Choose "White" or "Black" in the bottom bar to keep a fixed side.

## Layout

| Path | What it holds |
| --- | --- |
| `src/engine.js` | Rules engine (0x88 board, legal moves, SAN, draws) and the alpha-beta computer opponent |
| `src/pieces.js` | Procedurally sculpted piece set |
| `src/textures.js` | Marble, engraved frame, stone and the painted valley |
| `src/scene.js` | Lighting, board, terrace, ivy, reflections, square highlights |
| `src/app.js` | Camera, animation, input, clocks, sound and interface |
| `src/page.html` | Markup and styles |
| `build.py` | Combines `src/` into `index.html` |
| `test/perft.js` | Move-generation and rules tests |

## Build and test

```
python3 build.py      # regenerates index.html
node test/perft.js    # runs the engine tests
```
