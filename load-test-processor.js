/**
 * Artillery Load Test Processor for Ectropy Platform
 * Provides custom functions and data for realistic load testing
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Random email generator for construction stakeholders
 */
function randomEmail() {
  const domains = [
    'contractor.com',
    'architect.com', 
    'engineering.com',
    'construction.co',
    'building.org'
  ];
  const roles = [
    'contractor',
    'architect', 
    'engineer',
    'foreman',
    'supervisor',
    'manager',
    'owner'
  ];
  
  const role = roles[Math.floor(Math.random() * roles.length)];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const id = Math.floor(Math.random() * 1000);
  
  return `${role}${id}@${domain}`;
}

/**
 * Random string generator
 */
function randomString(length = 8) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Random integer generator
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random array element selector
 */
function randomFromArray(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Construction-specific data generators
 */
const constructionData = {
  materials: [
    'Steel', 'Concrete', 'Timber', 'Masonry', 'Aluminum', 
    'Glass', 'Insulation', 'Drywall', 'Roofing', 'Flooring'
  ],
  
  ifcTypes: [
    'IfcWall', 'IfcBeam', 'IfcColumn', 'IfcSlab', 'IfcRoof',
    'IfcWindow', 'IfcDoor', 'IfcStair', 'IfcRailing', 'IfcPipe'
  ],
  
  documentTypes: [
    'architectural_drawing', 'structural_plan', 'mep_diagram',
    'specification_sheet', 'safety_protocol', 'building_code',
    'material_datasheet', 'inspection_report'
  ],
  
  stakeholderRoles: [
    'owner', 'architect', 'contractor', 'engineer', 'inspector',
    'supplier', 'consultant', 'project_manager'
  ],
  
  projectPhases: [
    'design', 'planning', 'procurement', 'construction',
    'inspection', 'testing', 'commissioning', 'handover'
  ]
};

/**
 * Performance tracking
 */
const requestMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageResponseTime: 0,
  maxResponseTime: 0,
  minResponseTime: Infinity
};

/**
 * Hook functions for Artillery
 */
function beforeScenario(requestParams, context, ee, next) {
  // Set up scenario context
  context.vars.startTime = Date.now();
  
  // Generate realistic user profile
  context.vars.userProfile = {
    role: randomFromArray(constructionData.stakeholderRoles),
    experience: randomInt(1, 20),
    projectCount: randomInt(1, 50)
  };
  
  return next();
}

function afterScenario(requestParams, response, context, ee, next) {
  // Calculate scenario duration
  const duration = Date.now() - context.vars.startTime;
  
  // Update metrics
  requestMetrics.totalRequests++;
  if (response && response.statusCode >= 200 && response.statusCode < 400) {
    requestMetrics.successfulRequests++;
  } else {
    requestMetrics.failedRequests++;
  }
  
  // Update response time metrics
  if (duration > requestMetrics.maxResponseTime) {
    requestMetrics.maxResponseTime = duration;
  }
  if (duration < requestMetrics.minResponseTime) {
    requestMetrics.minResponseTime = duration;
  }
  
  requestMetrics.averageResponseTime = 
    (requestMetrics.averageResponseTime * (requestMetrics.totalRequests - 1) + duration) / 
    requestMetrics.totalRequests;
  
  return next();
}

function beforeRequest(requestParams, context, ee, next) {
  // Add request timestamp
  requestParams.headers = requestParams.headers || {};
  requestParams.headers['X-Request-Timestamp'] = Date.now().toString();
  
  // Add load test identification
  requestParams.headers['X-Load-Test'] = 'ectropy-enterprise-test';
  
  return next();
}

function afterResponse(requestParams, response, context, ee, next) {
  // Log performance data
  if (response) {
    console.log(`Request: ${requestParams.method} ${requestParams.url} - Status: ${response.statusCode} - Time: ${Date.now() - parseInt(requestParams.headers['X-Request-Timestamp'])}ms`);
  }
  
  return next();
}

/**
 * Custom validation functions
 */
function validateConstructionResponse(response, context, ee, next) {
  if (response.body) {
    try {
      const data = JSON.parse(response.body);
      
      // Validate construction-specific data structures
      if (data.elements && Array.isArray(data.elements)) {
        for (const element of data.elements) {
          if (!element.type || !element.properties) {
            console.warn('Invalid construction element structure:', element);
          }
        }
      }
      
      if (data.stakeholders && Array.isArray(data.stakeholders)) {
        for (const stakeholder of data.stakeholders) {
          if (!constructionData.stakeholderRoles.includes(stakeholder.role)) {
            console.warn('Unknown stakeholder role:', stakeholder.role);
          }
        }
      }
      
    } catch (error) {
      console.error('Failed to parse response JSON:', error);
    }
  }
  
  return next();
}

/**
 * Generate test data files if they don't exist
 */
function setupTestData() {
  const testDataDir = path.join(__dirname, 'test-data');
  
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  
  // Create sample IFC file
  const sampleIfcPath = path.join(testDataDir, 'sample.ifc');
  if (!fs.existsSync(sampleIfcPath)) {
    const sampleIfcContent = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('sample.ifc','2023-12-01T10:00:00',('Load Test'),('Ectropy Platform'),'IFC2x3','','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvhwQpCD4AO00025QrE$V',#2,'Load Test Project','Sample project for load testing',$,$,$,(#9),#5);
#2=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,1577836800);
#3=IFCPERSONANDORGANIZATION(#6,#7,$);
#4=IFCAPPLICATION(#7,'1.0','Ectropy Platform','ECTROPY');
#5=IFCUNITASSIGNMENT((#10,#11,#12,#13,#14,#15,#16,#17,#18));
ENDSEC;
END-ISO-10303-21;`;
    
    fs.writeFileSync(sampleIfcPath, sampleIfcContent);
    console.log('Created sample IFC file for load testing');
  }
  
  // Create sample PDF file
  const samplePdfPath = path.join(testDataDir, 'sample.pdf');
  if (!fs.existsSync(samplePdfPath)) {
    // Create minimal PDF structure
    const pdfContent = Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
  /Font <<
    /F1 4 0 R 
  >>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj

4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Times-Roman
>>
endobj

5 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Load Test Document) Tj
ET
endstream
endobj

xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000079 00000 n 
0000000136 00000 n 
0000000301 00000 n 
0000000380 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
473
%%EOF`);
    
    fs.writeFileSync(samplePdfPath, pdfContent);
    console.log('Created sample PDF file for load testing');
  }
}

// Initialize test data
setupTestData();

// Export functions for Artillery
module.exports = {
  // Template functions
  $randomEmail: randomEmail,
  $randomString: randomString,
  $randomInt: randomInt,
  $randomFromArray: randomFromArray,
  
  // Hook functions
  beforeScenario,
  afterScenario,
  beforeRequest,
  afterResponse,
  
  // Validation functions
  validateConstructionResponse,
  
  // Data generators
  constructionData,
  
  // Metrics access
  getMetrics: () => requestMetrics
};