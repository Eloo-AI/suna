// Main entry point for Cloud Functions
// This file imports and registers all function handlers

// Initialize tracing for distributed tracing
require('@google-cloud/trace-agent').start();

// Import all handlers
require('./handlers/agent-handlers');
require('./handlers/health-handler');

// All functions are automatically registered when the handlers are imported
// No additional exports needed as functions-framework handles registration