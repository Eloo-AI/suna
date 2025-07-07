// Input validation utilities
const InputValidator = {
  /**
   * Validate and sanitize thread ID
   */
  validateThreadId(threadId) {
    if (!threadId || typeof threadId !== 'string') {
      throw new Error('Thread ID is required and must be a string');
    }
    
    // UUID v4 format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(threadId)) {
      throw new Error('Invalid thread ID format');
    }
    
    return threadId.toLowerCase();
  },

  /**
   * Validate prompt input
   */
  validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }
    
    if (prompt.length < 10) {
      throw new Error('Prompt must be at least 10 characters long');
    }
    
    if (prompt.length > 50000) {
      throw new Error('Prompt exceeds maximum length of 50,000 characters');
    }
    
    // Remove potentially dangerous content
    const sanitized = prompt
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .trim();
    
    return sanitized;
  },

  /**
   * Validate expected files array
   */
  validateExpectedFiles(expectedFiles) {
    if (!Array.isArray(expectedFiles)) {
      throw new Error('Expected files must be an array');
    }
    
    if (expectedFiles.length > 20) {
      throw new Error('Too many expected files (maximum 20)');
    }
    
    const validatedFiles = expectedFiles.map(fileName => {
      if (!fileName || typeof fileName !== 'string') {
        throw new Error('File name must be a non-empty string');
      }
      
      // Validate file name format
      const fileNameRegex = /^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+$/;
      if (!fileNameRegex.test(fileName)) {
        throw new Error(`Invalid file name format: ${fileName}`);
      }
      
      // Check for path traversal
      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        throw new Error(`Invalid file name (path traversal detected): ${fileName}`);
      }
      
      return fileName.toLowerCase();
    });
    
    // Check for duplicates
    const unique = [...new Set(validatedFiles)];
    if (unique.length !== validatedFiles.length) {
      throw new Error('Duplicate file names detected');
    }
    
    return validatedFiles;
  },

  /**
   * Validate model name
   */
  validateModelName(modelName) {
    if (!modelName || typeof modelName !== 'string') {
      return 'claude-sonnet-4'; // Default
    }
    
    const allowedModels = [
      'claude-sonnet-4',
      'claude-haiku-3',
      'claude-opus-3',
      'gpt-4',
      'gpt-3.5-turbo'
    ];
    
    if (!allowedModels.includes(modelName)) {
      throw new Error(`Invalid model name. Allowed models: ${allowedModels.join(', ')}`);
    }
    
    return modelName;
  },

  /**
   * Validate chat message
   */
  validateMessage(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message is required and must be a string');
    }
    
    if (message.length < 1) {
      throw new Error('Message cannot be empty');
    }
    
    if (message.length > 10000) {
      throw new Error('Message exceeds maximum length of 10,000 characters');
    }
    
    // Sanitize message
    const sanitized = message
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
    
    return sanitized;
  }
};

module.exports = { InputValidator };