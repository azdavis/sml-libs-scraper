#!/bin/sh

set -eu

npm run build
node out/main.js
