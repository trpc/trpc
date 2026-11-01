import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  allHomeVersions,
  homeVersionLabels,
  homeVersionSearch,
  shownHomeVersions,
  useV12Shown,
} from '~/home-version.ts';
import { v12 } from '~/site.ts';
import { homeVersionBarLayout } from '~/home-version-bar-layout.ts';

const largeQuery = '(min-width: 1024px)';
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

interface BarStyle {
  readonly left: number | string;
  readonly position: 'absolute' | 'fixed';
  readonly top: number;
}

/** Docked above the code, centered: also the prerendered position. */
const dockedStyle: BarStyle = {
  left: '50%',
  position: 'absolute',
  top: 0,
};

function sameStyle(a: BarStyle, b: BarStyle) {
  return a.left === b.left && a.position === b.position && a.top === b.top;
}

/**
 * Docks (`absolute`) in the space reserved above the hero code block
 * (`#hero-code`), drifts toward the viewport center as you scroll (desktop),
 * snaps to `fixed` under the site header, and stops at the top of the
 * sponsors section so it scrolls away above it instead of fading.
 *
 * Active styles come from `html[data-home-version]` CSS so a `?version=`
 * deep link never flashes the wrong pill before hydration.
 */
/**
 * While v12 is hidden, only for a session that has been to v12
 * (`[data-v12-ui]`), its links without an `href` until then (`useV12Shown`).
 */
export function HomeVersionBar() {
  const [style, setStyle] = useState<BarStyle>(dockedStyle);
  const shown = useV12Shown();

  return (
    <div
      className="pointer-events-none z-30 w-max -translate-x-1/2"
      data-v12-ui={v12.hidden ? '' : undefined}
      ref={(shell) => {
        if (shell === null) {
          return;
        }

        let frame = 0;

        const measure = () => {
          const code = document.getElementById('hero-code');
          const sponsors = document
            .getElementById('sponsors')
            ?.closest('section');
          const header = document.querySelector('[data-site-header]');
          if (!code || !sponsors || !header) {
            return;
          }

          const layout = homeVersionBarLayout({
            code: code.getBoundingClientRect(),
            isLarge: window.matchMedia(largeQuery).matches,
            pillHeight: shell.offsetHeight,
            reducedMotion: window.matchMedia(reducedMotionQuery).matches,
            scrollY: window.scrollY,
            sponsorsTop: sponsors.getBoundingClientRect().top,
            // Sit just under the sticky site header (z-40), never over it.
            stickyTop: header.getBoundingClientRect().bottom + 8,
            viewportWidth: window.innerWidth,
          });

          const next: BarStyle = {
            left: layout.left,
            position: layout.position,
            top: layout.top,
          };
          setStyle((prev) => (sameStyle(prev, next) ? prev : next));
        };

        const onScrollOrResize = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(measure);
        };

        measure();
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize);
        const largeMq = window.matchMedia(largeQuery);
        const motionMq = window.matchMedia(reducedMotionQuery);
        largeMq.addEventListener('change', onScrollOrResize);
        motionMq.addEventListener('change', onScrollOrResize);

        return () => {
          cancelAnimationFrame(frame);
          window.removeEventListener('scroll', onScrollOrResize);
          window.removeEventListener('resize', onScrollOrResize);
          largeMq.removeEventListener('change', onScrollOrResize);
          motionMq.removeEventListener('change', onScrollOrResize);
        };
      }}
      style={style}
    >
      <div
        aria-label="tRPC version for the home page"
        className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/90 p-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/75"
        role="group"
      >
        {allHomeVersions.map((version) => (
          <Link
            activeOptions={{ exact: true, includeSearch: true }}
            className="home-version-link rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-home-version-link={version}
            disabled={!shown}
            key={version}
            replace
            resetScroll={false}
            search={homeVersionSearch(version, shownHomeVersions(shown))}
            to="/"
          >
            {homeVersionLabels[version]}
          </Link>
        ))}
      </div>
    </div>
  );
}
