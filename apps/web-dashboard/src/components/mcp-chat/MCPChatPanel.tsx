/**
 * MCP Chat Panel
 * Drawer-based chat interface for MCP Assistant
 */

import React, { useState, useCallback } from 'react';
import {
  Drawer,
  Box,
  IconButton,
  Typography,
  Divider,
  Chip,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  SmartToy as BotIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';
import mcpClient from '../../services/mcp/mcp-client.service';
import type {
  DeliverableSubmission,
  DeliverableSubmitResponse,
} from '../../services/mcp/mcp-client.service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    deliverableId?: string;
    sessionId?: string;
    validation?: any;
    error?: string;
  };
}

interface MCPChatPanelProps {
  open: boolean;
  onClose: () => void;
}

const MCPChatPanel: React.FC<MCPChatPanelProps> = ({ open, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm your MCP Assistant. I can help you:\n\n" +
        '• Submit completed deliverables\n' +
        '• Validate work before submission\n' +
        '• Check deliverable status\n' +
        '• Find your next recommended task\n' +
        '• List available deliverables\n\n' +
        'What would you like to do?',
      timestamp: new Date(),
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationContext, setConversationContext] = useState<{
    lastDeliverableId?: string;
    lastAction?: string;
  }>({});

  /**
   * Add message to chat
   */
  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, []);

  /**
   * Handle user input
   */
  const handleSendMessage = useCallback(
    async (content: string) => {
      // Add user message
      addMessage({ role: 'user', content });

      setIsProcessing(true);

      try {
        // Parse user intent (simple keyword matching for MVP)
        const lowerContent = content.toLowerCase();

        // Intent: Submit deliverable
        if (lowerContent.includes('submit') && lowerContent.includes('deliverable')) {
          await handleSubmitDeliverable(content);
        }
        // Intent: Validate deliverable
        else if (lowerContent.includes('validate')) {
          await handleValidateDeliverable(content);
        }
        // Intent: Get status
        else if (lowerContent.includes('status') || lowerContent.includes('check')) {
          await handleGetStatus(content);
        }
        // Intent: List deliverables
        else if (lowerContent.includes('list') || lowerContent.includes('show')) {
          await handleListDeliverables(content);
        }
        // Intent: Get next deliverable
        else if (lowerContent.includes('next') || lowerContent.includes('recommend')) {
          await handleGetNextDeliverable(content);
        }
        // Default: Provide help
        else {
          addMessage({
            role: 'assistant',
            content:
              'I can help you with:\n\n' +
              '• **Submit a deliverable**: "Submit deliverable p5a-d13"\n' +
              '• **Validate work**: "Validate deliverable p5a-d13"\n' +
              '• **Check status**: "Status of p5a-d13"\n' +
              '• **List deliverables**: "List all deliverables in phase-5a"\n' +
              '• **Get next task**: "What should I work on next?"\n\n' +
              'What would you like to do?',
          });
        }
      } catch (error) {
        console.error('[MCP Chat] Error processing message:', error);
        addMessage({
          role: 'system',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: { error: String(error) },
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [addMessage, conversationContext],
  );

  /**
   * Handle submit deliverable intent
   */
  const handleSubmitDeliverable = async (content: string) => {
    // Extract deliverable ID (simple regex for MVP)
    const idMatch = content.match(/p\d+[a-z]?-[a-z0-9-]+/i);
    if (!idMatch) {
      addMessage({
        role: 'assistant',
        content:
          'I couldn\'t find a deliverable ID. Please use format like "p5a-d13".\n\n' +
          'Example: "Submit deliverable p5a-d13"',
      });
      return;
    }

    const deliverableId = idMatch[0];

    // For MVP, create a simple submission (in production, this would be a form)
    addMessage({
      role: 'assistant',
      content: `Submitting deliverable **${deliverableId}**...\n\nPlease wait while I validate and generate evidence.`,
    });

    // Mock submission data (in production, this would come from a form)
    const submission: DeliverableSubmission = {
      deliverableId,
      developer: 'claude', // Would come from auth context
      workCompleted: {
        filesChanged: ['test.ts'],
        testsPassed: true,
        description: 'Completed via MCP chat interface',
        estimatedEffort: '1h',
      },
      evidence: {
        artifacts: [],
        context: 'Submitted via admin dashboard MCP chat',
        approach: 'Interactive chat submission',
        outcome: 'Awaiting validation',
      },
    };

    const result = await mcpClient.submitDeliverable(submission);

    if (result.success && result.approved) {
      addMessage({
        role: 'assistant',
        content:
          `✅ **Deliverable ${deliverableId} approved!**\n\n` +
          `**Evidence Session:** ${result.evidence?.sessionId}\n` +
          `**Quality Score:** ${result.validation.validationResults.codeQualityScore}/100\n\n` +
          `**MCP Updates:**\n` +
          `• Current Truth: ${result.mcpUpdates?.currentTruthUpdated ? '✅' : '❌'}\n` +
          `• Decision Log: ${result.mcpUpdates?.decisionLogUpdated ? '✅' : '❌'}\n` +
          `• Roadmap: ${result.mcpUpdates?.roadmapUpdated ? '✅' : '❌'}\n\n` +
          `${result.message}`,
        metadata: {
          deliverableId,
          sessionId: result.evidence?.sessionId,
          validation: result.validation,
        },
      });

      setConversationContext({ lastDeliverableId: deliverableId, lastAction: 'submit' });
    } else {
      addMessage({
        role: 'assistant',
        content:
          `❌ **Validation failed for ${deliverableId}**\n\n` +
          `${result.validation.feedback || result.error}\n\n` +
          `**Quality Score:** ${result.validation.validationResults.codeQualityScore}/100\n\n` +
          'Please address the feedback and try again.',
        metadata: {
          deliverableId,
          validation: result.validation,
          error: result.error,
        },
      });
    }
  };

  /**
   * Handle validate deliverable intent
   */
  const handleValidateDeliverable = async (content: string) => {
    const idMatch = content.match(/p\d+[a-z]?-[a-z0-9-]+/i);
    if (!idMatch) {
      addMessage({
        role: 'assistant',
        content: 'Please provide a deliverable ID to validate (e.g., "p5a-d13")',
      });
      return;
    }

    const deliverableId = idMatch[0];

    addMessage({
      role: 'assistant',
      content: `Validating **${deliverableId}**...`,
    });

    // Mock validation data
    const submission: DeliverableSubmission = {
      deliverableId,
      developer: 'claude',
      workCompleted: {
        filesChanged: ['test.ts'],
        testsPassed: true,
        description: 'Pre-submission validation check',
        estimatedEffort: '1h',
      },
      evidence: {
        artifacts: [],
        context: 'Validation check via chat',
        approach: 'Pre-submission validation',
        outcome: 'Pending validation',
      },
    };

    const result = await mcpClient.validateDeliverable(submission);

    if (result.success) {
      const validation = result.validation;
      addMessage({
        role: 'assistant',
        content:
          `${validation.approved ? '✅' : '❌'} **Validation ${validation.approved ? 'Passed' : 'Failed'}**\n\n` +
          `**Quality Score:** ${validation.validationResults.codeQualityScore}/100\n` +
          `**Acceptance Criteria:** ${validation.validationResults.acceptanceCriteriaMet ? '✅' : '❌'}\n` +
          `**Dependencies:** ${validation.validationResults.dependenciesSatisfied ? '✅' : '❌'}\n` +
          `**Tests:** ${validation.validationResults.testsPass ? '✅' : '❌'}\n\n` +
          `${validation.feedback || (validation.approved ? 'Ready for submission!' : 'Please address issues above.')}`,
        metadata: { deliverableId, validation },
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `Failed to validate: ${result.message}`,
        metadata: { deliverableId, error: result.message },
      });
    }
  };

  /**
   * Handle get status intent
   */
  const handleGetStatus = async (content: string) => {
    const idMatch = content.match(/p\d+[a-z]?-[a-z0-9-]+/i);
    if (!idMatch) {
      addMessage({
        role: 'assistant',
        content: 'Please provide a deliverable ID to check status (e.g., "p5a-d13")',
      });
      return;
    }

    const deliverableId = idMatch[0];

    const result = await mcpClient.getDeliverableStatus(deliverableId);

    if (result.success && result.deliverable) {
      const d = result.deliverable;
      addMessage({
        role: 'assistant',
        content:
          `**${d.name}** (${d.id})\n\n` +
          `**Status:** ${d.status}\n` +
          `**Phase:** ${d.phase}\n` +
          `**Priority:** ${d.priority}\n` +
          `**Effort:** ${d.estimatedEffort}\n` +
          `**Assigned:** ${d.assignedTo || 'Unassigned'}\n\n` +
          `**Dependencies:** ${d.dependencies.length === 0 ? 'None' : d.dependencies.map(dep => `\n  • ${dep.name} (${dep.status})`).join('')}\n\n` +
          `**Evidence Sessions:** ${d.evidenceSessions.length === 0 ? 'None' : d.evidenceSessions.join(', ')}\n\n` +
          `${d.blockers && d.blockers.length > 0 ? `**Blockers:**\n${d.blockers.map(b => `  • ${b}`).join('\n')}` : ''}`,
        metadata: { deliverableId },
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `Deliverable ${deliverableId} not found.`,
        metadata: { deliverableId, error: result.error },
      });
    }
  };

  /**
   * Handle list deliverables intent
   */
  const handleListDeliverables = async (content: string) => {
    // Parse filters from content
    const phaseMatch = content.match(/phase-\d+[a-z]?/i);
    const statusMatch = content.match(/\b(pending|in_progress|completed)\b/i);

    const filters = {
      phase: phaseMatch ? phaseMatch[0] : undefined,
      status: statusMatch ? statusMatch[0] : undefined,
    };

    const result = await mcpClient.listDeliverables(filters);

    if (result.success && result.deliverables) {
      const deliverables = result.deliverables;
      addMessage({
        role: 'assistant',
        content:
          `Found **${result.count}** deliverable(s):\n\n` +
          deliverables
            .slice(0, 10)
            .map(
              d =>
                `• **${d.id}**: ${d.name}\n  Phase: ${d.phase} | Status: ${d.status} | Priority: ${d.priority}`,
            )
            .join('\n\n') +
          (deliverables.length > 10 ? `\n\n...and ${deliverables.length - 10} more` : ''),
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `No deliverables found.`,
        metadata: { error: result.error },
      });
    }
  };

  /**
   * Handle get next deliverable intent
   */
  const handleGetNextDeliverable = async (content: string) => {
    const result = await mcpClient.getNextDeliverable();

    if (result.success && result.deliverable) {
      const d = result.deliverable;
      addMessage({
        role: 'assistant',
        content:
          `🎯 **Recommended Next Task:**\n\n` +
          `**${d.id}**: ${d.name}\n\n` +
          `**Phase:** ${d.phase}\n` +
          `**Priority:** ${d.priority}\n` +
          `**Effort:** ${d.estimatedEffort || 'Unknown'}\n` +
          `**Dependencies Met:** ${d.dependenciesMet ? '✅' : '❌'}\n\n` +
          `${d.blockers.length > 0 ? `**Blockers:**\n${d.blockers.map(b => `  • ${b}`).join('\n')}\n\n` : ''}` +
          `Ready to start working on this?`,
        metadata: { deliverableId: d.id },
      });

      setConversationContext({ lastDeliverableId: d.id, lastAction: 'next' });
    } else {
      addMessage({
        role: 'assistant',
        content: result.message || 'No pending deliverables found.',
      });
    }
  };

  /**
   * Handle refresh conversation
   */
  const handleRefresh = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "Hello! I'm your MCP Assistant. I can help you:\n\n" +
          '• Submit completed deliverables\n' +
          '• Validate work before submission\n' +
          '• Check deliverable status\n' +
          '• Find your next recommended task\n' +
          '• List available deliverables\n\n' +
          'What would you like to do?',
        timestamp: new Date(),
      },
    ]);
    setConversationContext({});
  };

  return (
    <Drawer
      anchor='right'
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 450 },
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
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BotIcon />
            <Typography variant='h6'>MCP Assistant</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title='Refresh conversation'>
              <IconButton onClick={handleRefresh} sx={{ color: 'inherit' }}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} sx={{ color: 'inherit' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Status Indicators */}
        <Box sx={{ px: 2, py: 1, bgcolor: 'background.default', display: 'flex', gap: 1 }}>
          <Chip label='Connected' color='success' size='small' variant='outlined' />
          {conversationContext.lastDeliverableId && (
            <Chip
              label={`Context: ${conversationContext.lastDeliverableId}`}
              size='small'
              variant='outlined'
            />
          )}
        </Box>

        <Divider />

        {/* Messages */}
        <ChatMessageList messages={messages} isProcessing={isProcessing} />

        <Divider />

        {/* Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isProcessing}
          placeholder='Ask me anything about deliverables...'
        />
      </Box>
    </Drawer>
  );
};

export default MCPChatPanel;
