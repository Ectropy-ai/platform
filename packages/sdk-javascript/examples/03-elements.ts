/**
 * Example 3: BIM Elements
 * 
 * This example demonstrates how to:
 * - List BIM elements for a project
 * - Create new structural elements
 * - Update element properties
 * - Delete elements
 */

import { EctropyClient } from '@ectropy/sdk';

async function main() {
  const client = new EctropyClient({
    baseURL: 'https://staging.ectropy.ai',
    apiKey: 'your-access-token',
  });

  try {
    // First, create a project for our elements
    console.log('Creating project...');
    const project = await client.projects.create({
      name: 'Steel Frame Building',
      description: 'Modern steel-frame office building',
      total_budget: 5000000,
    });

    console.log(`Project created: ${project.name} (${project.id})`);

    // Create structural column
    console.log('\nCreating structural column...');
    const column = await client.elements.create(project.id, {
      element_name: 'Column-A1',
      element_type: 'structural_column',
      material: 'Reinforced Concrete',
      dimensions: {
        length: 0.5,
        width: 0.5,
        height: 4.0,
      },
      cost: 5000,
    });

    console.log('Column created:', column.element_name);

    // Create multiple beams
    console.log('\nCreating structural beams...');
    const beamNames = ['B1', 'B2', 'B3'];
    const beams = [];

    for (const name of beamNames) {
      const beam = await client.elements.create(project.id, {
        element_name: `Beam-${name}`,
        element_type: 'structural_beam',
        material: 'Steel I-Beam W18x50',
        dimensions: {
          length: 12.0,
          width: 0.5,
          height: 0.8,
        },
        cost: 3500,
      });
      beams.push(beam);
      console.log(`- Beam created: ${beam.element_name}`);
    }

    // List all elements in the project
    console.log('\nFetching all project elements...');
    const elementList = await client.elements.list(project.id, {
      page: 1,
      limit: 50,
    });

    console.log(`Found ${elementList.pagination.total} elements:`);
    elementList.elements.forEach((el) => {
      console.log(`- ${el.element_name} (${el.element_type}) - $${el.cost?.toLocaleString()}`);
    });

    // Update element status
    console.log('\nUpdating column status...');
    const updatedColumn = await client.elements.update(column.id, {
      status: 'completed',
      cost: 5200, // Updated cost
    });

    console.log('Column updated:');
    console.log('- Status:', updatedColumn.status);
    console.log('- Cost:', `$${updatedColumn.cost?.toLocaleString()}`);

    // Get specific element
    console.log('\nFetching beam details...');
    const beam = await client.elements.get(beams[0].id);
    console.log('Beam details:', {
      name: beam.element_name,
      type: beam.element_type,
      material: beam.material,
      status: beam.status,
    });

    // Calculate total project cost
    const totalCost = elementList.elements.reduce(
      (sum, el) => sum + (el.cost || 0),
      0
    );
    console.log(`\nTotal elements cost: $${totalCost.toLocaleString()}`);

    // Delete an element (uncomment to test)
    // console.log('\nDeleting element...');
    // await client.elements.delete(beams[0].id);
    // console.log('Element deleted successfully!');

  } catch (error: any) {
    console.error('Error:', error.message || error);
    if (error.statusCode) {
      console.error(`Status: ${error.statusCode}`);
    }
  }
}

main();
