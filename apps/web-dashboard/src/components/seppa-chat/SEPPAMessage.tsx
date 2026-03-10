/**
 * SEPPA Chat Message Component
 *
 * Displays a single message in the SEPPA chat interface.
 * Supports user messages, assistant responses, and tool execution results.
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  Person as UserIcon,
  SmartToy as BotIcon,
  Build as ToolIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import type { ToolCallResult } from '../../services/seppa';

export interface SEPPAMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallResult[];
  isProcessing?: boolean;
}

/**
 * Format tool name for display
 */
const formatToolName = (name: string): string => {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Tool Call Display Component
 * Memoized to prevent unnecessary re-renders when parent updates
 */
const ToolCallDisplay: React.FC<{ toolCall: ToolCallResult }> = React.memo(({ toolCall }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Paper
      variant="outlined"
      sx={{
        mt: 1,
        p: 1,
        bgcolor: (theme) =>
          toolCall.success
            ? alpha(theme.palette.success.main, 0.05)
            : alpha(theme.palette.error.main, 0.05),
        borderColor: (theme) =>
          toolCall.success
            ? alpha(theme.palette.success.main, 0.3)
            : alpha(theme.palette.error.main, 0.3),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ToolIcon fontSize="small" color={toolCall.success ? 'success' : 'error'} />
        <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
          {formatToolName(toolCall.toolName)}
        </Typography>
        {toolCall.success ? (
          <SuccessIcon fontSize="small" color="success" />
        ) : (
          <ErrorIcon fontSize="small" color="error" />
        )}
        <Tooltip title={expanded ? 'Hide details' : 'Show details'}>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 1, pl: 3 }}>
          {toolCall.durationMs && (
            <Typography variant="caption" color="text.secondary" display="block">
              Duration: {toolCall.durationMs}ms
            </Typography>
          )}
          {toolCall.error && (
            <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
              Error: {toolCall.error}
            </Typography>
          )}
          <Typography
            variant="caption"
            component="pre"
            sx={{
              mt: 1,
              p: 1,
              bgcolor: 'background.default',
              borderRadius: 1,
              overflow: 'auto',
              maxHeight: 150,
              fontSize: '0.7rem',
            }}
          >
            {JSON.stringify(toolCall.output, null, 2)}
          </Typography>
        </Box>
      </Collapse>
    </Paper>
  );
});

ToolCallDisplay.displayName = 'ToolCallDisplay';

/**
 * SEPPA Chat Message Component
 * Memoized for performance - prevents re-rendering when sibling messages update
 */
const SEPPAMessage: React.FC<SEPPAMessageProps> = React.memo(({
  role,
  content,
  timestamp,
  toolCalls,
  isProcessing,
}) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        mb: 2,
      }}
    >
      {/* Avatar and Timestamp */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 0.5,
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: isUser ? 'primary.main' : isSystem ? 'warning.main' : 'secondary.main',
            color: 'white',
          }}
        >
          {isUser ? <UserIcon fontSize="small" /> : <BotIcon fontSize="small" />}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {isUser ? 'You' : 'SEPPA'} •{' '}
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      </Box>

      {/* Message Content */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          maxWidth: '85%',
          bgcolor: isUser
            ? 'primary.main'
            : isSystem
              ? (theme) => alpha(theme.palette.warning.main, 0.1)
              : 'background.paper',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          borderRadius: 2,
          borderTopRightRadius: isUser ? 0 : 2,
          borderTopLeftRadius: isUser ? 2 : 0,
          border: isUser ? 'none' : '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            '& strong': { fontWeight: 600 },
            '& code': {
              bgcolor: isUser ? 'rgba(255,255,255,0.2)' : 'action.hover',
              px: 0.5,
              borderRadius: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.85em',
            },
          }}
          dangerouslySetInnerHTML={{
            __html: content
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/`(.*?)`/g, '<code>$1</code>')
              .replace(/\n/g, '<br/>'),
          }}
        />

        {/* Tool Calls */}
        {toolCalls && toolCalls.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <ToolIcon fontSize="small" color="action" />
              <Typography variant="caption" color="text.secondary">
                {toolCalls.length} tool{toolCalls.length > 1 ? 's' : ''} called
              </Typography>
            </Box>
            {toolCalls.map((tc, index) => (
              <ToolCallDisplay key={`${tc.toolName}-${index}`} toolCall={tc} />
            ))}
          </Box>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                '& > span': {
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'text.secondary',
                  animation: 'pulse 1.4s ease-in-out infinite',
                },
                '& > span:nth-of-type(2)': { animationDelay: '0.2s' },
                '& > span:nth-of-type(3)': { animationDelay: '0.4s' },
                '@keyframes pulse': {
                  '0%, 80%, 100%': { opacity: 0.3 },
                  '40%': { opacity: 1 },
                },
              }}
            >
              <span />
              <span />
              <span />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Thinking...
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Suggested Actions */}
      {/* Could be passed as a prop and rendered here */}
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if meaningful props change
  return (
    prevProps.role === nextProps.role &&
    prevProps.content === nextProps.content &&
    prevProps.isProcessing === nextProps.isProcessing &&
    prevProps.toolCalls?.length === nextProps.toolCalls?.length
  );
});

SEPPAMessage.displayName = 'SEPPAMessage';

export default SEPPAMessage;
