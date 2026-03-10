/**
 * Chat Message List Component
 * Displays scrollable list of chat messages
 */

import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageType } from './MCPChatPanel';

interface ChatMessageListProps {
  messages: ChatMessageType[];
  isProcessing: boolean;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, isProcessing }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflowY: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        bgcolor: 'background.paper',
      }}
    >
      {messages.map(message => (
        <ChatMessage key={message.id} message={message} />
      ))}

      {isProcessing && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 1,
          }}
        >
          <CircularProgress size={20} />
          <Box sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            MCP Assistant is thinking...
          </Box>
        </Box>
      )}

      <div ref={messagesEndRef} />
    </Box>
  );
};

export default ChatMessageList;
