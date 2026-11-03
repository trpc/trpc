/**
 * Turns on smooth scrolling (`styles.css`) at the reader's first click, tap
 * or key press, so in-page links glide but the jump to the heading a page
 * opens at doesn't. Some assistive technology clicks without a pointer or
 * key event first.
 */
export function enableSmoothScrollOnInput() {
  const events = ['pointerdown', 'keydown', 'click'] as const;
  const enable = () => {
    document.documentElement.setAttribute('data-smooth-scroll', '');
    for (const event of events) {
      window.removeEventListener(event, enable, { capture: true });
    }
  };
  for (const event of events) {
    window.addEventListener(event, enable, { capture: true });
  }
}
