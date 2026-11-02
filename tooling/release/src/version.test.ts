import { describe, expect, it } from 'vitest';
import {
  bumpVersion,
  canaryVersion,
  isBump,
  packageVersion,
  withVersions,
} from './version.ts';

describe('bumpVersion', () => {
  it('bumps a patch, minor or major', () => {
    expect(bumpVersion('11.22.1', 'patch')).toBe('11.22.2');
    expect(bumpVersion('11.22.1', 'minor')).toBe('11.23.0');
    expect(bumpVersion('11.22.1', 'major')).toBe('12.0.0');
  });

  it('rejects a prerelease', () => {
    expect(() => bumpVersion('11.23.0-alpha', 'patch')).toThrow(
      '11.23.0-alpha is not x.y.z',
    );
  });
});

describe('isBump', () => {
  it('accepts only patch, minor and major', () => {
    expect(isBump('minor')).toBe(true);
    expect(isBump('prerelease')).toBe(false);
  });
});

describe('canaryVersion', () => {
  it('puts the commit count and sha in the prerelease', () => {
    expect(
      canaryVersion({
        version: '11.22.1',
        commits: 42,
        sha: 'd3cd94bdd',
        preid: 'canary',
      }),
    ).toBe('11.22.2-canary.42.gd3cd94bdd');
  });

  it('keeps an all-digit sha a valid prerelease identifier', () => {
    expect(
      canaryVersion({
        version: '11.22.1',
        commits: 1,
        sha: '012345678',
        preid: 'canary',
      }),
    ).toBe('11.22.2-canary.1.g012345678');
  });
});

describe('packageVersion', () => {
  it('keeps @trpc/openapi on its alpha', () => {
    expect(packageVersion('@trpc/openapi', '11.23.0')).toBe('11.23.0-alpha');
    expect(packageVersion('@trpc/server', '11.23.0')).toBe('11.23.0');
  });

  it("leaves a canary's prerelease alone", () => {
    expect(packageVersion('@trpc/openapi', '11.23.1-canary.3.abc')).toBe(
      '11.23.1-canary.3.abc',
    );
  });
});

describe('withVersions', () => {
  it('sets the version and pins the packages released with it', () => {
    const versions = new Map([
      ['@trpc/client', '11.23.0'],
      ['@trpc/server', '11.23.0'],
    ]);
    expect(
      withVersions(
        {
          name: '@trpc/client',
          version: '11.22.1',
          devDependencies: { '@trpc/server': '11.22.1', vitest: '^5.0.0' },
          peerDependencies: { '@trpc/server': '11.22.1', typescript: '>=5' },
        },
        versions,
      ),
    ).toEqual({
      name: '@trpc/client',
      version: '11.23.0',
      devDependencies: { '@trpc/server': '11.23.0', vitest: '^5.0.0' },
      peerDependencies: { '@trpc/server': '11.23.0', typescript: '>=5' },
    });
  });
});
