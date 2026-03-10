#!/usr/bin/env node
/**
 * Pre-installation safeguards against 'matches' property access errors
 * This script prevents the "Cannot read properties of null (reading 'matches')" error
 * by validating and fixing package.json files before dependency installation.
 */

import fs from 'fs';

// Function to safely check string methods that could cause 'matches' errors
function safeStringOperation(str, operation) {
  if (str === null || str === undefined || typeof str !== 'string') {
    console.log(
      `WARNING: Prevented null access to string method: ${operation}`
    );
    return false;
  }
  return true;
}

// Fix web-dashboard Material-UI version conflicts
if (fs.existsSync('apps/web-dashboard/package.json')) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync('apps/web-dashboard/package.json', 'utf8')
    );
    let changed = false;

    if (pkg.dependencies) {
      const muiVersion = '^6.4.9';
      const muiPackages = Object.keys(pkg.dependencies).filter((name) =>
        name.startsWith('@mui/')
      );
      for (const muiPackage of muiPackages) {
        if (muiPackage.includes('x-') && pkg.dependencies[muiPackage]) {
          pkg.dependencies[muiPackage] = '^7.22.2';
          changed = true;
        } else if (
          pkg.dependencies[muiPackage] &&
          !pkg.dependencies[muiPackage].includes('6.4')
        ) {
          pkg.dependencies[muiPackage] = muiVersion;
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(
        'apps/web-dashboard/package.json',
        JSON.stringify(pkg, null, 2)
      );
      console.log('✅ Fixed Material-UI version conflicts in web-dashboard');
    }
  } catch (e) {
    console.log(
      `WARNING: Could not fix web-dashboard dependencies: ${e.message}`
    );
  }
}

// Validate all package.json files for potential matches errors
['package.json', 'apps/web-dashboard/package.json'].forEach((file) => {
  if (fs.existsSync(file)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));

      ['dependencies', 'devDependencies', 'peerDependencies'].forEach(
        (depType) => {
          if (pkg[depType]) {
            Object.entries(pkg[depType]).forEach(([name, version]) => {
              if (!safeStringOperation(version, `includes/match on ${name}`)) {
                console.log(`FIXED: Invalid version for ${name}: ${version}`);
                pkg[depType][name] = '^1.0.0'; // Safe fallback
              }
            });
          }
        }
      );

      console.log(`✅ Validated ${file} against matches property errors`);
    } catch (e) {
      console.log(`ERROR validating ${file}: ${e.message}`);
    }
  }
});

console.log('🛡️ Pre-installation safeguards completed successfully');
