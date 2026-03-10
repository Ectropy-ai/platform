/**
 * SEPPA Chat Input Component
 *
 * Text input for sending messages to the SEPPA assistant.
 * Supports multi-line input and quick action suggestions.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Tooltip,
  Chip,
  Collapse,
} from '@mui/material';
import {
  Send as SendIcon,
  Mic as MicIcon,
  AttachFile as AttachIcon,
  Lightbulb as SuggestIcon,
} from '@mui/icons-material';

interface SEPPAChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestedActions?: string[];
}

/**
 * Quick action suggestions for common queries
 */
const QUICK_ACTIONS = [
  'What decisions are pending?',
  'Show project status',
  'List recent inspections',
  'What needs my approval?',
];

const SEPPAChatInput: React.FC<SEPPAChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Ask SEPPA about decisions, voxels, or project status...',
  suggestedActions,
}) => {
  const [message, setMessage] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions = suggestedActions || QUICK_ACTIONS;

  /**
   * Handle sending the message
   */
  const handleSend = useCallback(() => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !disabled) {
      onSendMessage(trimmedMessage);
      setMessage('');
      setShowSuggestions(false);
    }
  }, [message, disabled, onSendMessage]);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /**
   * Handle quick action click
   */
  const handleQuickAction = useCallback(
    (action: string) => {
      onSendMessage(action);
      setShowSuggestions(false);
    },
    [onSendMessage]
  );

  /**
   * Focus input when enabled
   */
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  return (
    <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
      {/* Quick Actions */}
      <Collapse in={showSuggestions}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            mb: 1.5,
            pb: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          {actions.map((action) => (
            <Chip
              key={action}
              label={action}
              size="small"
              onClick={() => handleQuickAction(action)}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                },
              }}
            />
          ))}
        </Box>
      </Collapse>

      {/* Input Area */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        {/* Suggestion Toggle */}
        <Tooltip title={showSuggestions ? 'Hide suggestions' : 'Show quick actions'}>
          <IconButton
            size="small"
            onClick={() => setShowSuggestions(!showSuggestions)}
            color={showSuggestions ? 'primary' : 'default'}
          >
            <SuggestIcon />
          </IconButton>
        </Tooltip>

        {/* Text Input */}
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          variant="outlined"
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: 'background.default',
            },
          }}
        />

        {/* Attachment Button (future) */}
        <Tooltip title="Attach file (coming soon)">
          <span>
            <IconButton size="small" disabled>
              <AttachIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* Voice Input (future) */}
        <Tooltip title="Voice input (coming soon)">
          <span>
            <IconButton size="small" disabled>
              <MicIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* Send Button */}
        <Tooltip title="Send message (Enter)">
          <span>
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={disabled || !message.trim()}
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
                '&.Mui-disabled': {
                  bgcolor: 'action.disabledBackground',
                  color: 'action.disabled',
                },
              }}
            >
              <SendIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Keyboard Hint */}
      <Box sx={{ mt: 0.5, px: 1 }}>
        <Box
          component="span"
          sx={{ fontSize: '0.7rem', color: 'text.secondary' }}
        >
          Press <kbd style={{ fontFamily: 'monospace' }}>Enter</kbd> to send,{' '}
          <kbd style={{ fontFamily: 'monospace' }}>Shift+Enter</kbd> for new line
        </Box>
      </Box>
    </Box>
  );
};

export default SEPPAChatInput;
