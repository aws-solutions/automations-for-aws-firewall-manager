#!/bin/bash
for i in $(find $1 -type d \( -name node_modules \) -prune -false -o -name '*.ts');
do
  if ! grep -q Copyright $i
  then
    echo $i
    cat license-header $i >$i.new && mv $i.new $i
  fi
done

