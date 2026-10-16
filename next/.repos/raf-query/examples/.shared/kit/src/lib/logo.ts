/**
 * The raf-query mark: an "r" and a request in flight. `www/public/favicon.svg`
 * is the same image, which the docs site and the README use; keep the two in
 * sync.
 */
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><defs><linearGradient id="raf-query-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3B8EEA"/><stop offset="0.5" stop-color="#7B5CFF"/><stop offset="1" stop-color="#FF4D6D"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#raf-query-logo)"/><path d="M11 23.5V15a6 6 0 0 1 6-6h1.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="23" cy="21.25" r="2.75" fill="#fff"/></svg>`;

/** `logoSvg` as a URL, for `<img>` and the favicon. */
export const logoUrl = `data:image/svg+xml,${encodeURIComponent(logoSvg)}`;
