import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  FormControlLabel,
  Fab,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  FileCopy,
  Visibility,
  Settings,
  Category,
  Schedule,
  Assessment,
  Business,
  Security,
  Close,
} from '@mui/icons-material';
import { Template, TemplateField, User } from '../../types/stakeholders';

interface TemplateManagerProps {
  templates: Template[];
  currentUser: User;
  onCreateTemplate: (template: Omit<Template, 'id' | 'createdAt' | 'usageCount'>) => void;
  onUpdateTemplate: (templateId: string, updates: Partial<Template>) => void;
  onDeleteTemplate: (templateId: string) => void;
  onDuplicateTemplate: (templateId: string) => void;
  onUseTemplate: (templateId: string) => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  currentUser,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  onUseTemplate,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  type FormDataType = {
    name: string;
    description: string;
    category: Template['category'];
    fields: TemplateField[];
  };

  const [formData, setFormData] = useState<FormDataType>({
    name: '',
    description: '',
    category: 'design' as Template['category'],
    fields: [] as TemplateField[],
  });

  const categories = [
    { value: 'all', label: 'All Categories', icon: <Category /> },
    { value: 'design', label: 'Design', icon: <Assessment /> },
    { value: 'budget', label: 'Budget', icon: <Business /> },
    { value: 'timeline', label: 'Timeline', icon: <Schedule /> },
    { value: 'governance', label: 'Governance', icon: <Security /> },
    { value: 'safety', label: 'Safety', icon: <Security /> },
  ];

  const fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'multiselect', label: 'Multi-select' },
    { value: 'file', label: 'File Upload' },
  ];

  const filteredTemplates =
    selectedCategory === 'all' ? templates : templates.filter(t => t.category === selectedCategory);

  const handleOpenDialog = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        description: template.description,
        category: template.category,
        fields: [...template.fields],
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        description: '',
        category: 'design',
        fields: [],
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
  };

  const handleSaveTemplate = () => {
    if (!formData.name.trim()) {
      return;
    }

    const templateData = {
      ...formData,
      createdBy: currentUser,
    };

    if (editingTemplate) {
      onUpdateTemplate(editingTemplate.id, templateData);
    } else {
      onCreateTemplate(templateData);
    }

    handleCloseDialog();
  };

  const handleAddField = () => {
    const newField: TemplateField = {
      id: `field_${Date.now()}`,
      name: '',
      type: 'text',
      required: false,
    };
    setFormData((prev: FormDataType) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
  };

  const handleUpdateField = (index: number, updates: Partial<TemplateField>) => {
    setFormData((prev: FormDataType) => ({
      ...prev,
      fields: prev.fields.map((field: TemplateField, i: number) =>
        i === index ? { ...field, ...updates } : field,
      ),
    }));
  };

  const handleRemoveField = (index: number) => {
    setFormData((prev: FormDataType) => ({
      ...prev,
      fields: prev.fields.filter((_: TemplateField, i: number) => i !== index),
    }));
  };

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category);
    return cat?.icon || <Category />;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'design':
        return 'primary';
      case 'budget':
        return 'success';
      case 'timeline':
        return 'warning';
      case 'governance':
        return 'error';
      case 'safety':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      {/* Header */}
      <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 3 }}>
        <Typography variant='h5'>Proposal Templates</Typography>
        <Fab color='primary' size='medium' onClick={() => handleOpenDialog()} sx={{ ml: 2 }}>
          <Add />
        </Fab>
      </Stack>

      {/* Category Filter */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant='subtitle1' gutterBottom>
          Filter by Category
        </Typography>
        <Stack direction='row' spacing={1} flexWrap='wrap'>
          {categories.map(category => (
            <Chip
              key={category.value}
              icon={category.icon}
              label={category.label}
              onClick={() => setSelectedCategory(category.value)}
              color={selectedCategory === category.value ? 'primary' : 'default'}
              variant={selectedCategory === category.value ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      </Paper>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant='h6' color='text.secondary' gutterBottom>
            No templates found
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            {selectedCategory === 'all'
              ? 'Create your first proposal template to get started.'
              : `No templates found in the ${selectedCategory} category.`}
          </Typography>
          <Button variant='contained' onClick={() => handleOpenDialog()}>
            Create Template
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredTemplates.map(template => (
            <Grid item xs={12} md={6} lg={4} key={template.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1 }}>
                  <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 2 }}>
                    {getCategoryIcon(template.category)}
                    <Chip
                      label={template.category.replace('_', ' ')}
                      size='small'
                      color={getCategoryColor(template.category) as any}
                    />
                  </Stack>

                  <Typography variant='h6' gutterBottom>
                    {template.name}
                  </Typography>

                  <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
                    {template.description}
                  </Typography>

                  <Stack direction='row' spacing={2} sx={{ mb: 2 }}>
                    <Typography variant='caption' color='text.secondary'>
                      {template.fields.length} fields
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      Used {template.usageCount} times
                    </Typography>
                  </Stack>

                  <Typography variant='caption' color='text.secondary'>
                    Created by {template.createdBy.name}
                  </Typography>
                </CardContent>

                <CardActions>
                  <Tooltip title='Use Template'>
                    <IconButton
                      size='small'
                      color='primary'
                      onClick={() => onUseTemplate(template.id)}
                    >
                      <Visibility />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title='Duplicate'>
                    <IconButton size='small' onClick={() => onDuplicateTemplate(template.id)}>
                      <FileCopy />
                    </IconButton>
                  </Tooltip>

                  {template.createdBy.id === currentUser.id && (
                    <>
                      <Tooltip title='Edit'>
                        <IconButton size='small' onClick={() => handleOpenDialog(template)}>
                          <Edit />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title='Delete'>
                        <IconButton
                          size='small'
                          color='error'
                          onClick={() => onDeleteTemplate(template.id)}
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onClose={handleCloseDialog} maxWidth='md' fullWidth>
        <DialogTitle>
          <Stack direction='row' justifyContent='space-between' alignItems='center'>
            <Typography variant='h6'>
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </Typography>
            <IconButton onClick={handleCloseDialog}>
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label='Template Name'
              value={formData.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData((prev: FormDataType) => ({ ...prev, name: e.target.value }))
              }
              required
            />

            <TextField
              fullWidth
              multiline
              rows={3}
              label='Description'
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData((prev: FormDataType) => ({ ...prev, description: e.target.value }))
              }
            />

            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={formData.category}
                onChange={(e: { target: { value: unknown } }) =>
                  setFormData((prev: FormDataType) => ({
                    ...prev,
                    category: e.target.value as any,
                  }))
                }
                label='Category'
              >
                {categories.slice(1).map(category => (
                  <MenuItem key={category.value} value={category.value}>
                    <Stack direction='row' alignItems='center' spacing={1}>
                      {category.icon}
                      <Typography>{category.label}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Template Fields */}
            <Box>
              <Stack
                direction='row'
                justifyContent='space-between'
                alignItems='center'
                sx={{ mb: 2 }}
              >
                <Typography variant='subtitle1'>Template Fields</Typography>
                <Button startIcon={<Add />} onClick={handleAddField}>
                  Add Field
                </Button>
              </Stack>

              {formData.fields.length === 0 ? (
                <Alert severity='info'>
                  Add fields to define what information will be collected when using this template.
                </Alert>
              ) : (
                <List>
                  {formData.fields.map((field, index) => (
                    <ListItem key={field.id} divider>
                      <Box sx={{ width: '100%' }}>
                        <Grid container spacing={2} alignItems='center'>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              fullWidth
                              size='small'
                              label='Field Name'
                              value={field.name}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handleUpdateField(index, { name: e.target.value })
                              }
                            />
                          </Grid>
                          <Grid item xs={12} sm={3}>
                            <FormControl fullWidth size='small'>
                              <InputLabel>Type</InputLabel>
                              <Select
                                value={field.type}
                                onChange={(e: { target: { value: unknown } }) =>
                                  handleUpdateField(index, { type: e.target.value as any })
                                }
                                label='Type'
                              >
                                {fieldTypes.map(type => (
                                  <MenuItem key={type.value} value={type.value}>
                                    {type.label}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={12} sm={3}>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={field.required}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleUpdateField(index, { required: e.target.checked })
                                  }
                                />
                              }
                              label='Required'
                            />
                          </Grid>
                          <Grid item xs={12} sm={2}>
                            <IconButton color='error' onClick={() => handleRemoveField(index)}>
                              <Delete />
                            </IconButton>
                          </Grid>
                        </Grid>
                      </Box>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant='contained' onClick={handleSaveTemplate} disabled={!formData.name.trim()}>
            {editingTemplate ? 'Update' : 'Create'} Template
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TemplateManager;
