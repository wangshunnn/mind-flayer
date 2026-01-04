#!/bin/bash

PORT=${SIDECAR_PORT:-3737}

# Find and kill process using the port
PID=$(lsof -ti:$PORT 2>/dev/null)

if [ -n "$PID" ]; then
  echo "🧹 Cleaning up process $PID on port $PORT..."
  kill -9 $PID 2>/dev/null
  echo "✅ Port $PORT is now free"
else
  echo "✨ Port $PORT is already free"
fi
