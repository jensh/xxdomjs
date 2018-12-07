#!/bin/bash
#
# Copyright (c) 2018 Jens Hauke. All rights reserved.
#
# 2018-12-07 Jens Hauke <jens@4k2.de>
#

[ -f "package.json" ] || { echo "Missing package.json. Are you in the rootfolder of your package?" ; exit 1; }

set -x
mkdir -p dist

cat > dist/xx.min.js <<EOF
/*!
 * xxdom $(git describe) https://github.com/jensh/xxdomjs
 * (c) 2018-$(date +%Y) Jens Hauke <jens@4k2.de>
 * Released under the MIT License.
 */
EOF
minify src/xx.js >> dist/xx.min.js
cp src/xx.js dist/xx.js

# Local Variables:
#  compile-command: "cd .. && scripts/build.sh"
# End:
