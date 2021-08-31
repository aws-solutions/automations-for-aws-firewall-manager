#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./run-unit-tests.sh
#

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

echo "------------------------------------------------------------------------------"
echo "[Test] pre-req-manager"
echo "------------------------------------------------------------------------------"
cd $source_dir/preReqManager
npm run test

echo "------------------------------------------------------------------------------"
echo "[Test] policy-manager"
echo "------------------------------------------------------------------------------"
cd $source_dir/policyManager
npm run test