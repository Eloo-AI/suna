const cors = require('cors');

// CORS configuration - Security hardened
const getAllowedOrigins = () => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) {
    return allowedOrigins.split(',').map(origin => origin.trim());
  }
  
  // Default to localhost for development
  const defaultOrigins = [
    'http://localhost:8080',
    'https://agents.imagen-ai.elooai.app'
  ];
  
  console.warn('ALLOWED_ORIGINS not set, using default development origins:', defaultOrigins);
  return defaultOrigins;
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Trace-ID'],
  credentials: true,
  maxAge: 86400 // Cache preflight for 24 hours
};

const corsMiddleware = cors(corsOptions);

module.exports = { corsMiddleware, getAllowedOrigins };