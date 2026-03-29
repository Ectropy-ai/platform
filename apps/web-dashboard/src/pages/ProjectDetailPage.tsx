/**
 * Project Detail Page
 * Minimal stub: name, status, budget, "Open in BIM Viewer" button.
 * URL-addressable at /projects/:id
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link,
} from '@mui/material';
import { ArrowBack, ViewInAr } from '@mui/icons-material';
import { apiService } from '../services/api';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  budget?: number;
}

const statusColor = (status: string): 'default' | 'success' | 'warning' | 'info' | 'error' => {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'success';
    case 'planning':
      return 'info';
    case 'on_hold':
      return 'warning';
    case 'completed':
      return 'default';
    default:
      return 'default';
  }
};

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiService
      .getProjectById(id)
      .then((p: Project | null) => {
        if (p) setProject(p);
        else setError('Project not found');
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load project'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Box display='flex' justifyContent='center' alignItems='center' sx={{ minHeight: '60vh' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error || !project) {
    return (
      <Container maxWidth='md' sx={{ mt: 4 }}>
        <Alert severity='error'>{error || 'Project not found'}</Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/projects')} sx={{ mt: 2 }}>
          Back to Projects
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth='md' sx={{ mt: 4, mb: 4 }}>
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link
          underline='hover'
          color='inherit'
          sx={{ cursor: 'pointer' }}
          onClick={() => navigate('/projects')}
        >
          Projects
        </Link>
        <Typography color='text.primary'>{project.name}</Typography>
      </Breadcrumbs>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Box display='flex' justifyContent='space-between' alignItems='center'>
              <Typography variant='h4' component='h1'>
                {project.name}
              </Typography>
              <Chip label={project.status} color={statusColor(project.status)} />
            </Box>

            {project.description && (
              <Typography variant='body1' color='text.secondary'>
                {project.description}
              </Typography>
            )}

            {project.budget != null && (
              <Typography variant='h6'>
                Budget: ${project.budget.toLocaleString()}
              </Typography>
            )}

            <Box sx={{ pt: 2 }}>
              <Button
                variant='contained'
                startIcon={<ViewInAr />}
                onClick={() => navigate(`/projects/${id}`)}
                size='large'
              >
                Open in BIM Viewer
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
};

export default ProjectDetailPage;
