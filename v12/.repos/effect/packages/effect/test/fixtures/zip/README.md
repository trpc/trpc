# Zip fixtures

Archives decoded by `test/encoding/Zip.test.ts`, written with `TZ=UTC` from a
tree with a directory, a compressible file, an empty file, a non-ASCII name and
an executable script, all with an mtime of 2024-01-02T03:04:06Z.

- `infozip`: Info-ZIP Zip 3.0, `zip -r infozip.zip tree` (sizes in local
  headers, extended timestamps, Unix UID/GID fields, UTF-8 flag).
- `infozip-stream`: Info-ZIP Zip 3.0,
  `zip -r - tree -x tree/empty.txt | cat > infozip-stream.zip` (data
  descriptors). The empty file is left out because Info-ZIP streams it as a
  stored entry without a size, which `decode` rejects.
- `7zip`: 7-Zip 17.05, `7z a -tzip 7zip.zip tree` (UTF-8 flag; local headers
  have no extra fields, so times come from DOS dates).
- `python-zip64`: Python 3.11 `zipfile` writing deflated entries to a
  non-seekable stream, with `force_zip64=True` for `tree/dir/hello.txt` (ZIP64
  local fields and data descriptor) and not for `tree/script.sh`.
