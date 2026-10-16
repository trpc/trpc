#!/usr/bin/env bash

# This script spawns child processes and then exits early
echo "Parent process started with PID $$"

# Spawn multiple child processes that will outlive the parent
for i in {1..3}; do
  (
    # Child process
    child_pid=$BASHPID
    echo "Child $i started with PID $child_pid"

    # Spawn a grandchild that runs for a long time
    (
      grandchild_pid=$BASHPID
      echo "Grandchild of child $i started with PID $grandchild_pid"
      # Keep running for 30 seconds with a marker for process assertions
      sh -c 'sleep 30; :' parent-exits-early-grandchild
    ) &

    # Keep the child running with a marker for process assertions
    sh -c 'sleep 30; :' parent-exits-early-child
  ) &
done

# Give children time to start
sleep 0.5

# Exit early (simulating a crash or early termination)
echo "Parent exiting early with status 1..."
exit 1
