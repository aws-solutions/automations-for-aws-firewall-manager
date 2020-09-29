#!/bin/bash
for i in $(find ./open-source/source -type d \( -name node_modules \) -prune -false -o -name '*.ts'); 
do
  if ! grep -q Copyright $i
  then
    cat license-header $i >$i.new && mv $i.new $i
  fi
done

