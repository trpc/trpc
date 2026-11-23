import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { blogPosts, readingMinutes } from './blog-content.ts';

const post = (fields: string) =>
  `---\n${fields}\nauthors: [{"name":"KATT"}]\ndescription: "About it."\n---\n\nHello.\n`;

describe('blogPosts', () => {
  it.effect(
    'lists the posts newest first, by their file names, without the README',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(
          path.join(dir, 'older.md'),
          post('title: "Older"\ndate: "2021-05-05"'),
        );
        yield* fs.writeFileString(
          path.join(dir, 'newer.md'),
          post('title: "Newer"\ndate: "2025-03-21"\ndiscussion: 6622'),
        );
        yield* fs.writeFileString(path.join(dir, 'README.md'), '# The blog\n');
        expect(yield* blogPosts(dir)).toEqual([
          {
            authors: [{ name: 'KATT' }],
            date: '2025-03-21',
            description: 'About it.',
            discussion: 6622,
            readingMinutes: 1,
            slug: 'newer',
            title: 'Newer',
          },
          {
            authors: [{ name: 'KATT' }],
            date: '2021-05-05',
            description: 'About it.',
            discussion: undefined,
            readingMinutes: 1,
            slug: 'older',
            title: 'Older',
          },
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect('rejects a post without a date', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(dir, 'a.md'), post('title: "A"'));
      const error = yield* Effect.flip(blogPosts(dir));
      expect(error.message).toContain('a.md: invalid frontmatter');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe('readingMinutes', () => {
  it('reads 200 words a minute, and at least one', () => {
    expect(readingMinutes('word '.repeat(10))).toBe(1);
    expect(readingMinutes('word '.repeat(1000))).toBe(5);
  });
});
