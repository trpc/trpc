# Docs announcement bar (human)

- Every page of the docs site opens with a dismissable bar saying raf-query is early and is used at your own risk (`www/src/components/announcement-bar.tsx`, rendered above the header in `www/src/routes/__root.tsx`).
- The bar is in the prerendered HTML. Dismissing it stores `announcementId` in `localStorage` and sets `data-announcement-dismissed` on `<html>`; `styles.css` hides the bar under that attribute, and a head script restores it before first paint, as the theme script does. No React state, so hydration never disagrees and a dismissed bar never flashes.
- Change `announcementId` with the message, so readers who dismissed the old one see the new one.
- It scrolls away with the page rather than sticking, so the sticky header and sidebar offsets (`top-14`) stay right.
- Lost: rendering after hydration from React state (the bar would flash for everyone who dismissed it, or pop in for everyone who didn't).
