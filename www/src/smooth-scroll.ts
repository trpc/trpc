/**
 * Turns on smooth scrolling (`styles.css`) at the reader's first click, tap
 * or key press, so in-page links glide but the jump to the heading a page
 * opens at doesn't.
 */
export function enableSmoothScrollOnInput() {
  const enable = () => {
    document.documentElement.setAttribute('data-smooth-scroll', '');
    window.removeEventListener('pointerdown', enable, { capture: true });
    window.removeEventListener('keydown', enable, { capture: true });
  };
  window.addEventListener('pointerdown', enable, { capture: true });
  window.addEventListener('keydown', enable, { capture: true });
}
