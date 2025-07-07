const admin = require('firebase-admin');
const config = require('../utils/config');

// Multi-project Firebase authentication
const firebaseApps = new Map();

/**
 * Initialize Firebase app for a specific project
 */
function initializeFirebaseApp(projectId) {
  if (firebaseApps.has(projectId)) {
    return firebaseApps.get(projectId);
  }

  try {
    const app = admin.initializeApp({
      projectId: projectId
    }, projectId);
    
    firebaseApps.set(projectId, app);
    console.log(`Initialized Firebase app for project: ${projectId}`);
    return app;
  } catch (error) {
    console.error(`Failed to initialize Firebase app for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Verify Firebase token from any allowed project
 */
async function verifyFirebaseToken(token) {
  if (!token) {
    throw new Error('No authentication token provided');
  }

  // Try each allowed project to verify the token
  for (const projectId of config.allowed_projects) {
    if (!projectId.trim()) continue;
    
    try {
      const app = initializeFirebaseApp(projectId);
      const auth = admin.auth(app);
      const decoded = await auth.verifyIdToken(token);
      
      // Optional: Check organization domain
      if (config.org_domain && decoded.email) {
        if (!decoded.email.endsWith(`@${config.org_domain}`)) {
          console.warn(`User ${decoded.email} not from organization domain ${config.org_domain}`);
          // Uncomment to enforce: throw new Error('User not from allowed organization');
        }
      }
      
      console.log(`Token verified for user ${decoded.email} from project ${projectId}`);
      return {
        uid: decoded.uid,
        email: decoded.email,
        projectId: projectId,
        decodedToken: decoded
      };
    } catch (error) {
      console.log(`Token verification failed for project ${projectId}: ${error.message}`);
      continue;
    }
  }
  
  throw new Error('Token verification failed for all allowed projects');
}

/**
 * Middleware to authenticate requests
 */
async function authenticateRequest(req, res, next) {
  try {
    let token = null;
    
    // Try to get token from Authorization header first (preferred)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Fallback to secure cookie for SSE streams (since EventSource can't send headers)
      const cookies = req.headers.cookie;
      if (cookies) {
        const cookieMatch = cookies.match(/flowagent_auth=([^;]+)/);
        if (cookieMatch) {
          token = cookieMatch[1];
        }
      }
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Missing authentication token (header or cookie)' });
    }
    
    const user = await verifyFirebaseToken(token);
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication failed:', error);
    res.status(401).json({ error: 'Authentication failed: ' + error.message });
  }
}

module.exports = { authenticateRequest, verifyFirebaseToken, initializeFirebaseApp };