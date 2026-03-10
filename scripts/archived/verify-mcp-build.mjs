#!/usr/bin/env node
/**
 * MCP Server Build Verification Script
 * ES Module compatible build verification for MCP server
 */

import fs from 'fs';
import path from 'path';

const buildDir = "dist/apps/mcp-server";
const serverFile = path.resolve("dist/apps/mcp-server/server.js");
const packageJsonFile = path.resolve("dist/apps/mcp-server/package.json");

try {
  // Check build directory exists
  if (!fs.existsSync(buildDir)) {
    console.error("❌ Build directory not found:", buildDir);
    process.exit(1);
  }

  // Check server file exists
  if (!fs.existsSync(serverFile)) {
    console.error("❌ Server file not found:", serverFile);
    process.exit(1);
  }

  // Check package.json exists
  if (!fs.existsSync(packageJsonFile)) {
    console.error("❌ Package.json not found:", packageJsonFile);
    process.exit(1);
  }

  // Verify server file is not empty
  const serverJs = fs.readFileSync(serverFile, "utf8");
  if (serverJs.length < 100) {
    console.error("❌ Server file appears empty or truncated");
    process.exit(1);
  }

  // Verify package.json has correct module type
  const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, "utf8"));
  if (packageJson.type !== "commonjs") {
    console.error("❌ Package.json does not specify CommonJS module type");
    process.exit(1);
  }

  console.log("✅ MCP server build verified successfully");
  console.log("   - Server file size:", serverJs.length, "bytes");
  console.log("   - Module type:", packageJson.type);
  console.log("   - Entry point:", packageJson.main);
} catch (error) {
  console.error("❌ Server file verification failed:", error.message);
  process.exit(1);
}