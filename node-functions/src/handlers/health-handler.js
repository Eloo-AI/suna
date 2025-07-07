const functions = require('@google-cloud/functions-framework');
const axios = require('axios');
const config = require('../utils/config');
const { corsMiddleware } = require('../middleware/cors');
const { ErrorHandler } = require('../middleware/error-handler');

/**
 * Health check function
 * GET /health
 * Returns: { status: string, timestamp: string, instance_id: string }
 */
functions.http('health', ErrorHandler.asyncHandler(async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      // Call backend health endpoint
      const response = await axios.get(`${config.backend_url}/api/health`);
      
      // Return backend health response
      res.json({
        success: true,
        ...response.data
      });
      
    } catch (error) {
      // If backend is down, return local health status
      console.warn('Backend health check failed:', error.message);
      res.json({
        success: false,
        status: 'degraded',
        timestamp: new Date().toISOString(),
        instance_id: 'cloud-function',
        error: 'Backend unavailable',
        config: {
          backend_url: config.backend_url,
          allowed_projects: config.allowed_projects,
          org_domain: config.org_domain
        }
      });
    }
  });
}));

module.exports = {
  // Helper functions (if any)
};