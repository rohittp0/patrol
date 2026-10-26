const paths: Record<string, string> = {
  sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',
  cloud: '<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11z"/><path d="m9 12 3 3 4-5"/>',
  radio: '<path d="M6 8h12v14H6zM8 8V2m2 12h4m-4 4h4m4-14 3 3m-1-5 3 3"/>',
  commander: '<path d="M4 22v-3c0-4 16-4 16 0v3M7 8v3a5 5 0 0 0 10 0V8M4 6l8-4 8 4-3 3H7zM8 6h8M9 12h.1m5.9 0h.1M11 15h2"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
  levels: '<path d="M5 20V4m0 0h13l-3 4 3 4H5"/><circle cx="5" cy="20" r="1"/>',
  academy: '<path d="m2 8 10-5 10 5-10 5zM6 10v7q6 5 12 0v-7M22 8v9"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 5-4 5-4-5z"/>',
  play: '<path d="m8 4 13 8-13 8z"/>',
  speed:
    '<path d="M4 19a9 9 0 1 1 16 0M12 13l5-6"/><circle cx="12" cy="13" r="2"/>',
  rapid: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  helicopter:
    '<path d="M4 3h16M12 3v5M7 8h8l5 6v3H8l-3-6H2m4 10h14M10 17v4m6-4v4M15 8v6h5"/>',
  marksman:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  trophy:
    '<path d="M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v6m-5 0h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  compass:
    '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><circle cx="12" cy="12" r="2"/>',
  runner:
    '<circle cx="15" cy="4" r="2"/><path d="m12 9 3-2 3 4 3 1M6 9l4-1 3 6-4 3-2 5m6-8 4 3 1 5M10 8l-2 5-4 1"/>',
  squad:
    '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  shuffle:
    '<path d="m3 5 3 0 12 14h3M3 19h3L18 5h3m-4-4 4 4-4 4m0 6 4 4-4 4"/>',
  fit: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><circle cx="12" cy="12" r="3"/>',
  focus:
    '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  hint: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2z"/>',
};

export function icon(name: string, className = ""): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.compass}</svg>`;
}
