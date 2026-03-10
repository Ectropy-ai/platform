/**
 * Project Management Components
 * Provides UI for creating and managing construction projects
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Stack,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Person,
  PersonAdd,
  Business,
  Engineering,
  Construction,
  Architecture,
} from '@mui/icons-material';
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

interface ProjectMember {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  organization?: string;
  role: string;
  permissions: string[];
  votingPower: number;
  joinedAt: string;
}

interface ProjectCreationDialogProps {
  open: boolean;
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
}

export const ProjectCreationDialog: React.FC<ProjectCreationDialogProps> = ({
  open,
  onClose,
  onProjectCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const newProject = await apiService.createProject({
        name,
        description: description || '',
        status: 'planning',
        stakeholders: [],
      });
      onProjectCreated(newProject);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setLocation('');
    setBudget('');
    setStartDate('');
    setEndDate('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Create New Project</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              label="Project Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              placeholder="e.g., Downtown Office Complex"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Brief description of the project..."
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              fullWidth
              placeholder="City, State"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Budget (USD)"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              fullWidth
              type="number"
              placeholder="1000000"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Start Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              fullWidth
              type="date"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Expected Completion"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              fullWidth
              type="date"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!name || loading}
        >
          {loading ? 'Creating...' : 'Create Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface ProjectMembersDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  canManageMembers: boolean;
}

export const ProjectMembersDialog: React.FC<ProjectMembersDialogProps> = ({
  open,
  onClose,
  projectId,
  projectName,
  canManageMembers,
}) => {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('contractor');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      fetchMembers();
    }
  }, [open, projectId]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: newMemberEmail,
          role: newMemberRole,
          permissions: ['read'],
          votingPower: 1,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add member');
      }

      const newMember = await response.json();
      setMembers([...members, newMember]);
      setAddMemberOpen(false);
      setNewMemberEmail('');
      setNewMemberRole('contractor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setMembers(members.filter((m) => m.id !== memberId));
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Business />;
      case 'architect':
        return <Architecture />;
      case 'engineer':
        return <Engineering />;
      case 'contractor':
        return <Construction />;
      default:
        return <Person />;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Project Members: {projectName}</Typography>
          {canManageMembers && (
            <Button
              startIcon={<PersonAdd />}
              onClick={() => setAddMemberOpen(true)}
              variant="contained"
              size="small"
            >
              Add Member
            </Button>
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Typography>Loading members...</Typography>
        ) : (
          <List>
            {members.map((member) => (
              <ListItem
                key={member.id}
                secondaryAction={
                  canManageMembers && member.role !== 'owner' ? (
                    <IconButton
                      edge="end"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <Delete />
                    </IconButton>
                  ) : null
                }
              >
                <ListItemAvatar>
                  <Avatar src={member.avatar}>
                    {getRoleIcon(member.role)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      {member.name}
                      <Chip
                        label={member.role}
                        size="small"
                        color={member.role === 'owner' ? 'primary' : 'default'}
                      />
                    </Box>
                  }
                  secondary={
                    <>
                      {member.email}
                      {member.organization && ` • ${member.organization}`}
                      {` • Voting Power: ${member.votingPower}`}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}

        <Dialog open={addMemberOpen} onClose={() => setAddMemberOpen(false)}>
          <DialogTitle>Add Project Member</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Email Address"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                fullWidth
                type="email"
                placeholder="member@company.com"
              />
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  label="Role"
                >
                  <MenuItem value="architect">Architect</MenuItem>
                  <MenuItem value="engineer">Engineer</MenuItem>
                  <MenuItem value="contractor">Contractor</MenuItem>
                  <MenuItem value="consultant">Consultant</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAddMember}
              variant="contained"
              disabled={!newMemberEmail}
            >
              Add Member
            </Button>
          </DialogActions>
        </Dialog>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

interface ProjectCardProps {
  project: Project;
  onSelect: () => void;
  onMembersClick?: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onSelect,
  onMembersClick,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'planning':
        return 'info';
      case 'completed':
        return 'default';
      case 'on_hold':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
          <Typography variant="h6" component="div">
            {project.name}
          </Typography>
          <Chip
            label={project.status}
            size="small"
            color={getStatusColor(project.status) as any}
          />
        </Box>

        {project.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {project.description.substring(0, 100)}
            {project.description.length > 100 ? '...' : ''}
          </Typography>
        )}

        <Stack spacing={1} sx={{ mb: 2 }}>
          {project.location && (
            <Typography variant="body2">📍 {project.location}</Typography>
          )}
          {project.budget && (
            <Typography variant="body2">
              💰 ${project.budget.toLocaleString()}
            </Typography>
          )}
          {project.elementCount !== undefined && (
            <Typography variant="body2">
              🏗️ {project.elementCount} elements
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            fullWidth
            onClick={onSelect}
          >
            Open Project
          </Button>
          {onMembersClick && (
            <Tooltip title="Manage Members">
              <IconButton onClick={onMembersClick} color="primary">
                <Person />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};
