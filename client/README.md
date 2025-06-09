# Suna Python Client

A Python client that replicates the frontend's API flow to interact with the Suna backend, allowing you to send prompts to AI agents and retrieve final artifacts programmatically.

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables:
```bash
export SUNA_BACKEND_URL="https://your-backend-url.com"
export SUNA_ACCESS_TOKEN="your_jwt_access_token"
export SUNA_USER_ID="your_user_account_id"
```

## Usage

### Command Line

```bash
# Basic usage
python suna_client.py "Create a simple website with a contact form"

# With custom project name
python suna_client.py "Build a todo app" --project-name "My Todo Project"

# Save results to file
python suna_client.py "Analyze this data" --output results.json
```

### Python API

```python
from suna_client import SunaClient, SunaConfig

# Configure client
config = SunaConfig(
    backend_url="https://your-backend-url.com",
    access_token="your_jwt_token",
    user_id="your_user_id"
)

client = SunaClient(config)

# Execute prompt and get results
result = client.execute_prompt("Create a landing page for a SaaS product")

if result['success']:
    print(f"Project created: {result['project']['id']}")
    print(f"Sandbox available at: {result['project']['sandbox'].get('vnc_preview')}")
    print(f"Agent completed with {len(result['agent_runs'])} runs")
else:
    print(f"Execution failed: {result['error']}")
```

## API Flow

The client follows the same flow as the frontend:

1. **Health Check** - Verify backend availability
2. **Project Creation** - Create a new project container
3. **Sandbox Activation** - Ensure Daytona sandbox is ready
4. **Thread Creation** - Create conversation thread
5. **Message Addition** - Add user prompt to thread
6. **Agent Execution** - Start AI agent with specified model
7. **Real-time Streaming** - Stream agent responses via SSE
8. **Final Collection** - Gather all results and artifacts

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUNA_BACKEND_URL` | Backend API endpoint | `https://api.suna.dev` |
| `SUNA_ACCESS_TOKEN` | JWT authentication token | `eyJ0eXAiOiJKV1QiLCJhbGciOi...` |
| `SUNA_USER_ID` | User account identifier | `user_123abc` |

### Getting Authentication Tokens

To get your authentication credentials:

1. **Access Token**: Extract from frontend browser dev tools
   - Open Network tab in browser dev tools
   - Make any API request in the frontend
   - Copy the `Authorization: Bearer <token>` value

2. **User ID**: Found in Supabase user management or API responses

## Response Format

```python
{
    'success': True,
    'project': {
        'id': 'proj_abc123',
        'name': 'AI Task 1234abcd', 
        'sandbox': {
            'id': 'sandbox_xyz789',
            'vnc_preview': 'https://vnc-access-url',
            'sandbox_url': 'https://web-access-url'
        }
    },
    'thread_id': 'thread_def456',
    'agent_run_id': 'run_ghi789',
    'prompt': 'Your original prompt',
    'stream_messages': [...],  # Real-time stream data
    'agent_runs': [...],       # Agent execution results
    'all_messages': [...],     # Complete conversation
}
```

## Advanced Usage

### Custom Agent Options

```python
# Start agent with custom configuration
agent_run_id = client.start_agent(
    thread_id, 
    options={
        'model_name': 'claude-3-7-sonnet-latest',
        'enable_thinking': True,
        'reasoning_effort': 'high',
        'stream': True
    }
)
```

### Individual API Methods

```python
# Health check
health = client.check_health()

# Create project
project = client.create_project("My Project", "Description")

# Create thread
thread = client.create_thread(project.id)

# Add message
client.add_user_message(thread.thread_id, "Hello agent!")

# Start agent
agent_run_id = client.start_agent(thread.thread_id)

# Stream responses
messages = client.stream_agent_response(agent_run_id)

# Get final results
runs = client.get_agent_runs(thread.thread_id)
all_messages = client.get_messages(thread.thread_id)
```

## Error Handling

The client includes comprehensive error handling:

- **Authentication Errors** (401): Invalid or expired tokens
- **Billing Errors** (402): Payment required for agent execution
- **Network Errors**: Connection timeouts and failures
- **API Errors**: Various backend error conditions

```python
try:
    result = client.execute_prompt("My prompt")
except SunaAPIError as e:
    print(f"API Error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Sandbox Integration

The client automatically handles Daytona sandbox management:

- **Sandbox Activation**: Ensures sandbox is running before agent execution
- **VNC Access**: Provides visual interface URLs for debugging
- **Web Access**: Direct access to sandbox web services
- **File Management**: Access to sandbox file system through agent tools

## Streaming

Real-time streaming provides immediate feedback:

- **Progress Updates**: Tool execution and thinking progress
- **Intermediate Results**: Partial outputs and artifacts
- **Error Messages**: Real-time error reporting
- **Completion Signals**: Automatic termination detection

## Limitations

- Requires valid authentication tokens
- Dependent on backend availability and Daytona sandbox infrastructure
- Streaming timeout of 5 minutes (300 seconds) by default
- Network connectivity required for real-time streaming

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify `SUNA_ACCESS_TOKEN` is valid and not expired
   - Check `SUNA_USER_ID` matches the token's user

2. **Backend Unreachable**
   - Confirm `SUNA_BACKEND_URL` is correct
   - Test network connectivity to backend

3. **Streaming Timeout**
   - Increase timeout in `stream_agent_response(timeout=600)`
   - Check for complex prompts requiring more processing time

4. **Sandbox Issues**
   - Sandbox activation may take time for first use
   - Check Daytona service availability

### Debug Mode

Enable verbose logging by setting environment variable:
```bash
export SUNA_DEBUG=1
python suna_client.py "Your prompt" --verbose
``` 