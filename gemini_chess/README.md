# Gemini chess: Sanctuary of the Twin Falls

This folder contains the complete original Gemini-generated game, **Celestial vs. Shadow Chess**. `index.html` is a self-contained 1,641,505-byte source file containing HTML, CSS, JavaScript, two scene images, and twelve piece sprites. It has no external asset URLs or package dependencies.

The smaller `../gemini_chess.html` is the earlier compact version and remains unchanged. The complete recovered original is here.

## Play

From the repository root, run `python3 -m http.server 8080`, then open http://localhost:8080/gemini_chess/ in a browser. There is no build step.

The interface offers human-versus-AI, two-player pass-and-play, and AI-versus-AI modes; time controls; an immersive scene and tactical dual view; board flipping; hints; piece role labels; threat highlighting; sound; move-history controls; and PGN copying.

Keyboard shortcuts: F flips the board, H requests a hint, Z toggles Zen mode, T toggles threat highlighting, and O shows the original scene. Clipboard and audio features may depend on browser permission or a user gesture.

## Validation and provenance

- The original recovered HTML is preserved byte-for-byte.
- SHA-256: `b1f6cbe33e0157da76ebecd10ab99cc0eb2b31565d7a1d463ce0966f5ed32741`
- JavaScript syntax check passed.
- All fourteen embedded WebP images decoded and validated.
- Initial-position move-generation checks passed at depths 1–3: 20, 400, and 8,902 positions.
- No credentials were found by the source scan.

These checks do not establish full chess-rule correctness or browser usability. No new real-browser, mobile/touch, sound, or clipboard test was performed for this upload.
