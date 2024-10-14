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

[[ $1 == 'update' ]] && {
    update="true"
    echo "UPDATE MODE: CDK Snapshots will be updated. CDK UNIT TESTS WILL BE SKIPPED"
} || update="false"

echo "------------------------------------------------------------------------------"
echo "[Pre-Test] build binaries"
echo "------------------------------------------------------------------------------"
cd $source_dir/utilsLayer
npm run build:all

cd $source_dir/preReqManager
npm run build:all

cd $source_dir/policyManager
npm run build:all

cd $source_dir/complianceGenerator
npm run build:all

cd $source_dir/helper
npm run build:all

cd $source_dir/shieldAutomations/shieldLayer
npm run build:all

cd $source_dir/shieldAutomations/configEvalManager
npm run build:all

cd $source_dir/shieldAutomations/configRemediateManager
npm run build:all

echo "------------------------------------------------------------------------------"
echo "[Test] Resources"
echo "------------------------------------------------------------------------------"
cd $resource_dir
[[ $update == "true" ]] && {
    npm run test -- -u
} || {
    npm run test
    rc=$?
    if [ "$rc" -ne "0" ]; then
        echo "** UNIT TESTS FAILED **"
    else
        echo "Unit Tests Successful"
    fi
    if [ "$rc" -gt "$maxrc" ]; then
        maxrc=$rc
    fi
}

echo "------------------------------------------------------------------------------"
echo "[Test] utilsLayer"
echo "------------------------------------------------------------------------------"
cd $source_dir/utilsLayer
npm run test
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
echo "[Test] helper"
echo "------------------------------------------------------------------------------"
cd $source_dir/helper
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] shieldAutomations configEvalManager"
echo "------------------------------------------------------------------------------"
cd $source_dir/shieldAutomations/configEvalManager
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] shieldAutomations configRemediateManager"
echo "------------------------------------------------------------------------------"
cd $source_dir/shieldAutomations/configRemediateManager
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

echo "------------------------------------------------------------------------------"
echo "[Test] shieldAutomations shieldLayer"
echo "------------------------------------------------------------------------------"
cd $source_dir/shieldAutomations/shieldLayer
npm run test
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi