/**
 * SEPPA Chat Panel Component
 *
 * Main chat interface for the Claude-powered SEPPA construction assistant.
 * Provides PM decision support, voxel queries, and project intelligence.
 *
 * Features:
 * - Real-time chat with Claude assistant
 * - Tool execution display (24 PM decision tools)
 * - Context-aware responses (project, voxel, authority)
 * - Conversation history management
 * - Authority level awareness (7-tier cascade)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Drawer,
  Box,
  IconButton,
  Typography,
  Divider,
  Chip,
  Tooltip,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Fade,
} from '@mui/material';
import {
  Close as CloseIcon,
  SmartToy as BotIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  CheckCircle as ConnectedIcon,
  Error as DisconnectedIcon,
  Construction as ConstructionIcon,
} from '@mui/icons-material';
import SEPPAMessage, { type SEPPAMessageProps } from './SEPPAMessage';
import SEPPAChatInput from './SEPPAChatInput';
import {
  seppaClient,
  streamChatResponse,
  type ChatContext,
  type AuthorityLevel,
  type ToolCallResult,
  type ConversationSummary,
  AUTHORITY_NAMES,
} from '../../services/seppa';

// ============================================================================
// Types
// ============================================================================

interface ChatMessage extends Omit<SEPPAMessageProps, 'timestamp'> {
  id: string;
  timestamp: Date;
  suggestedActions?: string[];
}

/**
 * M6: Voxel context for spatial awareness
 */
interface VoxelContextData {
  system?: string;
  status?: string;
  healthStatus?: string;
  percentComplete?: number;
  decisionCount?: number;
  alertCount?: number;
  center?: { x: number; y: number; z: number };
  level?: string;
}

interface SEPPAChatPanelProps {
  open: boolean;
  onClose: () => void;
  /** Current project context */
  projectId?: string;
  /** Currently selected voxel */
  selectedVoxelId?: string;
  /** M6: Selected voxel details for context-aware responses */
  selectedVoxelData?: VoxelContextData;
  /** User's authority level (0-6) */
  userAuthority?: AuthorityLevel;
  /** User ID for conversation tracking */
  userId: string;
  /** User display name */
  userName?: string;
}

// ============================================================================
// Component
// ============================================================================

const SEPPAChatPanel: React.FC<SEPPAChatPanelProps> = ({
  open,
  onClose,
  projectId,
  selectedVoxelId,
  selectedVoxelData,
  userAuthority = 3,
  userId,
  userName,
}) => {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'operational' | 'error' | 'checking'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [useStreaming, setUseStreaming] = useState(true);
  const [conversationHistory, setConversationHistory] = useState<ConversationSummary[]>([]);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<null | HTMLElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // Effects
  // ============================================================================

  /**
   * Check service status on mount
   */
  useEffect(() => {
    const checkStatus = async () => {
      setServiceStatus('checking');
      const result = await seppaClient.getStatus();
      if (result.success && result.data?.status === 'operational') {
        setServiceStatus('operational');
      } else {
        setServiceStatus('error');
        setError(result.data?.message || result.error || 'Service unavailable');
      }
    };

    if (open) {
      checkStatus();
    }
  }, [open]);

  /**
   * Initialize with welcome message
   */
  useEffect(() => {
    if (open && messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content:
          `👋 Hello${userName ? `, ${userName}` : ''}! I'm **SEPPA**, your construction intelligence assistant.\n\n` +
          `I can help you with:\n` +
          `• **Decisions** - Capture, route, approve, or query PM decisions\n` +
          `• **Voxels** - Get status, attach decisions, navigate the decision graph\n` +
          `• **Authority** - Check approval levels, validate permissions, escalate\n` +
          `• **Inspections** - Request or complete inspections\n` +
          `• **Consequences** - Track downstream impacts of decisions\n\n` +
          `You're logged in as **${AUTHORITY_NAMES[userAuthority]}** (Level ${userAuthority}).\n` +
          (projectId ? `Current project: **${projectId}**\n` : '') +
          (selectedVoxelId ? `Selected voxel: **${selectedVoxelId}**\n` : '') +
          `\nWhat would you like to know?`,
        timestamp: new Date(),
        suggestedActions: [
          'What decisions are pending?',
          'Show my authority level',
          'List recent inspections',
        ],
      };
      setMessages([welcomeMessage]);
    }
  }, [open, messages.length, userName, userAuthority, projectId, selectedVoxelId]);

  /**
   * Auto-scroll to latest message
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Load conversation history when panel opens
   */
  useEffect(() => {
    const loadHistory = async () => {
      if (!open || !userId) return;
      const result = await seppaClient.listConversations(userId, 10);
      if (result.success && result.data) {
        setConversationHistory(result.data);
      }
    };

    loadHistory();
  }, [open, userId]);

  /**
   * Cleanup abort controller on unmount
   */
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ============================================================================
  // Handlers
  // ============================================================================

  /**
   * Add a message to the chat
   */
  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage;
  }, []);

  /**
   * Send a message to the assistant (with streaming support)
   */
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (serviceStatus !== 'operational') {
        addMessage({
          role: 'system',
          content: '⚠️ SEPPA service is not available. Please try again later.',
        });
        return;
      }

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      // Add user message
      addMessage({ role: 'user', content });

      // Create streaming message placeholder
      const streamingId = `streaming-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: streamingId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isProcessing: true,
        },
      ]);

      setIsProcessing(true);
      setError(null);

      // Build context from current state (M6: includes voxel details)
      const context: ChatContext = {
        projectId,
        selectedVoxelId,
        currentView: 'seppa-chat',
        metadata: selectedVoxelData
          ? {
              voxelContext: {
                system: selectedVoxelData.system,
                status: selectedVoxelData.status,
                healthStatus: selectedVoxelData.healthStatus,
                percentComplete: selectedVoxelData.percentComplete,
                decisionCount: selectedVoxelData.decisionCount,
                alertCount: selectedVoxelData.alertCount,
                center: selectedVoxelData.center,
                level: selectedVoxelData.level,
              },
            }
          : undefined,
      };

      const request = {
        message: content,
        conversationId: conversationId || undefined,
        context,
        userAuthority,
        userId,
        userName,
      };

      // Use streaming or blocking based on preference
      if (useStreaming) {
        let toolCalls: ToolCallResult[] = [];

        await streamChatResponse(
          request,
          {
            onStart: (convId) => {
              setConversationId(convId);
            },
            onToken: (_token, accumulated) => {
              // Update streaming message with accumulated content
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, content: accumulated, isProcessing: true }
                    : m
                )
              );
            },
            onToolStart: (toolName) => {
              // Show tool execution in progress
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? {
                        ...m,
                        toolCalls: [
                          ...toolCalls,
                          { toolName, input: {}, output: null, success: false },
                        ],
                      }
                    : m
                )
              );
            },
            onToolEnd: (_toolName, result) => {
              toolCalls = [...toolCalls.filter((t) => t.toolName !== result.toolName), result];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, toolCalls } : m
                )
              );
            },
            onComplete: (response) => {
              // Finalize the message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? {
                        ...m,
                        content: response.message.content,
                        toolCalls: response.message.toolCalls,
                        suggestedActions: response.suggestedActions,
                        isProcessing: false,
                      }
                    : m
                )
              );
              setIsProcessing(false);
            },
            onError: (errorMsg) => {
              // Remove streaming placeholder and show error
              setMessages((prev) => prev.filter((m) => m.id !== streamingId));
              addMessage({
                role: 'system',
                content: `❌ Error: ${errorMsg}`,
              });
              setError(errorMsg);
              setIsProcessing(false);
            },
          },
          abortControllerRef.current.signal
        );
      } else {
        // Fallback to blocking request
        try {
          const result = await seppaClient.chat(request);

          // Remove streaming placeholder
          setMessages((prev) => prev.filter((m) => m.id !== streamingId));

          if (result.success && result.data) {
            if (result.data.conversationId) {
              setConversationId(result.data.conversationId);
            }

            addMessage({
              role: 'assistant',
              content: result.data.message.content,
              toolCalls: result.data.message.toolCalls,
              suggestedActions: result.data.suggestedActions,
            });
          } else {
            addMessage({
              role: 'system',
              content: `❌ Error: ${result.error || 'Unknown error occurred'}`,
            });
          }
        } catch (err) {
          setMessages((prev) => prev.filter((m) => m.id !== streamingId));
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          addMessage({
            role: 'system',
            content: `❌ Error: ${errorMessage}`,
          });
          setError(errorMessage);
        } finally {
          setIsProcessing(false);
        }
      }
    },
    [
      serviceStatus,
      addMessage,
      conversationId,
      projectId,
      selectedVoxelId,
      userAuthority,
      userId,
      userName,
      useStreaming,
    ]
  );

  /**
   * Start a new conversation
   */
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setMenuAnchor(null);
  }, []);

  /**
   * Delete current conversation
   */
  const handleDeleteConversation = useCallback(async () => {
    if (conversationId) {
      await seppaClient.deleteConversation(conversationId, userId);
    }
    handleNewConversation();
  }, [conversationId, userId, handleNewConversation]);

  /**
   * Load a previous conversation
   */
  const handleLoadConversation = useCallback(
    async (convId: string) => {
      setHistoryMenuAnchor(null);
      const result = await seppaClient.getConversation(convId, userId);
      if (result.success && result.data) {
        setConversationId(convId);
        // Convert conversation messages to ChatMessages
        const loadedMessages: ChatMessage[] = result.data.messages.map((msg, idx) => ({
          id: `loaded-${convId}-${idx}`,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          toolCalls: msg.toolCalls,
        }));
        setMessages(loadedMessages);
      }
    },
    [userId]
  );

  /**
   * Toggle streaming mode
   */
  const handleToggleStreaming = useCallback(() => {
    setUseStreaming((prev) => !prev);
    setMenuAnchor(null);
  }, []);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 480, md: 520 },
          maxWidth: '100%',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
            color: 'white',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ConstructionIcon />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                SEPPA
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>
                Construction Intelligence
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="New conversation">
              <IconButton onClick={handleNewConversation} sx={{ color: 'inherit' }}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="More options">
              <IconButton
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                sx={{ color: 'inherit' }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} sx={{ color: 'inherit' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Status Bar */}
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: 'background.default',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Chip
            icon={
              serviceStatus === 'operational' ? (
                <ConnectedIcon />
              ) : serviceStatus === 'checking' ? (
                <CircularProgress size={14} />
              ) : (
                <DisconnectedIcon />
              )
            }
            label={
              serviceStatus === 'operational'
                ? 'Connected'
                : serviceStatus === 'checking'
                  ? 'Connecting...'
                  : 'Disconnected'
            }
            color={serviceStatus === 'operational' ? 'success' : 'error'}
            size="small"
            variant="outlined"
          />
          <Chip
            label={AUTHORITY_NAMES[userAuthority]}
            size="small"
            variant="outlined"
            color="primary"
          />
          {projectId && (
            <Chip label={projectId} size="small" variant="outlined" />
          )}
          {selectedVoxelId && (
            <Chip
              label={selectedVoxelId}
              size="small"
              variant="outlined"
              color="secondary"
            />
          )}
        </Box>

        {/* Error Alert */}
        <Fade in={!!error}>
          <Box sx={{ px: 2, pt: 1 }}>
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Box>
        </Fade>

        {/* Messages */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: 2,
            py: 2,
            bgcolor: (theme) => theme.palette.grey[50],
          }}
        >
          {messages.map((msg) => (
            <SEPPAMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              toolCalls={msg.toolCalls}
              isProcessing={msg.isProcessing}
            />
          ))}
          <div ref={messagesEndRef} />
        </Box>

        <Divider />

        {/* Input */}
        <SEPPAChatInput
          onSendMessage={handleSendMessage}
          disabled={isProcessing || serviceStatus !== 'operational'}
          suggestedActions={messages[messages.length - 1]?.suggestedActions}
        />
      </Box>

      {/* Options Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={handleNewConversation}>
          <ListItemIcon>
            <RefreshIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>New Conversation</ListItemText>
        </MenuItem>
        <MenuItem onClick={(e) => setHistoryMenuAnchor(e.currentTarget)}>
          <ListItemIcon>
            <HistoryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Conversation History</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleToggleStreaming}>
          <ListItemIcon>
            <BotIcon fontSize="small" color={useStreaming ? 'primary' : 'inherit'} />
          </ListItemIcon>
          <ListItemText>
            Streaming: {useStreaming ? 'On' : 'Off'}
          </ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleDeleteConversation} disabled={!conversationId}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete Conversation</ListItemText>
        </MenuItem>
      </Menu>

      {/* Conversation History Menu */}
      <Menu
        anchorEl={historyMenuAnchor}
        open={Boolean(historyMenuAnchor)}
        onClose={() => setHistoryMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {conversationHistory.length === 0 ? (
          <MenuItem disabled>
            <ListItemText>No previous conversations</ListItemText>
          </MenuItem>
        ) : (
          conversationHistory.map((conv) => (
            <MenuItem
              key={conv.id}
              onClick={() => handleLoadConversation(conv.id)}
              selected={conv.id === conversationId}
            >
              <ListItemText
                primary={conv.title || `Conversation ${conv.id.slice(0, 8)}`}
                secondary={`${conv.messageCount} messages · ${new Date(conv.updatedAt).toLocaleDateString()}`}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </Drawer>
  );
};

export default SEPPAChatPanel;
