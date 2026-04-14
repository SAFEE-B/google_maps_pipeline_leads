const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const GeminiServiceClass = require('../services/geminiService');
const logger = require('../utils/logger');

const router = express.Router();

// Store conversation context (in production, use Redis or database)
const conversationContexts = new Map();

// Initialize Gemini service
let geminiService;
try {
  geminiService = new GeminiServiceClass();
  logger.info('Gemini service initialized successfully');
} catch (error) {
  logger.error('Failed to initialize Gemini service:', error);
  // Fallback to basic responses if Gemini fails
  geminiService = null;
}

// Validation schemas
const conversationSchema = Joi.object({
  message: Joi.string().required(),
  conversationId: Joi.string().optional(),
  userId: Joi.string().optional()
});

// Main conversation endpoint for LLM integration
router.post('/chat', async (req, res) => {
  try {
    const { error, value } = conversationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const { message, conversationId, userId = 'default' } = value;
    const currentConversationId = conversationId || uuidv4();
    
    // Get or create conversation context
    let context = conversationContexts.get(currentConversationId) || {
      id: currentConversationId,
      userId,
      messages: [],
      state: 'active'
    };

    // Add user message to context
    context.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    let response;
    
    if (geminiService) {
      try {
        // Use Gemini for intelligent conversation
        response = await geminiService.processConversation(message, context.messages);
        
        logger.info(`Gemini processed message successfully`, {
          conversationId: currentConversationId,
          userId,
          messageLength: message.length,
          responseType: response.type,
          toolCallsCount: response.toolCalls ? response.toolCalls.length : 0
        });
        
      } catch (geminiError) {
        logger.error('Gemini processing failed, falling back to basic response:', geminiError);
        response = getFallbackResponse(message);
      }
    } else {
      // Fallback if Gemini is not available
      response = getFallbackResponse(message);
    }
    
    // Add assistant response to context
    context.messages.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      toolCalls: response.toolCalls || [],
      type: response.type || 'text'
    });

    // Update context
    conversationContexts.set(currentConversationId, context);

    res.json({
      success: true,
      conversationId: currentConversationId,
      message: response.message,
      type: response.type || 'text',
      toolCalls: response.toolCalls || [],
      suggestions: response.suggestions || []
    });

  } catch (error) {
    logger.error('Error processing conversation:', error);
    res.status(500).json({ 
      error: 'Failed to process conversation',
      message: error.message
    });
  }
});

// Get conversation history
router.get('/history/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const context = conversationContexts.get(conversationId);

    if (!context) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation: context
    });

  } catch (error) {
    logger.error('Error getting conversation history:', error);
    res.status(500).json({ 
      error: 'Failed to get conversation history',
      message: error.message
    });
  }
});

// Clear conversation context
router.delete('/clear/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    conversationContexts.delete(conversationId);
    
    res.json({
      success: true,
      message: 'Conversation cleared'
    });

  } catch (error) {
    logger.error('Error clearing conversation:', error);
    res.status(500).json({ 
      error: 'Failed to clear conversation',
      message: error.message
    });
  }
});

// Health check for Gemini service
router.get('/health', async (req, res) => {
  try {
    const isGeminiAvailable = geminiService !== null;
    
    res.json({
      success: true,
      geminiAvailable: isGeminiAvailable,
      activeConversations: conversationContexts.size,
      status: isGeminiAvailable ? 'Gemini AI ready' : 'Fallback mode'
    });

  } catch (error) {
    logger.error('Error checking conversation health:', error);
    res.status(500).json({ 
      error: 'Failed to check health',
      message: error.message
    });
  }
});

// Fallback response when Gemini is not available
function getFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('lead') && lowerMessage.includes('count')) {
    return {
      type: 'fallback',
      message: "I'd love to help you check lead counts, but I need my AI capabilities enabled. Please ensure the GEMINI_API_KEY is configured.",
      suggestions: ["Check server configuration", "Set up Gemini API key"]
    };
  }

  if (lowerMessage.includes('scrape') || lowerMessage.includes('find')) {
    return {
      type: 'fallback', 
      message: "Scraping functionality requires AI integration. Please configure the Gemini API to enable intelligent lead generation.",
      suggestions: ["Configure API keys", "Check system status"]
    };
  }

  return {
    type: 'fallback',
    message: "I'm currently running in basic mode. To unlock full AI capabilities including intelligent lead management, please configure the Gemini API key.",
    suggestions: [
      "Set GEMINI_API_KEY environment variable",
      "Restart the server",
      "Check the documentation"
    ]
  };
}

module.exports = router; 