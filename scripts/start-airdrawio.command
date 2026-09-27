#!/bin/zsh

script_directory=${0:A:h}
cd "$script_directory/.." || exit 1
exec npm run dev
