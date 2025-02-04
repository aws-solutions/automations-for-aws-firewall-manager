#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# solution_env.sh should be updated with the correct SolutionID, Solution Name, and Solution Trademarked Name
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./build-s3-dist.sh -b bucket-name -v version-code
#
# Arguments:
#  - -b: Name for the s3 bucket location. Templates will be in [bucket]-reference and lambda code will be in [bucket]-[region_name]
#  - -v: version for the package
#  - -n: solution name for s3 bucket folder
#
#  e.g.
#  ./build-s3-dist.sh -b my-solution-bucket -v v1.0.0 -n solution-name
#  Templates will be in my-solution-bucket-reference and lambda code will be in my-solution-bucket-[region_name]

[ "$DEBUG" == 'true' ] && set -x
set -e # exit on error, so that the pipeline stage fails

header() {
    declare text=$1
    echo "------------------------------------------------------------------------------"
    echo "$text"
    echo "------------------------------------------------------------------------------"
}

usage() {
    echo "Usage: $0 -b <bucket> [-v <version>] [-t]"
    echo "Bucket and Version must be provided via a parameter. Others are optional."
    echo "-n is used to set the folder name used for the solution within -b, usually this is the solution trademarked name"
    echo "-t indicates this is a pre-prod build and instructs the build to use a non-prod Solution ID, DEV-SOxxxx"
    echo "Production example: ./build-s3-dist.sh -b solutions -v v1.0.0 -n solution-name"
    echo "Dev example: ./build-s3-dist.sh -b solutions -v v1.0.0 -t"
}


main() {
  template_dir="$PWD"
  staging_dist_dir="$template_dir/staging"
  template_dist_dir="$template_dir/global-s3-assets"
  build_dist_dir="$template_dir/regional-s3-assets"
  resource_dir="$template_dir/../source/resources"
  source_dir="$template_dir/../source/services"

  while getopts ":b:v:n:tch" opt;
  do
      case "${opt}" in
          b) local bucket=${OPTARG};;
          v) local version=${OPTARG};;
          n) local solution_name=${OPTARG};;
          t) devtest=1;;
          c) clean "${clean_dirs[@]}" && exit 0;;
          *) usage && exit 0;;
      esac
  done

  if [[ -z "$version" ]]; then
      usage && exit 1
  fi

  # Prepend version with "v" if it does not already start with "v"
  if [[ $version != v* ]]; then
      version=v"$version"
  fi

  echo "export DIST_OUTPUT_BUCKET=$bucket" > "$template_dir"/setenv.sh
  echo "export DIST_VERSION=$version" >> "$template_dir"/setenv.sh

  source "$template_dir"/solution_env.sh

  if [[ -z "$solution_name" ]] && [[ -z "$SOLUTION_TRADEMARKEDNAME" ]]; then
    echo "solution name must be set in solution_env.sh or provided using -n" && exit 1
  fi

  if [[ -z "$SOLUTION_ID" ]] || [[ -z "$SOLUTION_NAME" ]]; then
      echo "Missing SOLUTION_ID or SOLUTION_NAME from solution_env.sh" && exit 1
  fi

  if [[ ! -z $devtest ]]; then
      SOLUTION_ID=DEV-$SOLUTION_ID
  fi

  export SOLUTION_ID
  export SOLUTION_NAME
  export SOLUTION_TRADEMARKEDNAME

  echo "export DIST_SOLUTION_NAME=${solution_name:-$SOLUTION_TRADEMARKEDNAME}" >> ./setenv.sh

  echo $DIST_SOLUTION_NAME

  echo $SOLUTION_TRADEMARKEDNAME
  echo $solution_name

  source "$template_dir"/setenv.sh

  header "[Init] Remove any old dist files from previous runs"
  echo "rm -rf $template_dist_dir"
  rm -rf $template_dist_dir
  echo "mkdir -p $template_dist_dir"
  mkdir -p $template_dist_dir
  echo "rm -rf $build_dist_dir"
  rm -rf $build_dist_dir
  echo "mkdir -p $build_dist_dir"
  mkdir -p $build_dist_dir
  echo "rm -rf $staging_dist_dir"
  rm -rf $staging_dist_dir
  echo "mkdir -p $staging_dist_dir"
  mkdir -p $staging_dist_dir

  header "[Build] Build typescript microservices"
  echo "cd $template_dir/../"
  cd $template_dir/../
  npm run build


  header "[Init] Install dependencies for the cdk-solution-helper"
  echo "cd $template_dir/cdk-solution-helper"
  cd $template_dir/cdk-solution-helper
  echo "npm install"
  npm install
  npm run build

  header "[Synth] CDK Project"
  # Install the global aws-cdk package
  echo "cd $resource_dir"
  cd $resource_dir
  echo "npm i"
  npm i

  # Run 'cdk synth' to generate raw solution outputs
  echo "./node_modules/aws-cdk/bin/cdk synth --output=$staging_dist_dir"
  ./node_modules/aws-cdk/bin/cdk synth --output=$staging_dist_dir

  # Remove unnecessary output files
  echo "cd $staging_dist_dir"
  cd $staging_dist_dir
  echo "rm tree.json manifest.json cdk.out"
  rm tree.json manifest.json cdk.out

  header "[Packing] Templates"
  # Move outputs from staging to template_dist_dir
  echo "Move outputs from staging to template_dist_dir"
  echo "cp $staging_dist_dir/*.template.json $template_dist_dir/"
  cp $staging_dist_dir/*.template.json $template_dist_dir/
  rm *.template.json

  # Move policy_manifest to template_dist_dir
  cp $resource_dir/lib/policy_manifest.json $build_dist_dir/

  # Rename all *.template.json files to *.template
  echo "Rename all *.template.json to *.template"
  echo "copy templates and rename"
  for f in $template_dist_dir/*.template.json;
  do
    if [[ $f == *"CommonResourceStack.template.json"* ]]
    then
      mv "$f" "$template_dist_dir/aws-fms-automations.template"
    elif [[ $f == *"ComplianceGeneratorStack"* ]]
    then
      mv "$f" "$template_dist_dir/aws-fms-compliance.template"
    elif [[ $f == *"ProactiveEventResponseStack"* ]]
    then
      mv "$f" "$template_dist_dir/aws-fms-proactive-event-response.template"
    elif [[ $f == *"CommonResourceStackPolicy"* ]]
    then
      mv "$f" "$template_dist_dir/aws-fms-policy.template"
    elif [[ $f == *"PreReqStack"* ]]
    then
      mv "$f" "$template_dist_dir/aws-fms-prereq.template"
    elif [[ $f == *"ShieldAutomationsPrereqStack"* ]]
    then
      mv "$f" "$template_dist_dir/aws-fms-shield-automations-prereq.template"
    elif [[ $f == *"ShieldAutomationsStack"* ]]
    then
      mv "$f" "$template_dist_dir/aws-fms-shield-automations.template"
    else
    mv "$f" "$template_dist_dir/aws-fms-demo.template"
    fi
  done

  # Run the helper to clean-up the templates and remove unnecessary CDK elements
  echo "Run the helper to clean-up the templates and remove unnecessary CDK elements"
  echo "node $template_dir/cdk-solution-helper/build/index"
  node $template_dir/cdk-solution-helper/build/index
  if [ "$?" = "1" ]; then
    echo "(cdk-solution-helper) ERROR: there is likely output above." 1>&2
    exit 1
  fi

  # clean-up temp build files
  cd $template_dir/cdk-solution-helper
  rm -rf ./build

  DIST_TEMPLATE_OUTPUT_BUCKET="$DIST_OUTPUT_BUCKET-reference"

  # Find and replace bucket_name, solution_name, and version
  if [[ "$OSTYPE" == "darwin"* ]]; then
      # Mac OS
      echo "Updating variables in template with $DIST_OUTPUT_BUCKET"
      replace="s/%%BUCKET_NAME%%/$DIST_OUTPUT_BUCKET/g"
      echo "sed -i '' -e $replace $template_dist_dir/*.template"
      sed -i '' -e $replace $template_dist_dir/*.template
      replace="s/%%TEMPLATE_BUCKET%%/$DIST_TEMPLATE_OUTPUT_BUCKET/g"
      echo "sed -i '' -e $replace $template_dist_dir/*.template"
      sed -i '' -e $replace $template_dist_dir/*.template
      replace="s/%%SOLUTION_NAME%%/$DIST_SOLUTION_NAME/g"
      echo "sed -i '' -e $replace $template_dist_dir/*.template"
      sed -i '' -e $replace $template_dist_dir/*.template
      replace="s/%%VERSION%%/$DIST_VERSION/g"
      echo "sed -i '' -e $replace $template_dist_dir/*.template"
      sed -i '' -e $replace $template_dist_dir/*.template
  else
      # Other linux
      echo "Updating variables in template with $DIST_OUTPUT_BUCKET"
      replace="s/%%BUCKET_NAME%%/$DIST_OUTPUT_BUCKET/g"
      echo "sed -i -e $replace $template_dist_dir/*.template"
      sed -i -e $replace $template_dist_dir/*.template
      replace="s/%%TEMPLATE_BUCKET%%/$DIST_TEMPLATE_OUTPUT_BUCKET/g"
      echo "sed -i -e $replace $template_dist_dir/*.template"
      sed -i -e $replace $template_dist_dir/*.template
      replace="s/%%SOLUTION_NAME%%/$DIST_SOLUTION_NAME/g"
      echo "sed -i -e $replace $template_dist_dir/*.template"
      sed -i -e $replace $template_dist_dir/*.template
      replace="s/%%VERSION%%/$DIST_VERSION/g"
      echo "sed -i -e $replace $template_dist_dir/*.template"
      sed -i -e $replace $template_dist_dir/*.template
  fi

  header "[Packing] Lambdas"
  # General cleanup of node_modules and package-lock.json files
  echo "find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null"
  find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null
  echo "find $staging_dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null"
  find $staging_dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null

  # ... For each asset.* source code artifact in the temporary /staging folder...
  cd $staging_dist_dir
  for i in `find . -mindepth 1 -maxdepth 1 -type f \( -iname "*.zip" \) -or -type d`; do

      # Rename the artifact, removing the period for handler compatibility
      pfname="$(basename -- $i)"
      fname="$(echo $pfname | sed -e 's/\.//')"
      mv $i $fname

      if [[ $fname != *".zip" ]]
      then
          # Zip the artifact
          echo "zip -rj $fname.zip $fname/*"
          zip -rj $fname.zip $fname
      fi

  # ... repeat until all source code artifacts are zipped
  done

  # Copy the zipped artifact from /staging to /regional-s3-assets
  echo "cp -R *.zip $build_dist_dir"
  cp -R *.zip $build_dist_dir

  # Remove the old, unzipped artifact from /staging
  echo "rm -rf *.zip"
  rm -rf *.zip

  header "[Cleanup] Remove temporary files"
  # Delete the temporary /staging folder
  echo "rm -rf $staging_dist_dir"
  rm -rf $staging_dist_dir
}

main "$@"