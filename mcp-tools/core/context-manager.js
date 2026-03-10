/**
 * Context Manager Tool
 * Manages conversation context and maintains state across interactions
 */

export const contextManagerTool = {
  name: 'context-manager',
  description: 'Manages conversation context and maintains interaction state',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['store', 'retrieve', 'update', 'clear', 'summary'],
        description: 'Context management action to perform',
      },
      contextKey: {
        type: 'string',
        description: 'Key identifier for the context',
      },
      data: { type: 'object', description: 'Context data to store or update' },
      options: {
        type: 'object',
        properties: {
          ttl: { type: 'number', description: 'Time to live in seconds' },
          maxSize: {
            type: 'number',
            description: 'Maximum context size in bytes',
          },
          includeHistory: {
            type: 'boolean',
            description: 'Include interaction history',
          },
        },
      },
    },
    required: ['action'],
  },

  async execute(input) {
    const { action, contextKey, data, options = {} } = input;

    switch (action) {
      case 'store':
        return await storeContext(contextKey, data, options);
      case 'retrieve':
        return await retrieveContext(contextKey, options);
      case 'update':
        return await updateContext(contextKey, data, options);
      case 'clear':
        return await clearContext(contextKey, options);
      case 'summary':
        return await getContextSummary(contextKey, options);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
};

// Simulated context store
const contextStore = new Map();
const contextHistory = new Map();

async function storeContext(contextKey, data, options) {
  if (!contextKey) {
    throw new Error('Context key is required for store operation');
  }

  const contextData = {
    key: contextKey,
    data,
    timestamp: new Date().toISOString(),
    ttl: options.ttl,
    size: JSON.stringify(data).length,
  };

  // Check size limits
  if (options.maxSize && contextData.size > options.maxSize) {
    throw new Error(
      `Context size (${contextData.size}) exceeds maximum (${options.maxSize})`
    );
  }

  contextStore.set(contextKey, contextData);

  // Add to history
  if (!contextHistory.has(contextKey)) {
    contextHistory.set(contextKey, []);
  }
  contextHistory.get(contextKey).push({
    action: 'store',
    timestamp: contextData.timestamp,
    size: contextData.size,
  });

  return {
    success: true,
    action: 'store',
    context: {
      key: contextKey,
      stored: true,
      size: contextData.size,
      timestamp: contextData.timestamp,
      ttl: options.ttl,
    },
    message: `Context ${contextKey} stored successfully`,
  };
}

async function retrieveContext(contextKey, options) {
  if (!contextKey) {
    throw new Error('Context key is required for retrieve operation');
  }

  const contextData = contextStore.get(contextKey);

  if (!contextData) {
    return {
      success: false,
      action: 'retrieve',
      context: null,
      message: `Context ${contextKey} not found`,
    };
  }

  // Check TTL
  if (contextData.ttl) {
    const expiryTime =
      new Date(contextData.timestamp).getTime() + contextData.ttl * 1000;
    if (Date.now() > expiryTime) {
      contextStore.delete(contextKey);
      return {
        success: false,
        action: 'retrieve',
        context: null,
        message: `Context ${contextKey} has expired`,
      };
    }
  }

  const result = {
    success: true,
    action: 'retrieve',
    context: {
      key: contextKey,
      data: contextData.data,
      timestamp: contextData.timestamp,
      size: contextData.size,
    },
    message: `Context ${contextKey} retrieved successfully`,
  };

  // Include history if requested
  if (options.includeHistory) {
    result.context.history = contextHistory.get(contextKey) || [];
  }

  return result;
}

async function updateContext(contextKey, data, options) {
  if (!contextKey) {
    throw new Error('Context key is required for update operation');
  }

  const existingContext = contextStore.get(contextKey);

  if (!existingContext) {
    return {
      success: false,
      action: 'update',
      context: null,
      message: `Context ${contextKey} not found for update`,
    };
  }

  // Merge data
  const updatedData = { ...existingContext.data, ...data };
  const contextData = {
    key: contextKey,
    data: updatedData,
    timestamp: new Date().toISOString(),
    ttl: options.ttl || existingContext.ttl,
    size: JSON.stringify(updatedData).length,
  };

  contextStore.set(contextKey, contextData);

  // Add to history
  contextHistory.get(contextKey).push({
    action: 'update',
    timestamp: contextData.timestamp,
    size: contextData.size,
  });

  return {
    success: true,
    action: 'update',
    context: {
      key: contextKey,
      updated: true,
      size: contextData.size,
      timestamp: contextData.timestamp,
    },
    message: `Context ${contextKey} updated successfully`,
  };
}

async function clearContext(contextKey, _options) {
  if (contextKey) {
    // Clear specific context
    const existed = contextStore.has(contextKey);
    contextStore.delete(contextKey);
    contextHistory.delete(contextKey);

    return {
      success: true,
      action: 'clear',
      context: {
        key: contextKey,
        cleared: existed,
      },
      message: existed
        ? `Context ${contextKey} cleared`
        : `Context ${contextKey} was not found`,
    };
  } else {
    // Clear all contexts
    const count = contextStore.size;
    contextStore.clear();
    contextHistory.clear();

    return {
      success: true,
      action: 'clear',
      context: {
        clearedCount: count,
      },
      message: `All contexts cleared (${count} items)`,
    };
  }
}

async function getContextSummary(contextKey, _options) {
  if (contextKey) {
    // Summary for specific context
    const contextData = contextStore.get(contextKey);
    const history = contextHistory.get(contextKey) || [];

    if (!contextData) {
      return {
        success: false,
        action: 'summary',
        summary: null,
        message: `Context ${contextKey} not found`,
      };
    }

    return {
      success: true,
      action: 'summary',
      summary: {
        key: contextKey,
        size: contextData.size,
        created: history[0]?.timestamp || contextData.timestamp,
        lastModified: contextData.timestamp,
        operations: history.length,
        ttl: contextData.ttl,
        dataKeys: Object.keys(contextData.data || {}),
      },
      message: `Summary for context ${contextKey}`,
    };
  } else {
    // Summary for all contexts
    const contexts = Array.from(contextStore.entries()).map(([key, data]) => ({
      key,
      size: data.size,
      timestamp: data.timestamp,
      ttl: data.ttl,
    }));

    const totalSize = contexts.reduce((sum, ctx) => sum + ctx.size, 0);

    return {
      success: true,
      action: 'summary',
      summary: {
        totalContexts: contexts.length,
        totalSize,
        contexts: contexts.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        ),
      },
      message: `Summary for all contexts (${contexts.length} items)`,
    };
  }
}
