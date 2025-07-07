// Main entry point for Suna Cloud Functions
// This file loads the refactored modular architecture from src/

// Load all function handlers from the new modular structure
require('./src/index.js');

// All Cloud Functions are automatically registered when handlers are imported
// The functions-framework will discover and register them automatically