#!/bin/bash
# Load environment variables from backend/.env and start the server
if [ ! -f .env ]; then
  echo "Missing backend/.env. Create it from ../.env.example first."
  exit 1
fi

set -a
source .env
set +a

node server.js
