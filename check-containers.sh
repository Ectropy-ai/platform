#!/bin/bash
echo "=== Finding API Gateway Container ==="
ssh root@staging.ectropy.ai "docker ps --format '{{.Names}}' | grep -i api"
