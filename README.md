# Chess LLM comparison

Three independently generated chess games are kept side by side.

| Version | Start here | Documentation |
| --- | --- | --- |
| Claude | [claude_chess/index.html](claude_chess/index.html) | [Claude README](claude_chess/README.md) |
| GPT | [gpt_chess/dist/index.html](gpt_chess/dist/index.html) | [GPT README](gpt_chess/README.md) |
| Gemini | [gemini_chess/index.html](gemini_chess/index.html) | [Gemini README](gemini_chess/README.md) |

## Run locally

From the repository root, run:

```sh
python3 -m http.server 8080
```

Then open one of:

- Claude: http://localhost:8080/claude_chess/
- GPT: http://localhost:8080/gpt_chess/dist/
- Gemini: http://localhost:8080/gemini_chess/

Claude loads three.js from jsDelivr and needs an internet connection. GPT serves its local assets. Gemini's complete source includes its styles, game engine, and all 14 image assets inside its single HTML file.

The older compact [gemini_chess.html](gemini_chess.html) is preserved for reference. Use `gemini_chess/index.html` for the full original Gemini game.

## Checks

- GPT: 18 automated tests, asset validation, and JavaScript syntax checks passed. Run `npm test` and `node scripts/check-assets.mjs` inside `gpt_chess`.
- Gemini: JavaScript syntax and all 14 embedded image files validated; initial-position move generation passed depths 1–3 (20, 400, 8,902 positions).
- Claude: existing source and documentation preserved; see its README for build and test commands.

These import checks do not substitute for browser, pointer/touch, fullscreen, or audio testing. No new real-browser pass was performed for this upload.
