// Rate limiting configuration
const rateLimitStore = new Map(); // In-memory store for rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per user

/**
 * Simple rate limiting middleware
 */
function rateLimitMiddleware(req, res, next) {
  try {
    // Get user identifier from IP and user ID (if authenticated)
    const userKey = req.user?.uid || req.ip || req.headers['x-forwarded-for'] || 'anonymous';
    const now = Date.now();
    
    // Clean old entries
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
        rateLimitStore.delete(key);
      }
    }
    
    // Get current user's request data
    const userData = rateLimitStore.get(userKey) || {
      requests: 0,
      firstRequest: now
    };
    
    // Reset window if expired
    if (now - userData.firstRequest > RATE_LIMIT_WINDOW) {
      userData.requests = 0;
      userData.firstRequest = now;
    }
    
    // Check rate limit
    if (userData.requests >= RATE_LIMIT_MAX_REQUESTS) {
      console.warn(`Rate limit exceeded for user: ${userKey}`);
      return res.status(429).json({
        error: {
          message: 'Too many requests, please try again later',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - userData.firstRequest)) / 1000)
        }
      });
    }
    
    // Increment request count
    userData.requests++;
    rateLimitStore.set(userKey, userData);
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX_REQUESTS - userData.requests));
    res.setHeader('X-RateLimit-Reset', Math.ceil((userData.firstRequest + RATE_LIMIT_WINDOW) / 1000));
    
    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // Continue without rate limiting if there's an error
    next();
  }
};

module.exports = { rateLimitMiddleware };