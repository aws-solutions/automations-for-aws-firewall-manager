#!/bin/bash
echo "Starting license header addition for directory: $1"
files_found=$(find $1 -type d \( -name node_modules \) -prune -o -name '*.ts' -print)
echo "Found $(echo "$files_found" | wc -l) TypeScript files"
for i in $files_found;
do
  if ! grep -q Copyright $i
  then
    echo "Adding license header to: $i"
    cat license-header $i >$i.new && mv $i.new $i
  fi
done
echo "License header addition completed"

