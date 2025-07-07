// Error handling utilities
const ErrorHandler = {
  /**
   * Generate unique error ID for tracking
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Sanitize error messages for client response
   */
  sanitizeErrorMessage(error, isDevelopment = false) {
    if (isDevelopment) {
      return error.message || 'Unknown error occurred';
    }

    // Map internal errors to safe public messages
    const errorMap = {
      'ValidationError': 'Invalid input provided',
      'AuthenticationError': 'Authentication failed',
      'AuthorizationError': 'Access denied',
      'NotFoundError': 'Resource not found',
      'TimeoutError': 'Request timed out',
      'RateLimitError': 'Too many requests, please try again later',
      'ServiceUnavailableError': 'Service temporarily unavailable'
    };

    const errorType = error.constructor.name;
    return errorMap[errorType] || 'An unexpected error occurred';
  },

  /**
   * Get appropriate HTTP status code for error
   */
  getStatusCode(error) {
    const statusMap = {
      'ValidationError': 400,
      'AuthenticationError': 401,
      'AuthorizationError': 403,
      'NotFoundError': 404,
      'TimeoutError': 408,
      'RateLimitError': 429,
      'ServiceUnavailableError': 503
    };

    return statusMap[error.constructor.name] || 500;
  },

  /**
   * Create standardized error response
   */
  createErrorResponse(error, context = '') {
    const errorId = this.generateErrorId();
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // Log full error details
    console.error(`[${errorId}] Error in ${context}:`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Return sanitized response
    return {
      error: {
        id: errorId,
        message: this.sanitizeErrorMessage(error, isDevelopment),
        code: error.code || 'INTERNAL_ERROR',
        ...(isDevelopment && { details: error.message })
      }
    };
  },

  /**
   * Async error wrapper for endpoints
   */
  asyncHandler(fn) {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        const statusCode = this.getStatusCode(error);
        const errorResponse = this.createErrorResponse(error, req.path);
        res.status(statusCode).json(errorResponse);
      }
    };
  }
};

module.exports = { ErrorHandler };