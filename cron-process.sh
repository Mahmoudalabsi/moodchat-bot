#!/bin/bash
cd /home/z/my-project
export $(grep -v '^#' .env | xargs)
node process-pending.js >> /home/z/my-project/cron-worker.log 2>&1
