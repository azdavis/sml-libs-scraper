#!/bin/sh

set -eu

npm run build
mkdir -p html
node out/main.js
