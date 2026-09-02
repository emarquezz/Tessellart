#!/bin/zsh
# SPDX-License-Identifier: GPL-3.0-only
cd "$(dirname "$0")" || exit 1
echo "tessellart"
echo "Opening http://localhost:8006"
(sleep 1; open "http://localhost:8006") &
echo "The local server keeps running until you press Control-C."
python3 -m http.server 8006
