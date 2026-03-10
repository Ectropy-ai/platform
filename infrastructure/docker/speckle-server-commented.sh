#!/bin/bash

# =============================================================================
# SPECKLE SERVER MANAGEMENT SCRIPT
# =============================================================================
# 
# STATUS: ✅ COMPLETE - Ready for Phase 3 Demo
# LAST UPDATED: July 8, 2025
# 
# PURPOSE:
# This script manages the self-hosted Speckle server infrastructure for the
# Ectropy federated construction platform. It handles Docker container 
# orchestration, health monitoring, and service management.
# 
# CAPABILITIES:
# - ✅ Start/stop/restart Speckle server stack
# - ✅ Health monitoring for all services
# - ✅ Integrated PostgreSQL and Redis
# - ✅ Frontend and backend coordination
# - ✅ Comprehensive logging and troubleshooting
# 
# DEMO INTEGRATION:
# - Supports architect, engineer, contractor, owner workflows
# - Enables real-time collaborative BIM editing
# - Provides federated dashboard data synchronization
# 
# USAGE EXAMPLES:
# ./speckle-server.sh start    # Start all services
# ./speckle-server.sh status   # Check service health
# ./speckle-server.sh logs     # View recent logs
# ./speckle-server.sh cleanup  # Reset all data (destructive)
# 
# SERVICE ENDPOINTS:
# - Speckle Server: http://localhost:3000
# - Speckle Frontend: http://localhost:8080
# - Preview Service: http://localhost:3001
# - PostgreSQL: localhost:5433
# - Redis: localhost:6379
# 
# TOMORROW'S TASKS:
# 1. Run './speckle-server.sh start' to begin demo setup
# 2. Verify all services are healthy
# 3. Create demo user account for stakeholder workflows
# 4. Test integration with BIM demo pipeline
# 
# TECHNICAL NOTES:
# - Uses Docker Compose for service orchestration
# - Includes health checks and automatic recovery
# - Supports both development and production configurations
# - Integrated with our existing PostgreSQL database
# =============================================================================

# Speckle Server Management Script
# This script helps manage Speckle server for BIM integration demos

# ...existing code...
