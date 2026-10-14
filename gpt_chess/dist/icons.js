const paths = {
  flip: '<path d="M4 8h14l-4-4M20 16H6l4 4M4 8v5m16 3v-5"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16M12 4v16"/>',
  mountain: '<path d="m2 19 7-12 4 7 3-5 6 10H2ZM7 10l2 2 2-2"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 5 6m0-6-5 6"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  flag: '<path d="M5 22V3c5-5 9 5 15 0v10c-6 5-10-5-15 0"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.help}</svg>`;

const silhouettes = {
  p: '<circle cx="30" cy="15" r="7"/><path d="M25 22h10l-2 12 7 9H20l7-9Z"/><path d="M18 43h24v6H18Z"/>',
  r: '<path d="M18 9h6v6h4V9h5v6h4V9h6v13l-5 5 2 16H20l2-16-4-5Z"/><path d="M17 43h26v6H17Z"/>',
  n: '<path d="m20 41 3-10-9-2 3-11 10-6 2-6 7 5c13 5 10 19 5 30H20Z"/><path d="m18 25 9-4M28 17h.1" fill="none"/><path d="M17 43h27v6H17Z"/>',
  b: '<path d="M30 6c-4 6-12 9-10 17 1 5 6 6 7 8l-6 12h18l-6-12c5-3 10-7 7-13L30 6Z"/><path d="m31 12-4 9" fill="none"/><path d="M17 43h26v6H17Z"/>',
  q: '<path d="m17 17 6 7 7-12 7 12 6-7-5 18 3 8H19l3-8Z"/><circle cx="16" cy="14" r="3"/><circle cx="30" cy="9" r="3"/><circle cx="44" cy="14" r="3"/><path d="M17 43h26v6H17ZM22 34h16"/>',
  k: '<path d="M30 3v13m-5-8h10" fill="none" stroke-width="3"/><path d="M30 17c-8-8-17-1-13 6l7 10-4 10h20l-4-10 7-10c4-7-5-14-13-6Z"/><path d="M23 34h14M17 43h26v6H17Z"/>',
};
export function pieceIcon(type, color = 'w') {
  return `<svg viewBox="0 0 60 56" aria-hidden="true" class="classic-piece ${color}"><g fill="${color === 'w' ? '#fff5da' : '#292a2a'}" stroke="${color === 'w' ? '#5a4b33' : '#cfbf9f'}" stroke-width="1.8" stroke-linejoin="round">${silhouettes[type]}</g></svg>`;
}
