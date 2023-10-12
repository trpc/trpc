const handleSmoothScrollToSection = (
  e: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
) => {
  const isModifiedEvent = !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);

  const shouldProcessLinkClick =
    e.button === 0 && // Ignore everything but left clicks
    !isModifiedEvent; // Ignore clicks with modifier keys ;

  if (shouldProcessLinkClick) {
    e.preventDefault();

    const href = e.currentTarget.href;

    const id = href.split('#')[1];

    const section = document.getElementById(id);
    section?.scrollIntoView({ behavior: 'smooth' });

    window.history.pushState(null, '', href);
  }
};

export { handleSmoothScrollToSection };
