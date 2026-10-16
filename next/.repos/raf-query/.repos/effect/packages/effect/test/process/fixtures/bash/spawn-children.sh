#!/usr/bin/env bash

# This script spawns child processes to test process group cleanup
echo "Parent process started with PID $$"

# Spawn multiple child processes
for i in {1..3}; do
  (
    # Child process
    child_pid=$BASHPID
    echo "Child $i started with PID $child_pid"

    # Spawn a grandchild that runs for a long time
    (
      grandchild_pid=$BASHPID
      echo "Grandchild of child $i started with PID $grandchild_pid"
      # Keep running for 60 seconds
      for _ in {1..60}; do
        sleep 1
      done
    ) &

    # Keep the child running
    for _ in {1..60}; do
      sleep 1
    done
  ) &
done

# Keep the parent running
echo "Parent process waiting..."
wait
