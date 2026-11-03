import { cn } from '@shared/ui/lib/utils';

import { type CompanyLogo, companyLogos } from './logos.ts';

const symbolId = (logo: CompanyLogo) =>
  `used-by-${logo.name.toLowerCase().replaceAll(/\W/g, '-')}`;

function Logo(props: { readonly logo: CompanyLogo }) {
  const logo = props.logo;
  return (
    <svg
      aria-label={logo.name}
      className="transition-colors duration-300 hover:text-foreground"
      fill="currentColor"
      height={logo.height}
      role="img"
      style={
        logo.nudge === undefined
          ? undefined
          : { translate: `0 ${logo.nudge}px` }
      }
      viewBox={`0 0 ${logo.width} 32`}
      width={Math.round((logo.height * logo.width) / 3.2) / 10}
    >
      <title>{logo.name}</title>
      <use href={`#${symbolId(logo)}`} />
    </svg>
  );
}

/** The marquee scrolls two copies by half its width, so the second takes over seamlessly. */
function LogoList(props: { readonly copy?: boolean }) {
  return (
    <ul
      aria-hidden={props.copy}
      className={cn(
        'flex shrink-0 items-center gap-x-14 pr-14 sm:gap-x-20 sm:pr-20',
        'motion-reduce:w-full motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-8 motion-reduce:pr-0',
        props.copy && 'motion-reduce:hidden',
      )}
    >
      {companyLogos.map((logo) => (
        <li className="flex" key={logo.name}>
          <Logo logo={logo} />
        </li>
      ))}
    </ul>
  );
}

/**
 * trpc.io's "As used by", without links to the companies: their logos in
 * the muted text color, scrolling unless the reader prefers reduced motion.
 */
export function UsedBy() {
  return (
    <section aria-labelledby="used-by" className="border-b py-12">
      <svg aria-hidden="true" className="absolute size-0">
        {companyLogos.map((logo) => (
          <symbol
            id={symbolId(logo)}
            key={logo.name}
            viewBox={`0 0 ${logo.width} 32`}
          >
            {logo.paths.map((d) => (
              <path d={d} key={d} />
            ))}
          </symbol>
        ))}
      </svg>
      <h2
        className="mb-8 px-4 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        id="used-by"
      >
        As used by
      </h2>
      <div className="group/used-by mx-auto max-w-7xl overflow-hidden text-muted-foreground/80 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)] motion-reduce:px-4 motion-reduce:[mask-image:none]">
        <div className="flex w-max animate-used-by group-hover/used-by:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none">
          <LogoList />
          <LogoList copy />
        </div>
      </div>
    </section>
  );
}
