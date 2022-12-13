#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./run-unit-tests.sh
#
# set -e
# set -o pipefail
[ "$DEBUG" == 'true' ] && set -x
set -e
# Get reference for all important folders
template_dir="$PWD"
resource_dir="$template_dir/../source/resources"
source_dir="$template_dir/../source/services"

echo "------------------------------------------------------------------------------"
echo "[Pre-Test] build binaries"
echo "------------------------------------------------------------------------------"
cd $source_dir/preReqManager
npm run build:all

cd $source_dir/policyManager
npm run build:all

cd $source_dir/complianceGenerator
npm run build:all

cd $source_dir/helper
npm run build:all

cd $source_dir/metricsManager
npm run build:all

echo "------------------------------------------------------------------------------"
echo "[Test] Resources"
echo "------------------------------------------------------------------------------"
cd $resource_dir
npm run test -- -u
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] pre-req-manager"
echo "------------------------------------------------------------------------------"
cd $source_dir/preReqManager
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] policy-manager"
echo "------------------------------------------------------------------------------"
cd $source_dir/policyManager
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] complianceGenerator"
echo "------------------------------------------------------------------------------"
cd $source_dir/complianceGenerator
if [[ $(npm run test) = "1" ]]; then
	echo "(source/run-all-tests.sh) ERROR: compliance generator there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] metrics-manager"
echo "------------------------------------------------------------------------------"
cd $source_dir/metricsManager
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] helper"
echo "------------------------------------------------------------------------------"
cd $source_dir/helper
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi