#!/bin/bash

# install dependencies
direnv allow
corepack install
pnpm install

# setup repositories
git clone --depth 1 https://github.com/tstyche/tstyche.org.git .repos/tstyche.org

cp .agents/AGENTS.md AGENTS.md.tmp

cat << EOF >> AGENTS.md.tmp

## Learning about "effect" v3

If you need to learn more about the old version of effect (version 3.x), you can
access the "v3" branch.

## Learning about the "tstyche" testing framework

If you need to learn more about the "tstyche" testing framework, you can access
the website repository here:

\`.repos/tstyche.org\`
EOF

mv AGENTS.md.tmp AGENTS.md
