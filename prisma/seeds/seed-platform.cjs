// Seed script for Platform database model_catalog
// Called by docker-entrypoint.sh after prisma db push
// Uses @prisma/client-platform (already generated in Docker build)

const { PrismaClient } = require('@prisma/client-platform');

const CATALOG_ENTRIES = [
  {
    buildingType: 'residential-single-family',
    displayName: 'Single Family Home',
    description: '2-story residential house with modern architecture',
    ifcFilePath: 'test-data/AC20-FZK-Haus.ifc',
    metadata: { floors: 2, bedrooms: 4, bathrooms: 3, square_feet: 2500 },
    estimatedBudgetUsd: 850000.0,
  },
  {
    buildingType: 'residential-multi-family',
    displayName: 'Multi-Family Housing',
    description: 'Duplex or apartment building for multi-family living',
    ifcFilePath: 'test-data/DupleXXX.ifc',
    metadata: { units: 4, floors: 2, parking_spaces: 8 },
    estimatedBudgetUsd: 1800000.0,
  },
  {
    buildingType: 'commercial-office',
    displayName: 'Office Building',
    description: 'Multi-floor commercial office space',
    ifcFilePath: 'test-data/AC20-Institute-Var-2.ifc',
    metadata: {
      floors: 3,
      total_office_space_sqft: 15000,
      parking_spaces: 50,
    },
    estimatedBudgetUsd: 2500000.0,
  },
  {
    buildingType: 'commercial-large',
    displayName: 'Large Commercial Facility',
    description:
      'Specialized large-scale facility (clinic, hospital, industrial)',
    ifcFilePath: 'test-data/Clinic_Dental_IFC.ifc',
    metadata: { type: 'healthcare', exam_rooms: 12, waiting_areas: 3 },
    estimatedBudgetUsd: 8000000.0,
  },
];

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.PLATFORM_DATABASE_URL } },
  });

  try {
    for (const entry of CATALOG_ENTRIES) {
      await prisma.modelCatalog.upsert({
        where: { buildingType: entry.buildingType },
        create: entry,
        update: {}, // Don't overwrite existing data
      });
    }
    console.log(
      `Platform seed complete: ${CATALOG_ENTRIES.length} catalog entries`
    );
  } catch (error) {
    console.error('Platform seed error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
