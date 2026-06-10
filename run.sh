#!/bin/bash

cd function-tests
SCRIPT_NAME=$1.js
echo "Running script: $SCRIPT_NAME"
node --env-file=test.env $SCRIPT_NAME