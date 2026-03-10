/**
 * BIM Model Catalog Seed Data
 *
 * Seeds standard model types, classifications, and metadata schemas for BIM collaboration.
 * Foundation data required before project-specific model uploads.
 *
 * @module prisma/seed-model-catalog
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Standard BIM Model Types
 * Industry-standard model classifications for construction projects
 */
const modelTypes = [
  {
    id: 'architectural',
    name: 'Architectural',
    description:
      'Architectural design models including building envelope, layout, and spatial design',
    category: 'design',
    fileFormats: ['ifc', 'rvt', 'dwg'],
    commonDisciplines: ['Architecture', 'Interior Design'],
    urn: 'urn:luhtech:ectropy:model-type:architectural',
  },
  {
    id: 'structural',
    name: 'Structural',
    description:
      'Structural engineering models including framing, foundations, and load-bearing systems',
    category: 'design',
    fileFormats: ['ifc', 'rvt', 'saf'],
    commonDisciplines: ['Structural Engineering'],
    urn: 'urn:luhtech:ectropy:model-type:structural',
  },
  {
    id: 'mechanical',
    name: 'Mechanical (HVAC)',
    description:
      'Mechanical systems including heating, ventilation, and air conditioning',
    category: 'mep',
    fileFormats: ['ifc', 'rvt'],
    commonDisciplines: ['Mechanical Engineering', 'HVAC'],
    urn: 'urn:luhtech:ectropy:model-type:mechanical',
  },
  {
    id: 'electrical',
    name: 'Electrical',
    description:
      'Electrical systems including power distribution, lighting, and fire alarm',
    category: 'mep',
    fileFormats: ['ifc', 'rvt'],
    commonDisciplines: ['Electrical Engineering'],
    urn: 'urn:luhtech:ectropy:model-type:electrical',
  },
  {
    id: 'plumbing',
    name: 'Plumbing',
    description:
      'Plumbing systems including water supply, drainage, and sanitary fixtures',
    category: 'mep',
    fileFormats: ['ifc', 'rvt'],
    commonDisciplines: ['Plumbing Engineering'],
    urn: 'urn:luhtech:ectropy:model-type:plumbing',
  },
  {
    id: 'fire-protection',
    name: 'Fire Protection',
    description:
      'Fire protection systems including sprinklers, standpipes, and fire suppression',
    category: 'mep',
    fileFormats: ['ifc', 'rvt'],
    commonDisciplines: ['Fire Protection Engineering'],
    urn: 'urn:luhtech:ectropy:model-type:fire-protection',
  },
  {
    id: 'site',
    name: 'Site / Civil',
    description:
      'Site development and civil engineering including grading, utilities, and landscaping',
    category: 'civil',
    fileFormats: ['ifc', 'dwg', 'c3d'],
    commonDisciplines: ['Civil Engineering', 'Landscape Architecture'],
    urn: 'urn:luhtech:ectropy:model-type:site',
  },
  {
    id: 'coordination',
    name: 'Coordination Model',
    description:
      'Federated coordination model combining multiple disciplines for clash detection',
    category: 'coordination',
    fileFormats: ['ifc', 'nwd'],
    commonDisciplines: ['General Contractor', 'BIM Manager'],
    urn: 'urn:luhtech:ectropy:model-type:coordination',
  },
  {
    id: 'as-built',
    name: 'As-Built',
    description:
      'As-built record models capturing final constructed conditions',
    category: 'record',
    fileFormats: ['ifc', 'rvt', 'rcp'],
    commonDisciplines: ['General Contractor', 'Commissioning Agent'],
    urn: 'urn:luhtech:ectropy:model-type:as-built',
  },
  {
    id: 'fabrication',
    name: 'Fabrication',
    description:
      'Detailed fabrication models for shop drawings and manufacturing',
    category: 'fabrication',
    fileFormats: ['ifc', 'fab', 'dwg'],
    commonDisciplines: ['Fabricator', 'MEP Contractor'],
    urn: 'urn:luhtech:ectropy:model-type:fabrication',
  },
];

/**
 * Standard Model Classifications
 * Based on Uniformat and CSI MasterFormat standards
 */
const modelClassifications = [
  {
    code: 'A',
    name: 'Substructure',
    description: 'Foundations, basements, and below-grade structures',
    standard: 'Uniformat',
  },
  {
    code: 'B',
    name: 'Shell',
    description: 'Superstructure, exterior enclosure, and roofing',
    standard: 'Uniformat',
  },
  {
    code: 'C',
    name: 'Interiors',
    description:
      'Interior construction including partitions, doors, and finishes',
    standard: 'Uniformat',
  },
  {
    code: 'D',
    name: 'Services',
    description:
      'Conveying, plumbing, HVAC, fire protection, and electrical systems',
    standard: 'Uniformat',
  },
  {
    code: 'E',
    name: 'Equipment & Furnishings',
    description: 'Equipment, furnishings, and special construction',
    standard: 'Uniformat',
  },
  {
    code: 'F',
    name: 'Special Construction',
    description: 'Special construction and demolition',
    standard: 'Uniformat',
  },
  {
    code: 'G',
    name: 'Building Sitework',
    description: 'Site development, landscaping, and utilities',
    standard: 'Uniformat',
  },
];

/**
 * IFC Metadata Schemas
 * Standard IFC property sets for model validation
 */
const ifcSchemas = [
  {
    name: 'Pset_BuildingCommon',
    description: 'Common properties for building elements',
    version: 'IFC4',
    properties: [
      {
        name: 'Reference',
        type: 'IfcIdentifier',
        description: 'Reference designation',
      },
      {
        name: 'BuildingID',
        type: 'IfcIdentifier',
        description: 'Building identification',
      },
      {
        name: 'ConstructionMethod',
        type: 'IfcLabel',
        description: 'Construction method used',
      },
      {
        name: 'FireRating',
        type: 'IfcLabel',
        description: 'Fire resistance rating',
      },
    ],
  },
  {
    name: 'Pset_SpaceCommon',
    description: 'Common properties for space elements',
    version: 'IFC4',
    properties: [
      {
        name: 'Reference',
        type: 'IfcIdentifier',
        description: 'Space reference designation',
      },
      {
        name: 'PubliclyAccessible',
        type: 'IfcBoolean',
        description: 'Public accessibility indicator',
      },
      {
        name: 'GrossFloorArea',
        type: 'IfcAreaMeasure',
        description: 'Gross floor area',
      },
      {
        name: 'NetFloorArea',
        type: 'IfcAreaMeasure',
        description: 'Net floor area',
      },
    ],
  },
  {
    name: 'Pset_WallCommon',
    description: 'Common properties for wall elements',
    version: 'IFC4',
    properties: [
      {
        name: 'Reference',
        type: 'IfcIdentifier',
        description: 'Wall reference designation',
      },
      {
        name: 'LoadBearing',
        type: 'IfcBoolean',
        description: 'Load-bearing indicator',
      },
      {
        name: 'FireRating',
        type: 'IfcLabel',
        description: 'Fire resistance rating',
      },
      {
        name: 'ThermalTransmittance',
        type: 'IfcThermalTransmittanceMeasure',
        description: 'U-value',
      },
    ],
  },
];

/**
 * Main seed function
 */
async function main() {
  console.log('Starting BIM Model Catalog seed...');

  // Note: Actual implementation would need model_types, model_classifications, and ifc_schemas tables
  // These are placeholder structures for the catalog foundation
  // In production, these would be stored in dedicated tables or JSON metadata

  console.log(`Model Types: ${modelTypes.length} standard types defined`);
  console.log(
    `Classifications: ${modelClassifications.length} Uniformat divisions`
  );
  console.log(`IFC Schemas: ${ifcSchemas.length} property set templates`);

  console.log('BIM Model Catalog seed complete!');
  console.log(
    'Note: Catalog data stored as reference metadata (not in database tables yet)'
  );
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { modelTypes, modelClassifications, ifcSchemas };
