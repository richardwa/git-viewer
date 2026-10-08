#!/bin/sh
# Build steps run inside the build container (see Containerfile.build).
# Emits the artifact to $OUTPUT:
#   server/server-bundle.min.js   the server, deps bundled in (run with bun/node)
#   server/dist/                  client bundle served by the server bundle
#   server.zip                    the server/ folder as one downloadable file
#   build-daemon.ts               the build daemon (single file, node builtins
#                                 only — no deps, so no bundling needed)
set -e
: "${OUTPUT:?OUTPUT must be set to the artifact output dir}"

mkdir -p "$OUTPUT/server"
bunx tsc
bun run build:server
cp build/server/server-bundle.min.js "$OUTPUT/server/server-bundle.min.js"
bun --bun x vite build --outDir "$OUTPUT/server/dist" --emptyOutDir
cp "$OUTPUT/build.properties" "$OUTPUT/server/dist/build.properties"
cp scripts/build-daemon.ts "$OUTPUT/build-daemon.ts"
cd "$OUTPUT" && zip -qr server.zip server
