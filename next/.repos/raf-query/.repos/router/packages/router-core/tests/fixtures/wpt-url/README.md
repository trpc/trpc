# Pinned Web Platform Tests URL cases

The two upstream JSON files are complete, unmodified copies from Web Platform Tests revision
[`6cfafc4c0801279aa10df8e85f8799d98b8000ab`](https://github.com/web-platform-tests/wpt/commit/6cfafc4c0801279aa10df8e85f8799d98b8000ab):

- [`url/resources/urltestdata.json`](https://github.com/web-platform-tests/wpt/blob/6cfafc4c0801279aa10df8e85f8799d98b8000ab/url/resources/urltestdata.json)
- [`url/resources/urltestdata-javascript-only.json`](https://github.com/web-platform-tests/wpt/blob/6cfafc4c0801279aa10df8e85f8799d98b8000ab/url/resources/urltestdata-javascript-only.json)

Every one of the 893 cases in `urltestdata.json` and the single case in
`urltestdata-javascript-only.json` is tested, including all parsing failures.
The test skips only string comment entries. SHA-256 checks ensure the upstream
files remain byte-for-byte unchanged. The JavaScript-only file includes unpaired
surrogates, so the tests load the upstream files with `JSON.parse`, bypassing the
bundler's JSON transform.

The upstream [format documentation](https://github.com/web-platform-tests/wpt/blob/6cfafc4c0801279aa10df8e85f8799d98b8000ab/url/README.md)
describes complete URL parsing. These tests exercise Router's prefix helpers
using native `URL` to derive expectations:

- For the explicit scheme, parse the input through its first colon followed by
  a fixed valid body (`//example.com`), without a base. Native `URL` validates and
  normalizes the scheme even when the original body is malformed; relative
  prefixes fail to parse. Also check WPT's recorded `protocol` when the input has
  an explicit scheme and WPT supplies that field.
- For inputs without an explicit scheme, resolve against two HTTPS bases with
  different hosts. Matching resulting hostnames identify a protocol-relative
  input. Ordinary relative paths inherit the different base hosts. Four literal
  inputs (`//`, `///`, `////`, and `//C|/foo/bar`) need explicit expectations
  because they have no valid HTTP(S) host.

The [test](../../url-standard.test.ts) contains the source hashes and those four
exceptions. There are no per-index annotations to maintain. Case indices in test
names are positions in the original arrays, including string comment entries.

Router's allowlist and blanket protocol-relative rejection are application
policy. The tests apply the default, empty, and custom allowlists. They use
HTTP(S) [relative URL behavior](https://url.spec.whatwg.org/#relative-state)
even when an upstream case has a different base scheme, since the helpers have
no base parameter. Neither production helper calculates an expected result.

To update the fixtures, copy both complete files from a new upstream commit and
update the SHA-256 hashes in the test and the revision links here. Keep both
files in upstream format and preserve the [license](./LICENSE.md). Run the core
unit and type tests and lint. If a new scheme-less input cannot be parsed against
HTTPS, review it and add an explicit expectation instead of skipping it.
Tests read only committed files and make no network requests.
