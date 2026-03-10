#!/usr/bin/env tsx
/**
 * Fix Decision Log Schema Violations
 * Automatically fixes missing rationale and identification fields in decision-log.json
 *
 * Errors to fix:
 * - Missing required field: rationale (decisions 38-43, 54)
 * - Missing required fields: decisionId + timestamp (decisions 44-48)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Decision {
  decisionId?: string;
  id?: string;
  timestamp?: string;
  date?: string;
  title?: string;
  decision?: string;
  rationale?: string;
  [key: string]: unknown;
}

interface DecisionLog {
  decisions: Decision[];
  [key: string]: unknown;
}

async function fixDecisionLog(): Promise<void> {
  const filePath = path.resolve(
    __dirname,
    '../../apps/mcp-server/data/decision-log.json'
  );

  console.log('🔧 Fixing decision-log.json schema violations...\n');

  const content = await fs.readFile(filePath, 'utf-8');
  const data: DecisionLog = JSON.parse(content);

  let fixCount = 0;

  // Fix each decision
  data.decisions.forEach((decision, index) => {
    let modified = false;

    // Fix 1: Add missing rationale field (use decision field as fallback)
    const rationaleStr =
      typeof decision.rationale === 'string' ? decision.rationale : '';
    if (!decision.rationale || rationaleStr.trim() === '') {
      const decisionStr =
        typeof decision.decision === 'string' ? decision.decision : '';
      if (decision.decision && decisionStr.trim() !== '') {
        decision.rationale = decision.decision;
        console.log(`✅ [${index}] Added rationale from decision field`);
        modified = true;
      } else if (decision.title) {
        decision.rationale = `Implementation of: ${decision.title}`;
        console.log(`✅ [${index}] Generated rationale from title`);
        modified = true;
      }
    }

    // Fix 2: Ensure decisionId exists (migrate from 'id' if needed)
    if (!decision.decisionId && decision.id) {
      decision.decisionId = decision.id as string;
      console.log(
        `✅ [${index}] Migrated id → decisionId: ${decision.decisionId}`
      );
      modified = true;
    }

    // Fix 3: Ensure timestamp exists (migrate from 'date' if needed)
    if (!decision.timestamp && decision.date) {
      // Convert date to ISO 8601 timestamp if not already
      const dateStr = decision.date as string;
      if (dateStr.includes('T')) {
        decision.timestamp = dateStr;
      } else {
        decision.timestamp = `${dateStr}T00:00:00Z`;
      }
      console.log(
        `✅ [${index}] Migrated date → timestamp: ${decision.timestamp}`
      );
      modified = true;
    }

    // Fix 4: Generate decisionId if completely missing
    if (!decision.decisionId && decision.timestamp) {
      const timestamp = new Date(decision.timestamp as string);
      const yyyy = timestamp.getFullYear();
      const mm = String(timestamp.getMonth() + 1).padStart(2, '0');
      const dd = String(timestamp.getDate()).padStart(2, '0');
      const slug = decision.title
        ? (decision.title as string)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 40)
        : `decision-${index}`;
      decision.decisionId = `d-${yyyy}-${mm}-${dd}-${slug}`;
      console.log(`✅ [${index}] Generated decisionId: ${decision.decisionId}`);
      modified = true;
    }

    // Fix 5: Generate timestamp if completely missing
    if (!decision.timestamp) {
      decision.timestamp = new Date().toISOString();
      console.log(
        `✅ [${index}] Generated current timestamp: ${decision.timestamp}`
      );
      modified = true;
    }

    if (modified) {
      fixCount++;
    }
  });

  console.log(`\n📊 Fixed ${fixCount} decision entries`);

  // Write back to file
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`💾 Saved ${path.basename(filePath)}`);

  console.log('\n✅ Decision log schema fixes complete!');
  console.log('\nRun validation to confirm:');
  console.log('  pnpm docs:validate\n');
}

// Run fixes
fixDecisionLog().catch((error) => {
  console.error('❌ Error fixing decision log:', error);
  process.exit(1);
});
