#!/bin/bash
#
# Copyright (c) 2018 Jens Hauke. All rights reserved.
#
# 2018-12-07 Jens Hauke <jens@4k2.de>
#

[ -f "package.json" ] || { echo "Missing package.json. Are you in the rootfolder of your package?" ; exit 1; }

set -ex
mkdir -p dist
cd dist

git clone .. xxdom || :
cd xxdom
git pull

npm run build

#
# Bug? Even with --dry-run, npm publish DOES publish!
#echo 'Continue with "npm publish --dry-run"? Enter "y"'
#read yes
#[ "$yes" = 'y' ] || exit 1
#
#npm publish --dry-run

echo 'Continue with "npm publish"? Enter "y"'
read yes
[ "$yes" = 'y' ] || exit 1

npm publish


# Local Variables:
#  compile-command: "cd .. && scripts/publish.sh"
# End:
