/**
 * Example 2: Project Management
 * 
 * This example demonstrates how to:
 * - List projects with pagination
 * - Create a new construction project
 * - Update project details
 * - Delete a project
 */

import { EctropyClient } from '@ectropy/sdk';

async function main() {
  const client = new EctropyClient({
    baseURL: 'https://staging.ectropy.ai',
    apiKey: 'your-access-token', // Use token from login
  });

  try {
    // List all projects
    console.log('Fetching projects...');
    const projectList = await client.projects.list({
      page: 1,
      limit: 10,
    });

    console.log(`Found ${projectList.pagination.total} projects`);
    projectList.projects.forEach((project) => {
      console.log(`- ${project.name} (${project.status})`);
    });

    // Create a new project
    console.log('\nCreating new project...');
    const newProject = await client.projects.create({
      name: 'Downtown Office Complex',
      description: '25-story mixed-use development with retail and office space',
      total_budget: 15000000,
      location: '123 Main Street, New York, NY 10001',
      start_date: '2025-03-01',
      end_date: '2027-06-30',
    });

    console.log('Project created successfully!');
    console.log('Project ID:', newProject.id);
    console.log('Project Name:', newProject.name);
    console.log('Budget:', `$${newProject.total_budget?.toLocaleString()}`);

    // Get project details
    console.log('\nFetching project details...');
    const project = await client.projects.get(newProject.id);
    console.log('Project:', {
      name: project.name,
      status: project.status,
      location: project.location,
      created: new Date(project.created_at).toLocaleDateString(),
    });

    // Update project
    console.log('\nUpdating project status...');
    const updatedProject = await client.projects.update(newProject.id, {
      status: 'in_progress',
      total_budget: 16000000, // Increase budget
    });

    console.log('Project updated successfully!');
    console.log('New status:', updatedProject.status);
    console.log('New budget:', `$${updatedProject.total_budget?.toLocaleString()}`);

    // Filter projects by status
    console.log('\nFetching in-progress projects...');
    const activeProjects = await client.projects.list({
      status: 'in_progress',
      limit: 5,
    });

    console.log(`Found ${activeProjects.pagination.total} active projects`);

    // Delete project (uncomment to test)
    // console.log('\nDeleting project...');
    // await client.projects.delete(newProject.id);
    // console.log('Project deleted successfully!');

  } catch (error: any) {
    console.error('Error:', error.message || error);
    if (error.statusCode) {
      console.error(`Status: ${error.statusCode}`);
    }
  }
}

main();
