#!/usr/bin/env python
"""
Script to check Daytona sandbox logs for debugging.

Usage:
    python check_sandbox_logs.py <sandbox_id>
"""

import asyncio
import sys
import os
from dotenv import load_dotenv

# Load script-specific environment variables
load_dotenv(".env")

from sandbox.sandbox import daytona
from utils.logger import logger
from daytona_sdk import SessionExecuteRequest

async def check_sandbox_logs(sandbox_id: str):
    """
    Check logs and status for a specific Daytona sandbox.
    
    Args:
        sandbox_id: The sandbox ID to check
    """
    try:
        print(f"🔍 Checking sandbox: {sandbox_id}")
        print(f"Daytona Server: {os.getenv('DAYTONA_SERVER_URL', 'Not set')}")
        print("=" * 50)
        
        # Get the sandbox
        print("📦 Getting sandbox information...")
        sandbox = daytona.get_current_sandbox(sandbox_id)
        
        # Check sandbox info and state
        print("ℹ️  Getting sandbox status...")
        sandbox_info = sandbox.info()
        
        print(f"📊 Sandbox Status:")
        print(f"   ID: {sandbox.id}")
        print(f"   State: {sandbox_info.state}")
        print(f"   Created: {getattr(sandbox_info, 'created', 'N/A')}")
        print(f"   Updated: {getattr(sandbox_info, 'updated', 'N/A')}")
        if hasattr(sandbox_info, 'image'):
            print(f"   Image: {sandbox_info.image}")
        if hasattr(sandbox_info, 'labels'):
            print(f"   Labels: {sandbox_info.labels}")
        print()
        
        # Test basic responsiveness with a simple command
        print("🏃 Testing sandbox responsiveness:")
        try:
            # Create a test session
            test_session_id = "health-check-test"
            sandbox.process.create_session(test_session_id)
            print(f"   ✅ Successfully created session: {test_session_id}")
            
            # Execute a simple command
            print("   🔄 Executing test command...")
            result = sandbox.process.execute_session_command(
                test_session_id, 
                SessionExecuteRequest(
                    command="echo 'Sandbox is responsive!' && date && whoami && pwd",
                    var_async=False
                )
            )
            
            print("   ✅ Command executed successfully!")
            if hasattr(result, 'output') and result.output:
                print("   📤 Command output:")
                for line in str(result.output).split('\n'):
                    if line.strip():
                        print(f"      {line}")
            
            # Clean up test session
            try:
                sandbox.process.delete_session(test_session_id)
                print(f"   🧹 Cleaned up test session")
            except Exception as cleanup_error:
                print(f"   ⚠️  Warning: Could not clean up session: {cleanup_error}")
            
        except Exception as e:
            print(f"   ❌ Sandbox connectivity issue: {str(e)}")
        
        # Check if we can access the file system
        print("\n📁 Testing file system access:")
        try:
            workspace_files = sandbox.fs.list_files("/workspace")
            print(f"   ✅ Can access /workspace directory")
            print(f"   📂 Found {len(workspace_files)} items in /workspace")
            
            # Show first few files
            for i, file in enumerate(workspace_files[:5]):
                file_type = "📁" if file.is_dir else "📄"
                print(f"      {file_type} {file.name}")
            
            if len(workspace_files) > 5:
                print(f"      ... and {len(workspace_files) - 5} more items")
                
        except Exception as e:
            print(f"   ❌ File system access issue: {str(e)}")
        
        # Try to check running processes
        print("\n🔍 Checking running processes:")
        try:
            # Create a session to check processes
            process_session_id = "process-check"
            sandbox.process.create_session(process_session_id)
            
            # Check what's running
            result = sandbox.process.execute_session_command(
                process_session_id,
                SessionExecuteRequest(
                    command="ps aux | head -15",
                    var_async=False
                )
            )
            
            if hasattr(result, 'output') and result.output:
                print("   📋 Running processes:")
                for line in str(result.output).split('\n'):
                    if line.strip():
                        print(f"      {line}")
            
            # Clean up
            sandbox.process.delete_session(process_session_id)
            
        except Exception as e:
            print(f"   ❌ Could not check processes: {str(e)}")
        
        # Check for supervisor/services
        print("\n🛠️  Checking services status:")
        try:
            service_session_id = "service-check"
            sandbox.process.create_session(service_session_id)
            
            # Check supervisorctl status
            result = sandbox.process.execute_session_command(
                service_session_id,
                SessionExecuteRequest(
                    command="supervisorctl status 2>/dev/null || echo 'Supervisord not available'",
                    var_async=False
                )
            )
            
            if hasattr(result, 'output') and result.output:
                print("   🔧 Supervisor status:")
                for line in str(result.output).split('\n'):
                    if line.strip():
                        print(f"      {line}")
            
            # Clean up
            sandbox.process.delete_session(service_session_id)
            
        except Exception as e:
            print(f"   ❌ Could not check services: {str(e)}")
        
        print("\n" + "=" * 50)
        print("✅ Sandbox diagnostic completed!")
        
    except Exception as e:
        logger.error(f"Error checking sandbox {sandbox_id}: {str(e)}")
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

async def main():
    """Main function to run the script."""
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <sandbox_id>")
        sys.exit(1)
    
    sandbox_id = sys.argv[1]
    await check_sandbox_logs(sandbox_id)

if __name__ == "__main__":
    asyncio.run(main()) 