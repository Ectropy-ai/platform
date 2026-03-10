/**
 * Chat Message Component
 * Individual message bubble with role-based styling
 */

import React from 'react';
import { Box, Paper, Typography, Chip } from '@mui/material';
import { Person as UserIcon, SmartToy as BotIcon, Info as InfoIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from './MCPChatPanel';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  // Format timestamp
  const timeString = message.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: 1,
      }}
    >
      {/* Avatar */}
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          bgcolor: isUser ? 'primary.main' : isSystem ? 'info.main' : 'secondary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          flexShrink: 0,
        }}
      >
        {isUser ? (
          <UserIcon fontSize='small' />
        ) : isSystem ? (
          <InfoIcon fontSize='small' />
        ) : (
          <BotIcon fontSize='small' />
        )}
      </Box>

      {/* Message Bubble */}
      <Box sx={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Paper
          elevation={1}
          sx={{
            p: 1.5,
            bgcolor: isUser ? 'primary.light' : isSystem ? 'info.light' : 'background.default',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            borderTopLeftRadius: isUser ? 2 : 0,
            borderTopRightRadius: isUser ? 0 : 2,
          }}
        >
          {/* Markdown content for assistant/system messages */}
          {isAssistant || isSystem ? (
            <Box
              sx={{
                '& p': { margin: 0, marginBottom: 1 },
                '& p:last-child': { marginBottom: 0 },
                '& ul, & ol': { marginTop: 0.5, marginBottom: 0.5, paddingLeft: 2 },
                '& li': { marginBottom: 0.5 },
                '& code': {
                  bgcolor: 'action.hover',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                },
                '& pre': {
                  bgcolor: 'action.hover',
                  p: 1,
                  borderRadius: 1,
                  overflowX: 'auto',
                  '& code': {
                    bgcolor: 'transparent',
                    p: 0,
                  },
                },
                '& strong': {
                  fontWeight: 600,
                },
              }}
            >
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </Box>
          ) : (
            <Typography variant='body1' sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          )}

          {/* Metadata chips */}
          {message.metadata && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
              {message.metadata.deliverableId && (
                <Chip label={message.metadata.deliverableId} size='small' variant='outlined' />
              )}
              {message.metadata.sessionId && (
                <Chip
                  label={`Session: ${message.metadata.sessionId.slice(0, 12)}...`}
                  size='small'
                  variant='outlined'
                />
              )}
              {message.metadata.error && (
                <Chip label='Error' size='small' color='error' variant='outlined' />
              )}
            </Box>
          )}
        </Paper>

        {/* Timestamp */}
        <Typography
          variant='caption'
          sx={{
            color: 'text.secondary',
            px: 1,
            alignSelf: isUser ? 'flex-end' : 'flex-start',
          }}
        >
          {timeString}
        </Typography>
      </Box>
    </Box>
  );
};

export default ChatMessage;
