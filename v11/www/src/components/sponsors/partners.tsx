import { cn } from '@shared/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import type { CSSProperties } from 'react';

import { avatarUrl, type Partner, partners, sponsorTiers } from '~/sponsors.ts';

import { partnerLogos } from './partner-logos.tsx';

/** The partner's logo, or for one without a drawn logo their avatar and name. */
export function PartnerLogo(props: {
  readonly className?: string;
  readonly partner: Partner;
}) {
  const Logo = partnerLogos[props.partner.login];
  if (Logo !== undefined) {
    return <Logo className={props.className} />;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-semibold',
        props.className,
      )}
    >
      <img
        alt=""
        className="aspect-square h-full rounded-full"
        src={avatarUrl(props.partner, 64)}
      />
      {props.partner.name}
    </span>
  );
}

const accentOf = (partner: Partner) =>
  ({ '--accent': partner.accent }) as CSSProperties;

const label =
  'text-xs font-semibold tracking-wide text-muted-foreground uppercase';

/** The partners as cards, a row per tier, for the home page's sponsors section. */
export function PartnerCards() {
  return (
    <div className="grid gap-8">
      {sponsorTiers.map((entry) => {
        const inTier = partners.filter(
          (partner) => partner.tier === entry.tier,
        );
        return inTier.length === 0 ? null : (
          <PartnerCardRow
            key={entry.tier}
            partners={inTier}
            title={`${entry.label} partners`}
          />
        );
      })}
    </div>
  );
}

function PartnerCardRow(props: {
  readonly partners: ReadonlyArray<Partner>;
  readonly title: string;
}) {
  return (
    <div className="grid gap-3">
      <p className={label}>{props.title}</p>
      <ul className="grid gap-4 md:grid-cols-3">
        {props.partners.map((partner) => (
          <li key={partner.login}>
            <a
              className="group relative grid h-full content-between gap-6 overflow-hidden rounded-xl border bg-card p-6 transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-0.5 hover:border-(--accent)/50 hover:shadow-[0_12px_40px_-12px_var(--accent)]"
              href={partner.link}
              rel="sponsored noopener"
              style={accentOf(partner)}
              target="_blank"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-(--accent) opacity-[0.07] blur-3xl transition-opacity duration-300 group-hover:opacity-25"
              />
              <PartnerLogo className="relative h-8 w-auto" partner={partner} />
              <span className="relative grid gap-3">
                <span className="text-sm text-pretty text-muted-foreground">
                  {partner.blurb}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  {partner.domain}
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The partners beside a docs page, under "On this page". */
export function PartnersRail(props: { readonly className?: string }) {
  return (
    <section
      aria-label="Partners"
      className={cn('grid gap-2', props.className)}
    >
      <p className={cn(label, 'mb-1')}>Partners</p>
      {partners.map((partner) => (
        <a
          className="group relative flex h-14 items-center justify-center overflow-hidden rounded-lg border bg-card px-4 text-foreground/80 transition-colors hover:border-(--accent)/50 hover:text-foreground"
          href={partner.link}
          key={partner.login}
          rel="sponsored noopener"
          style={accentOf(partner)}
          target="_blank"
          title={partner.blurb}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,var(--accent),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-15"
          />
          <PartnerLogo
            className="relative h-6 w-auto max-w-full"
            partner={partner}
          />
        </a>
      ))}
      <Link
        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
        to="/sponsor"
      >
        Become a partner →
      </Link>
    </section>
  );
}

/** The partners at the end of a docs page, for screens without the side column. */
export function PartnersStrip(props: { readonly className?: string }) {
  return (
    <section
      aria-label="Partners"
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-card/50 px-4 py-3',
        props.className,
      )}
    >
      <p className={label}>Partners</p>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {partners.map((partner) => (
          <li key={partner.login}>
            <a
              className="block text-foreground/70 transition-colors hover:text-foreground"
              href={partner.link}
              rel="sponsored noopener"
              target="_blank"
              title={partner.blurb}
            >
              <PartnerLogo className="h-4 w-auto" partner={partner} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
