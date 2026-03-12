/**
 * Projects List Page
 * Main dashboard showing all user's projects with ability to create new ones
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Grid,
  Button,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import {
  ProjectCreationDialog,
  ProjectCard,
  ProjectMembersDialog,
} from '../components/ProjectManagement';
import { apiService } from '../services/api';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  location?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  userRole?: string;
  permissions?: string[];
  elementCount?: number;
  created_at?: string;
}

const ProjectsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [membersDialogState, setMembersDialogState] = useState<{
    open: boolean;
    projectId: string;
    projectName: string;
  }>({
    open: false,
    projectId: '',
    projectName: '',
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const projectList = await apiService.getProjects();
      setProjects(projectList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectCreated = (newProject: Project) => {
    setProjects([newProject, ...projects]);
  };

  const handleSelectProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleMembersClick = (project: Project) => {
    setMembersDialogState({
      open: true,
      projectId: project.id,
      projectName: project.name,
    });
  };

  // Projects list
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1">
          My Projects
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateDialogOpen(true)}
        >
          New Project
        </Button>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" sx={{ py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Empty State */}
      {!loading && projects.length === 0 && (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          sx={{ py: 8 }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No projects yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first project to get started with BIM collaboration
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create First Project
          </Button>
        </Box>
      )}

      {/* Projects Grid */}
      {!loading && projects.length > 0 && (
        <Grid container spacing={3}>
          {projects.map((project) => (
            <Grid item xs={12} sm={6} md={4} key={project.id}>
              <ProjectCard
                project={project}
                onSelect={() => handleSelectProject(project.id)}
                onMembersClick={
                  project.permissions?.includes('admin')
                    ? () => handleMembersClick(project)
                    : undefined
                }
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Dialogs */}
      <ProjectCreationDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onProjectCreated={handleProjectCreated}
      />

      <ProjectMembersDialog
        open={membersDialogState.open}
        onClose={() =>
          setMembersDialogState({ open: false, projectId: '', projectName: '' })
        }
        projectId={membersDialogState.projectId}
        projectName={membersDialogState.projectName}
        canManageMembers={true}
      />
    </Container>
  );
};

export default ProjectsListPage;
