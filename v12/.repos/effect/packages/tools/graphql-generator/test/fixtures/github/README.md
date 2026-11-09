# GitHub GraphQL schema subset

`schema.graphql` is a subset of GitHub's public GraphQL schema, cut from `schema.docs.graphql` in [github/docs](https://github.com/github/docs) (`src/graphql/data/fpt/schema.docs.graphql`) at commit `b93d24a586415cb392f05738d2092cf4887510c5`. It keeps the types, fields and arguments that `documents/*.graphql` select, every enum and input object the generated code emits, one unselected member of each union and interface the documents reach, and the upstream descriptions. When a document starts selecting something new, copy the definition from upstream at the same commit.

The tests generate the GitHub set from this subset at run time instead of committing the output. `Generator.runtime*.test.ts` import the generated modules, and `Generator.snapshots.test.ts` typechecks them with `tsc`.

## Documents

`documents/*.graphql` are the generator's input. `documents/scalars.ts` holds the codecs the test config maps `DateTime`, `URI` and `GitObjectID` to (see `githubConfig` in `test/utils/generator.ts`).

## Operations

`operations/*.graphql` are hand-written executable documents used by the printer round-trip tests.

## License

`schema.docs.graphql` is distributed by GitHub under the MIT License (`LICENSE-CODE` in github/docs, "Copyright 2026 GitHub"):

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
