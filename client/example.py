#!/usr/bin/env python3
"""
Suna Client Examples

This script demonstrates various ways to use the Suna Python client
to interact with AI agents and retrieve artifacts.
"""

import os
import time
from suna_client import SunaClient, SunaConfig, SunaAPIError


def example_basic_usage():
    """Basic example: Send a prompt and get response"""
    print("🔰 Example 1: Basic Usage")
    print("-" * 40)
    
    config = SunaConfig(
        backend_url=os.getenv('SUNA_BACKEND_URL'),
        access_token=os.getenv('SUNA_ACCESS_TOKEN'),
        user_id=os.getenv('SUNA_USER_ID')
    )
    
    client = SunaClient(config)
    
    # Simple prompt execution
    result = client.execute_prompt(
        "Create a simple HTML page with a header, navigation, and footer"
    )
    
    if result['success']:
        print(f"✅ Success! Project: {result['project']['name']}")
        print(f"🔗 Sandbox: {result['project']['sandbox'].get('vnc_preview', 'N/A')}")
    else:
        print(f"❌ Failed: {result['error']}")
    
    print()


def example_step_by_step():
    """Step-by-step example: Manual control of each API call"""
    print("🔧 Example 2: Step-by-Step Control")
    print("-" * 40)
    
    config = SunaConfig(
        backend_url=os.getenv('SUNA_BACKEND_URL'),
        access_token=os.getenv('SUNA_ACCESS_TOKEN'),
        user_id=os.getenv('SUNA_USER_ID')
    )
    
    client = SunaClient(config)
    
    try:
        # 1. Health check
        health = client.check_health()
        print(f"Backend status: {health.get('status')}")
        
        # 2. Create project
        project = client.create_project(
            "Custom Web App", 
            "A step-by-step created project"
        )
        
        # 3. Create thread
        thread = client.create_thread(project.id)
        
        # 4. Add multiple messages
        client.add_user_message(
            thread.thread_id, 
            "I want to build a todo application with the following features:"
        )
        
        client.add_user_message(
            thread.thread_id,
            "- Add and remove tasks\n- Mark tasks as complete\n- Filter by status\n- Save to localStorage"
        )
        
        # 5. Start agent with custom options
        agent_run_id = client.start_agent(
            thread.thread_id,
            options={
                'model_name': 'claude-3-7-sonnet-latest',
                'enable_thinking': True,
                'reasoning_effort': 'medium'
            }
        )
        
        # 6. Monitor streaming with custom timeout
        print("Monitoring agent execution...")
        messages = client.stream_agent_response(agent_run_id, timeout=600)
        
        # 7. Get final results
        agent_runs = client.get_agent_runs(thread.thread_id)
        all_messages = client.get_messages(thread.thread_id)
        
        print(f"✅ Completed with {len(agent_runs)} runs and {len(all_messages)} messages")
        print(f"📡 Streamed {len(messages)} real-time messages")
        
        # Display agent run details
        for i, run in enumerate(agent_runs):
            print(f"  Run {i+1}: {run.status}")
            if run.error:
                print(f"    Error: {run.error}")
        
    except SunaAPIError as e:
        print(f"❌ API Error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    
    print()


def example_batch_execution():
    """Batch example: Execute multiple prompts in sequence"""
    print("📦 Example 3: Batch Execution")
    print("-" * 40)
    
    config = SunaConfig(
        backend_url=os.getenv('SUNA_BACKEND_URL'),
        access_token=os.getenv('SUNA_ACCESS_TOKEN'),
        user_id=os.getenv('SUNA_USER_ID')
    )
    
    client = SunaClient(config)
    
    prompts = [
        "Create a simple landing page for a SaaS product",
        "Build a contact form with validation",
        "Design a pricing table with three tiers"
    ]
    
    results = []
    
    for i, prompt in enumerate(prompts, 1):
        print(f"Processing prompt {i}/{len(prompts)}: {prompt[:50]}...")
        
        try:
            result = client.execute_prompt(
                prompt, 
                project_name=f"Batch Task {i}"
            )
            
            results.append({
                'prompt': prompt,
                'success': result['success'],
                'project_id': result.get('project', {}).get('id'),
                'error': result.get('error')
            })
            
            # Brief pause between executions
            time.sleep(2)
            
        except Exception as e:
            results.append({
                'prompt': prompt,
                'success': False,
                'error': str(e)
            })
    
    # Summary report
    successful = sum(1 for r in results if r['success'])
    print(f"\n📊 Batch Summary: {successful}/{len(results)} successful")
    
    for i, result in enumerate(results, 1):
        status = "✅" if result['success'] else "❌"
        print(f"  {status} Task {i}: {result['prompt'][:40]}...")
        if not result['success']:
            print(f"     Error: {result['error']}")
    
    print()


def example_error_handling():
    """Error handling example: Demonstrate various error scenarios"""
    print("⚠️  Example 4: Error Handling")
    print("-" * 40)
    
    # Test with invalid configuration
    invalid_config = SunaConfig(
        backend_url="https://invalid-url.example.com",
        access_token="invalid_token",
        user_id="invalid_user"
    )
    
    client = SunaClient(invalid_config)
    
    print("Testing with invalid configuration...")
    
    try:
        result = client.execute_prompt("This should fail")
        print("Unexpected success!")
    except SunaAPIError as e:
        print(f"✅ Caught expected API error: {e}")
    except Exception as e:
        print(f"✅ Caught expected error: {e}")
    
    # Test individual method errors
    print("\nTesting individual method error handling...")
    
    try:
        client.check_health()
    except Exception as e:
        print(f"✅ Health check failed as expected: {type(e).__name__}")
    
    try:
        client.create_project("Test", "This will fail")
    except Exception as e:
        print(f"✅ Project creation failed as expected: {type(e).__name__}")
    
    print()


def example_sandbox_interaction():
    """Sandbox example: Focus on sandbox features and access"""
    print("🏗️  Example 5: Sandbox Interaction")
    print("-" * 40)
    
    config = SunaConfig(
        backend_url=os.getenv('SUNA_BACKEND_URL'),
        access_token=os.getenv('SUNA_ACCESS_TOKEN'),
        user_id=os.getenv('SUNA_USER_ID')
    )
    
    client = SunaClient(config)
    
    # Create a project that will definitely create a sandbox
    result = client.execute_prompt(
        "Create a Python web server that serves a simple API with endpoints for users and posts",
        project_name="Sandbox Demo"
    )
    
    if result['success']:
        sandbox = result['project']['sandbox']
        
        print("🔧 Sandbox Information:")
        print(f"  ID: {sandbox.get('id', 'Not available')}")
        print(f"  VNC Access: {sandbox.get('vnc_preview', 'Not available')}")
        print(f"  Web Access: {sandbox.get('sandbox_url', 'Not available')}")
        
        if sandbox.get('vnc_preview'):
            print(f"\n🖥️  You can access the visual interface at:")
            print(f"   {sandbox['vnc_preview']}")
            print(f"   (Use this to see the agent working in real-time)")
        
        if sandbox.get('sandbox_url'):
            print(f"\n🌐 Web server will be available at:")
            print(f"   {sandbox['sandbox_url']}")
            print(f"   (Once the agent completes the task)")
    else:
        print(f"❌ Sandbox demo failed: {result['error']}")
    
    print()


def main():
    """Run all examples"""
    print("🚀 Suna Client Examples")
    print("=" * 60)
    
    # Check environment variables
    required_vars = ['SUNA_BACKEND_URL', 'SUNA_ACCESS_TOKEN', 'SUNA_USER_ID']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   {var}")
        print("\nPlease set these variables before running examples.")
        return
    
    print("✅ Environment variables configured")
    print()
    
    # Run examples
    examples = [
        example_basic_usage,
        example_step_by_step,
        example_batch_execution,
        example_error_handling,
        example_sandbox_interaction
    ]
    
    for example in examples:
        try:
            example()
        except KeyboardInterrupt:
            print("\n⏹️  Examples interrupted by user")
            break
        except Exception as e:
            print(f"❌ Example failed: {e}")
            print()
    
    print("🏁 Examples completed!")


if __name__ == '__main__':
    main() 