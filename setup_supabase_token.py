#!/usr/bin/env python3
"""
Supabase setup script that uses access token instead of interactive login
Run this after getting your personal access token from Supabase dashboard
"""

import subprocess
import sys
import os
import re

def run_command(cmd, cwd=None):
    """Run a command and handle errors"""
    try:
        result = subprocess.run(cmd, check=True, cwd=cwd, capture_output=True, text=True)
        print(f"✅ Command succeeded: {' '.join(cmd)}")
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"❌ Command failed: {' '.join(cmd)}")
        print(f"Error: {e.stderr}")
        sys.exit(1)

def main():
    print("🔧 Supabase Database Setup with Token Authentication")
    print("=" * 50)
    
    # Get token from user
    print("Get your Personal Access Token from:")
    print("1. Go to https://app.supabase.com/")
    print("2. Click your profile picture (top-right)")
    print("3. Go to 'Access tokens'")
    print("4. Create a new token")
    print()
    
    token = input("Enter your Supabase Personal Access Token: ").strip()
    if not token:
        print("❌ Token is required!")
        sys.exit(1)
    
    # Get project reference
    project_ref = input("Enter your Supabase project reference (from your project URL): ").strip()
    if not project_ref:
        print("❌ Project reference is required!")
        sys.exit(1)
    
    # Change to backend directory
    backend_dir = os.path.join(os.getcwd(), 'backend')
    if not os.path.exists(backend_dir):
        print("❌ Backend directory not found!")
        sys.exit(1)
    
    print(f"📁 Working in: {backend_dir}")
    
    # Login with token
    print("🔑 Authenticating with Supabase...")
    run_command(['supabase', 'login', '--token', token])
    
    # Link to project
    print(f"🔗 Linking to project: {project_ref}")
    run_command(['supabase', 'link', '--project-ref', project_ref], cwd=backend_dir)
    
    # Push database migrations
    print("📊 Pushing database migrations...")
    run_command(['supabase', 'db', 'push'], cwd=backend_dir)
    
    print("✨ Supabase setup completed successfully!")
    print()
    print("🚨 IMPORTANT: Manual step required:")
    print("1. Go to Supabase Dashboard → Your Project → Settings → API")
    print("2. In 'Exposed Schema' section, add 'basejump' if not already there")
    print("3. Save the changes")

if __name__ == "__main__":
    main() 