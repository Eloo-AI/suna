# Firebase Functions Setup for Suna Client

## Prerequisites

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

## Project Setup

1. **Initialize Firebase Project**:
   ```bash
   mkdir suna-firebase-functions
   cd suna-firebase-functions
   firebase init functions
   ```
   - Choose JavaScript (not TypeScript for simplicity)
   - Install dependencies when prompted

2. **Project Structure**:
   ```
   suna-firebase-functions/
   ├── functions/
   │   ├── index.js          # Your main functions (copy from firebase_functions_example.js)
   │   ├── package.json      # Dependencies
   │   └── .env              # Local config (optional)
   ├── firebase.json         # Firebase config
   └── .firebaserc          # Project config
   ```

## Dependencies

Add to `functions/package.json`:

```json
{
  "name": "functions",
  "description": "Suna Client Firebase Functions",
  "scripts": {
    "lint": "eslint .",
    "serve": "firebase emulators:start --only functions",
    "shell": "firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "18"
  },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.7.0",
    "axios": "^1.6.7",
    "form-data": "^4.0.0"
  },
  "devDependencies": {
    "eslint": "^8.56.0",
    "eslint-config-google": "^0.14.0"
  },
  "private": true
}
```

## Configuration

1. **Set Firebase Config Variables**:
   ```bash
   firebase functions:config:set \
     suna.backend_url="http://34.171.125.26:8000" \
     suna.supabase_url="https://nmwqprgbxtnikkmwhwyt.supabase.co" \
     suna.supabase_anon_key="your_supabase_anon_key"
   ```

2. **For Local Development** (functions/.env):
   ```
   BACKEND_URL=http://34.171.125.26:8000
   SUPABASE_URL=https://nmwqprgbxtnikkmwhwyt.supabase.co
   SUPABASE_ANON_KEY=your_key_here
   ```

## Deployment

1. **Test Locally**:
   ```bash
   cd functions
   npm install
   firebase emulators:start --only functions
   ```

2. **Deploy to Firebase**:
   ```bash
   firebase deploy --only functions
   ```

## Usage Examples

### 1. Using Firebase SDK (Recommended)

```javascript
// In your web app
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

// Initiate agent
const initiateAgent = httpsCallable(functions, 'initiateAgent');
const result = await initiateAgent({
  prompt: "Create a hello world script",
  email: "your-email@example.com",
  password: "your-password"
});

console.log('Agent initiated:', result.data);

// Poll for completion
const pollAndDownload = httpsCallable(functions, 'pollAndDownload');
const pollResult = await pollAndDownload({
  agent_run_id: result.data.agent_run_id,
  email: "your-email@example.com", 
  password: "your-password"
});

console.log('Poll result:', pollResult.data);

// Stop and delete
const stopAndDeleteSandbox = httpsCallable(functions, 'stopAndDeleteSandbox');
const stopResult = await stopAndDeleteSandbox({
  agent_run_id: result.data.agent_run_id,
  email: "your-email@example.com",
  password: "your-password"
});
```

### 2. Using REST API

Your functions will be available at:
- `https://us-central1-your-project.cloudfunctions.net/api/initiate`
- `https://us-central1-your-project.cloudfunctions.net/api/poll`
- `https://us-central1-your-project.cloudfunctions.net/api/stop-sandbox`

```javascript
// POST to /api/initiate
const response = await fetch('https://us-central1-your-project.cloudfunctions.net/api/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: "Create a hello world script",
    email: "your-email@example.com",
    password: "your-password"
  })
});

const result = await response.json();
```

## Key Advantages of This Firebase Setup

### ✅ **Enhanced Features**:
1. **Firestore Integration** - All agent runs tracked in database
2. **Automatic Cleanup** - Scheduled function removes old runs
3. **Better Error Handling** - Structured error responses
4. **Logging** - Firebase Functions logging for debugging
5. **Scalability** - Auto-scaling based on demand
6. **Security** - Built-in authentication and HTTPS

### ✅ **Multiple Access Methods**:
- **Callable Functions** - For web/mobile apps with Firebase SDK
- **HTTP Endpoints** - For external systems, cURL, etc.
- **Scheduled Functions** - For maintenance tasks

### ✅ **Firebase Ecosystem Benefits**:
- **Firebase Auth Integration** - Can replace Supabase auth if needed
- **Firebase Security Rules** - Control access to Firestore data
- **Firebase Hosting** - Host your web interface
- **Firebase Extensions** - Add-ons like image processing, etc.

## Migration Strategy

1. **Start with Node.js Functions** (recommended)
2. **Test locally** with Firebase emulators
3. **Deploy to staging** environment first
4. **Migrate authentication** to Firebase Auth (optional)
5. **Add web interface** using Firebase Hosting
6. **Scale** as needed with more sophisticated features

This approach gives you all the functionality of your Python client with better integration, monitoring, and scalability. 