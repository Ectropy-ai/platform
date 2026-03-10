#!/usr/bin/env tsx
/**
 * Fix JSON Schema Compliance Script
 * Automatically fixes JSON files to align with enterprise schema standards
 * Prevents pattern drift by enforcing consistent field names
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RoadmapPhase {
  id?: string;
  phaseId?: string;
  name: string;
  [key: string]: unknown;
}

interface Roadmap {
  roadmapId?: string;
  type?: string;
  version: string;
  metadata?: {
    title?: string;
    description?: string;
    maintainer?: string;
  };
  phases?: RoadmapPhase[];
  currentPhase?: string;
  [key: string]: unknown;
}

interface InfrastructureCatalog {
  documentId?: string;
  version: string;
  metadata: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Fix roadmap JSON to align with enterprise schema
 */
async function fixRoadmapJSON(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  console.log(`\n🔧 Fixing ${fileName}...`);

  const content = await fs.readFile(filePath, 'utf-8');
  const data: Roadmap = JSON.parse(content);

  let modified = false;

  // Add missing roadmapId
  if (!data.roadmapId) {
    data.roadmapId = fileName.replace('.json', '');
    console.log(`   ✅ Added roadmapId: ${data.roadmapId}`);
    modified = true;
  }

  // Add missing type
  if (!data.type) {
    if (fileName.includes('platform')) {
      data.type = 'platform';
    } else if (fileName.includes('business')) {
      data.type = 'business';
    } else {
      data.type = 'product';
    }
    console.log(`   ✅ Added type: ${data.type}`);
    modified = true;
  }

  // Add missing metadata
  if (!data.metadata) {
    const titleMap: Record<string, string> = {
      'roadmap-platform': 'Ectropy Platform Technical Roadmap',
      'roadmap-business': 'Ectropy Business Roadmap',
    };

    data.metadata = {
      title: titleMap[data.roadmapId] || 'Ectropy Roadmap',
      description: `${data.type} roadmap for Ectropy Construction Intelligence Platform`,
      maintainer: `${data.type}-team`,
    };
    console.log(`   ✅ Added metadata`);
    modified = true;
  }

  // Fix phases: add phaseId if missing (based on existing id field)
  if (data.phases && Array.isArray(data.phases)) {
    data.phases.forEach((phase, index) => {
      if (!phase.phaseId && phase.id) {
        phase.phaseId = phase.id;
        console.log(`   ✅ Added phaseId to phase[${index}]: ${phase.phaseId}`);
        modified = true;
      }
    });
  }

  // Verify currentPhase exists in phases array
  if (data.phases && data.currentPhase && data.currentPhase !== '') {
    const phaseIds = data.phases.map(p => p.phaseId || p.id);
    if (!phaseIds.includes(data.currentPhase)) {
      console.log(`   ⚠️  Warning: currentPhase "${data.currentPhase}" not found in phases`);
      console.log(`   Available phases: ${phaseIds.join(', ')}`);
    }
  }

  if (modified) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(`   💾 Saved ${fileName}`);
  } else {
    console.log(`   ℹ️  No changes needed`);
  }
}

/**
 * Fix infrastructure catalog JSON
 */
async function fixInfrastructureCatalogJSON(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  console.log(`\n🔧 Fixing ${fileName}...`);

  const content = await fs.readFile(filePath, 'utf-8');
  const data: InfrastructureCatalog = JSON.parse(content);

  let modified = false;

  // Add missing documentId
  if (!data.documentId) {
    data.documentId = 'infrastructure-catalog';
    console.log(`   ✅ Added documentId: ${data.documentId}`);
    modified = true;
  }

  if (modified) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(`   💾 Saved ${fileName}`);
  } else {
    console.log(`   ℹ️  No changes needed`);
  }
}

/**
 * Main function
 */
async function fixAllSchemas(): Promise<void> {
  const dataDir = path.resolve(__dirname, '../../apps/mcp-server/data');

  console.log('🔍 Fixing JSON schema compliance issues...');
  console.log(`📁 Directory: ${dataDir}\n`);
  console.log('='.repeat(50));

  try {
    // Fix roadmap files
    const roadmapFiles = ['roadmap-platform.json', 'roadmap-business.json'];
    for (const file of roadmapFiles) {
      const filePath = path.join(dataDir, file);
      try {
        await fixRoadmapJSON(filePath);
      } catch (error) {
        console.error(`❌ Error fixing ${file}:`, error);
      }
    }

    // Fix infrastructure catalog
    const catalogFile = 'infrastructure-catalog.json';
    const catalogPath = path.join(dataDir, catalogFile);
    try {
      await fixInfrastructureCatalogJSON(catalogPath);
    } catch (error) {
      console.error(`❌ Error fixing ${catalogFile}:`, error);
    }

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Schema fixes complete!');
    console.log('\nRun validation to confirm:');
    console.log('  pnpm tsx scripts/docs/validate-json-schemas.ts\n');
  } catch (error) {
    console.error('❌ Error during schema fixing:', error);
    process.exit(1);
  }
}

// Run fixes
fixAllSchemas();
