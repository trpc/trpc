# Tar fixtures

Gzipped archives decoded by `test/encoding/Tar.test.ts`.

- `gnu`, `pax`: GNU tar 1.35, `--format=gnu` (GNU `L`/`K` long names and links,
  base-256 uid) and `--format=pax`, over a tree with long and splittable paths,
  a non-ASCII name, a long symlink target, a hard link and a FIFO:
  `tar --sort=name --mtime=2024-01-02T03:04:05Z --owner=user:3000000 --group=grp:1000 --format=<format> -cf <name>.tar tree`
- `ustar`, `v7`: GNU tar 1.35, `--format=ustar` (prefixed paths) and
  `--format=v7`, with `--owner=0 --group=0 --numeric-owner`.
- `sparse-gnu`, `sparse-pax`: GNU tar 1.35 `--sparse` over a 64 KiB sparse file.
