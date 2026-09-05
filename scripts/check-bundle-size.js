#!/usr/bin/env node
/**
 * Bundle size check script for CI gate.
 * Fails if any JS chunk exceeds the configured size limit (default 500KB gzipped).
 */
const fs = require("fs");
const path = require("path");
const { gzipSync } = require("zlib");

const DIST_DIR = path.resolve("frontend/dist");
const MAX_CHUNK_SIZE = parseInt(process.env.MAX_CHUNK_SIZE || "500000", 10); // 500KB default

function getFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".js") || entry.name.endsWith(".css"))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkBundleSize() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error("Dist directory not found. Run build first.");
    process.exit(1);
  }

  const files = getFiles(DIST_DIR);
  let hasError = false;

  console.log(`\nChecking bundle sizes (limit: ${MAX_CHUNK_SIZE / 1000}KB gzipped)\n`);

  for (const file of files) {
    const content = fs.readFileSync(file);
    const gzipped = gzipSync(content);
    const sizeKB = (gzipped.length / 1024).toFixed(1);
    const relPath = path.relative(DIST_DIR, file);

    const status = gzipped.length > MAX_CHUNK_SIZE ? "EXCEEDS LIMIT" : "ok";
    if (gzipped.length > MAX_CHUNK_SIZE) hasError = true;

    console.log(`${status} ${relPath}: ${sizeKB}KB gzipped (${content.length} bytes raw)`);
  }

  if (hasError) {
    console.log("\nBundle size check FAILED - one or more chunks exceed the limit");
    process.exit(1);
  }

  console.log("\nAll bundle chunks within size limits");
}

checkBundleSize();
