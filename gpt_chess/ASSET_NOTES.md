# Visual reference and production assets

The authoritative reference is `dist/assets/reference-sharp.jpeg` (2048 × 1143), supplied by the user during implementation. It replaces the initial 512 × 286 reference.

Production files are `dist/assets/vale.webp`, `dist/assets/ivory.webp`, `dist/assets/obsidian.webp`, and `dist/assets/sprites.json`. Full PNG masters are in `source-art`. All three images were made with the built-in image generation tool, with the supplied image as the edit/style reference. No CLI or API fallback was used. WebP encoding preserves alpha and reduces the load size.

## Scene prompt

Remove every chess piece and every piece shadow and reflection. Preserve the original camera, marble board, gold engraved border, coordinate labels, ivy, terrace balustrade, blurry castles, waterfalls, mountains, pastel sunset, and depth of field. Reconstruct only the vacated areas. No cropping or additional scenery. Preserve the 8 × 8 grid and original canvas proportions.

The generated plate inverted the colors of the two far ranks. The renderer repairs those 16 cells with mathematically projected polygons filled from marble texture samples in the same image. Hit testing shares the identical projective transform. The underlying image never determines legal square identities.

## Ivory atlas prompt

Six exact-reference sculpture designs, transparent 3-column × 2-row atlas: rook, knight, bishop; queen, king, pawn. Square ivory castle tower with octagonal base; rearing ivory winged unicorn; human-faced robed bishop with staff; crowned human queen with feathered wings; bearded human king with crown and orb-topped staff; ivory soldier pawn with spear and round shield. Preserve the pale marble, fine gold trim, circular tiered bases where appropriate, miniature textures, and frontal elevated view. No labels, board, scenery, overlap or background.

The initial ivory prompt mistakenly omitted the unicorn horn. A targeted edit restores one clear spiral horn emerging from the forehead, preserving the rest of the atlas. Both knight placements use that corrected asset; one is mirrored to match the reference's inward arrangement.

## Obsidian atlas prompt

Six exact-reference sculpture designs, transparent 3-column × 2-row atlas: rook, knight, bishop; queen, king, pawn. Slender gothic turret with three spires; rearing horned winged black unicorn; pale human-faced hooded bishop with staff; pale-faced dark queen with black feathered wings; armored king with cross-topped spiked crown and hands on sword pommel; green goblin pawn with sword and round shield. Match muted obsidian, thin bronze trim, miniature stone detail, round stepped bases, and soft original lighting. No labels, scenery or background.

## Fidelity

The result is an interactive 2.5D recreation. The original photograph is retained in Settings for direct comparison. Sculptures are generated image assets, not the original 3D meshes; unseen angles and exact pixel identity cannot be recovered from the source image. Tactical view uses distinct classic SVG silhouettes for legibility.
