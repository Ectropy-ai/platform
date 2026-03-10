import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Stack,
  Grid,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
  LinearProgress,
  Paper,
} from '@mui/material';
import {
  ExpandMore,
  Edit,
  Save,
  Cancel,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Person,
  AttachMoney,
  Event,
  Gavel,
  Refresh,
  PlayArrow,
} from '@mui/icons-material';

/**
 * Extracted party from contract
 */
interface ExtractedParty {
  name: string;
  role: string;
  address?: string;
  authorityLevel?: string;
  budgetLimit?: number | string;
}

/**
 * Extracted financial terms
 */
interface ExtractedFinancialTerms {
  contractPrice?: number;
  contractSum?: number;
  targetCost?: number;
  guaranteedMaximumPrice?: number;
  currency?: string;
  holdbackPercentage?: number;
  retainagePercentage?: number;
}

/**
 * Extracted dates
 */
interface ExtractedDates {
  commencement?: string;
  substantialCompletion?: string;
  finalCompletion?: string;
}

/**
 * Extracted governance settings
 */
interface ExtractedGovernance {
  hasPMT?: boolean;
  hasPET?: boolean;
  pmtVotingRule?: string;
  pmtVotingThreshold?: number;
  pmtVotingWindow?: number;
}

/**
 * Review item for low-confidence fields
 */
interface ReviewItem {
  fieldPath: string;
  currentValue: unknown;
  confidence: number;
  suggestedValue?: unknown;
  sources: string[];
}

/**
 * Contract extraction result
 */
interface ContractExtraction {
  contractId: string;
  status: string;
  filename: string;
  confidence?: number;
  contractFamily?: string;
  contractType?: string;
  deliveryMethod?: string;
  parties?: ExtractedParty[];
  financialTerms?: ExtractedFinancialTerms;
  dates?: ExtractedDates;
  governance?: ExtractedGovernance;
  reviewItems?: ReviewItem[];
  authorityCascade?: Record<string, ExtractedParty[]>;
}

/**
 * Props for ContractExtractionResults
 */
interface ContractExtractionResultsProps {
  projectId: string;
  contractId: string;
  onApply?: (contractId: string) => void;
  onEdit?: (contractId: string, field: string, value: unknown) => void;
  apiBaseUrl?: string;
}

/**
 * Format currency value
 */
function formatCurrency(value: number | undefined, currency = 'CAD'): string {
  if (value === undefined) return 'Not specified';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format date string
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'Not specified';
  try {
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get confidence color
 */
function getConfidenceColor(confidence: number): 'success' | 'warning' | 'error' {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.6) return 'warning';
  return 'error';
}

/**
 * Get confidence icon
 */
function getConfidenceIcon(confidence: number) {
  if (confidence >= 0.8) return <CheckCircle fontSize="small" />;
  if (confidence >= 0.6) return <Warning fontSize="small" />;
  return <ErrorIcon fontSize="small" />;
}

/**
 * Contract Extraction Results Component
 *
 * Displays extracted contract data with confidence scores.
 * Allows editing and review of low-confidence fields.
 */
const ContractExtractionResults: React.FC<ContractExtractionResultsProps> = ({
  projectId,
  contractId,
  onApply,
  onEdit,
  apiBaseUrl = '/api',
}) => {
  const [extraction, setExtraction] = useState<ContractExtraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [applying, setApplying] = useState(false);

  // Fetch extraction results
  const fetchExtraction = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${projectId}/${contractId}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setExtraction(data.contract);
      } else {
        throw new Error(data.error || 'Failed to load contract');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contract');
    } finally {
      setLoading(false);
    }
  }, [projectId, contractId, apiBaseUrl]);

  useEffect(() => {
    fetchExtraction();
  }, [fetchExtraction]);

  // Handle edit start
  const handleEditStart = (fieldPath: string, currentValue: unknown) => {
    setEditingField(fieldPath);
    setEditValue(String(currentValue ?? ''));
  };

  // Handle edit cancel
  const handleEditCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Handle edit save
  const handleEditSave = async () => {
    if (!editingField) return;

    if (onEdit) {
      onEdit(contractId, editingField, editValue);
    }

    // Optimistic update
    setExtraction((prev) => {
      if (!prev) return prev;
      // Deep update would go here
      return prev;
    });

    setEditingField(null);
    setEditValue('');
  };

  // Handle apply contract
  const handleApply = async () => {
    setApplying(true);

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${projectId}/${contractId}/apply`, {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok && data.success) {
        if (onApply) {
          onApply(contractId);
        }
        await fetchExtraction(); // Refresh to show new status
      } else {
        throw new Error(data.error || 'Failed to apply contract');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply contract');
    } finally {
      setApplying(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading contract extraction results...</Typography>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert
            severity="error"
            action={
              <Button size="small" onClick={fetchExtraction}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!extraction) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">No extraction results available for this contract.</Alert>
        </CardContent>
      </Card>
    );
  }

  // Still parsing state
  if (extraction.status === 'parsing') {
    return (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Contract is being parsed...</Typography>
          <Typography variant="caption" color="text.secondary">
            This may take a few moments depending on document size.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button startIcon={<Refresh />} onClick={fetchExtraction}>
              Check Status
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="h6" gutterBottom>
              Contract Extraction Results
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {extraction.filename}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={extraction.status}
              color={extraction.status === 'active' ? 'success' : extraction.status === 'parsed' ? 'info' : 'default'}
              size="small"
            />
            {extraction.confidence !== undefined && (
              <Tooltip title={`Overall confidence: ${(extraction.confidence * 100).toFixed(0)}%`}>
                <Chip
                  icon={getConfidenceIcon(extraction.confidence)}
                  label={`${(extraction.confidence * 100).toFixed(0)}%`}
                  color={getConfidenceColor(extraction.confidence)}
                  size="small"
                  variant="outlined"
                />
              </Tooltip>
            )}
          </Stack>
        </Box>

        {/* Confidence Progress */}
        {extraction.confidence !== undefined && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Extraction Confidence
            </Typography>
            <LinearProgress
              variant="determinate"
              value={extraction.confidence * 100}
              color={getConfidenceColor(extraction.confidence)}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>
        )}

        {/* Contract Type Info */}
        {(extraction.contractFamily || extraction.contractType) && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              {extraction.contractFamily && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Contract Family
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {extraction.contractFamily}
                  </Typography>
                </Box>
              )}
              {extraction.contractType && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Contract Type
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {extraction.contractType}
                  </Typography>
                </Box>
              )}
              {extraction.deliveryMethod && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Delivery Method
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {extraction.deliveryMethod}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        )}

        {/* Parties Section */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Person sx={{ mr: 1 }} />
            <Typography>Parties ({extraction.parties?.length || 0})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              {extraction.parties?.map((party, index) => (
                <Grid item xs={12} md={6} key={index}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="primary">
                      {party.role}
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {party.name}
                    </Typography>
                    {party.address && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {party.address}
                      </Typography>
                    )}
                    {party.authorityLevel && (
                      <Chip label={`Level: ${party.authorityLevel}`} size="small" sx={{ mt: 1 }} />
                    )}
                  </Paper>
                </Grid>
              ))}
              {(!extraction.parties || extraction.parties.length === 0) && (
                <Grid item xs={12}>
                  <Alert severity="warning">No parties extracted. Manual entry may be required.</Alert>
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Financial Terms Section */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <AttachMoney sx={{ mr: 1 }} />
            <Typography>Financial Terms</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              {extraction.financialTerms?.contractPrice !== undefined && (
                <Grid item xs={6} md={4}>
                  <Typography variant="caption" color="text.secondary">
                    Contract Price
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatCurrency(extraction.financialTerms.contractPrice, extraction.financialTerms.currency)}
                  </Typography>
                </Grid>
              )}
              {extraction.financialTerms?.contractSum !== undefined && (
                <Grid item xs={6} md={4}>
                  <Typography variant="caption" color="text.secondary">
                    Contract Sum
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatCurrency(extraction.financialTerms.contractSum, extraction.financialTerms.currency)}
                  </Typography>
                </Grid>
              )}
              {extraction.financialTerms?.targetCost !== undefined && (
                <Grid item xs={6} md={4}>
                  <Typography variant="caption" color="text.secondary">
                    Target Cost
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatCurrency(extraction.financialTerms.targetCost, extraction.financialTerms.currency)}
                  </Typography>
                </Grid>
              )}
              {extraction.financialTerms?.guaranteedMaximumPrice !== undefined && (
                <Grid item xs={6} md={4}>
                  <Typography variant="caption" color="text.secondary">
                    GMP
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatCurrency(extraction.financialTerms.guaranteedMaximumPrice, extraction.financialTerms.currency)}
                  </Typography>
                </Grid>
              )}
              {(extraction.financialTerms?.holdbackPercentage !== undefined ||
                extraction.financialTerms?.retainagePercentage !== undefined) && (
                <Grid item xs={6} md={4}>
                  <Typography variant="caption" color="text.secondary">
                    Holdback/Retainage
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {extraction.financialTerms.holdbackPercentage ?? extraction.financialTerms.retainagePercentage}%
                  </Typography>
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Dates Section */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Event sx={{ mr: 1 }} />
            <Typography>Key Dates</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={6} md={4}>
                <Typography variant="caption" color="text.secondary">
                  Commencement
                </Typography>
                <Typography variant="body1">
                  {formatDate(extraction.dates?.commencement)}
                </Typography>
              </Grid>
              <Grid item xs={6} md={4}>
                <Typography variant="caption" color="text.secondary">
                  Substantial Completion
                </Typography>
                <Typography variant="body1">
                  {formatDate(extraction.dates?.substantialCompletion)}
                </Typography>
              </Grid>
              <Grid item xs={6} md={4}>
                <Typography variant="caption" color="text.secondary">
                  Final Completion
                </Typography>
                <Typography variant="body1">
                  {formatDate(extraction.dates?.finalCompletion)}
                </Typography>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Governance Section (for IPD) */}
        {extraction.governance && (extraction.governance.hasPMT || extraction.governance.hasPET) && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Gavel sx={{ mr: 1 }} />
              <Typography>IPD Governance</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {extraction.governance.hasPMT && (
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2">Project Management Team (PMT)</Typography>
                      <Typography variant="body2">
                        Voting: {extraction.governance.pmtVotingRule || 'Majority'}
                      </Typography>
                      {extraction.governance.pmtVotingThreshold && (
                        <Typography variant="body2">
                          Threshold: {formatCurrency(extraction.governance.pmtVotingThreshold)}
                        </Typography>
                      )}
                      {extraction.governance.pmtVotingWindow && (
                        <Typography variant="body2">
                          Window: {extraction.governance.pmtVotingWindow} hours
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                )}
                {extraction.governance.hasPET && (
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2">Project Executive Team (PET)</Typography>
                      <Typography variant="body2">Escalation authority for major decisions</Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Review Items */}
        {extraction.reviewItems && extraction.reviewItems.length > 0 && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Warning sx={{ mr: 1, color: 'warning.main' }} />
              <Typography>Items Requiring Review ({extraction.reviewItems.length})</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {extraction.reviewItems.map((item, index) => (
                  <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography variant="subtitle2">{item.fieldPath}</Typography>
                        <Typography variant="body2">
                          Current: {String(item.currentValue ?? 'Not found')}
                        </Typography>
                        {item.suggestedValue !== undefined && (
                          <Typography variant="body2" color="primary">
                            Suggested: {String(item.suggestedValue)}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        label={`${(item.confidence * 100).toFixed(0)}%`}
                        color={getConfidenceColor(item.confidence)}
                        size="small"
                      />
                    </Box>
                  </Paper>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button startIcon={<Refresh />} onClick={fetchExtraction}>
            Refresh
          </Button>
          {extraction.status === 'parsed' && (
            <Button
              variant="contained"
              color="primary"
              startIcon={applying ? <CircularProgress size={20} /> : <PlayArrow />}
              onClick={handleApply}
              disabled={applying}
            >
              {applying ? 'Applying...' : 'Apply to Project'}
            </Button>
          )}
          {extraction.status === 'active' && (
            <Chip label="Contract Active" color="success" icon={<CheckCircle />} />
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ContractExtractionResults;
