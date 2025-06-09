#!/usr/bin/env python3
"""
Get Supabase Bearer Token

This script authenticates with Supabase using email/password and retrieves
the access token (bearer token) for use with the Suna API client.
"""

import requests
import json
import sys
from typing import Dict, Any


def get_supabase_token(email: str, password: str, supabase_url: str, anon_key: str) -> Dict[str, Any]:
    """
    Authenticate with Supabase and get the bearer token
    
    Args:
        email: User email address
        password: User password
        supabase_url: Supabase project URL
        anon_key: Supabase anonymous key
    
    Returns:
        Dictionary containing authentication response
    """
    
    # Supabase auth endpoint
    auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
    
    headers = {
        'apikey': anon_key,
        'Authorization': f'Bearer {anon_key}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'email': email,
        'password': password
    }
    
    print(f"🔐 Authenticating with Supabase...")
    print(f"📧 Email: {email}")
    print(f"🌐 URL: {supabase_url}")
    
    try:
        response = requests.post(auth_url, headers=headers, json=payload)
        
        if response.status_code == 200:
            auth_data = response.json()
            
            print("✅ Authentication successful!")
            print(f"🔑 Access Token: {auth_data['access_token'][:50]}...")
            print(f"👤 User ID: {auth_data['user']['id']}")
            print(f"📧 User Email: {auth_data['user']['email']}")
            print(f"⏰ Token Expires: {auth_data['expires_in']} seconds")
            
            return {
                'success': True,
                'access_token': auth_data['access_token'],
                'refresh_token': auth_data['refresh_token'],
                'user_id': auth_data['user']['id'],
                'user_email': auth_data['user']['email'],
                'expires_in': auth_data['expires_in'],
                'token_type': auth_data['token_type']
            }
        else:
            error_data = response.json() if response.text else {}
            print(f"❌ Authentication failed!")
            print(f"Status: {response.status_code}")
            print(f"Error: {error_data.get('error_description', error_data.get('error', 'Unknown error'))}")
            
            return {
                'success': False,
                'error': error_data.get('error_description', error_data.get('error', 'Unknown error')),
                'status_code': response.status_code
            }
            
    except requests.RequestException as e:
        print(f"❌ Network error: {e}")
        return {
            'success': False,
            'error': f"Network error: {str(e)}"
        }


def create_env_file(token_data: Dict[str, Any], backend_url: str) -> None:
    """Create a .env file with the authentication data"""
    
    if not token_data['success']:
        print("❌ Cannot create .env file - authentication failed")
        return
    
    env_content = f"""# Suna Client Environment Variables
# Generated automatically from Supabase authentication

SUNA_BACKEND_URL={backend_url}
SUNA_ACCESS_TOKEN={token_data['access_token']}
SUNA_USER_ID={token_data['user_id']}

# Additional token information (for reference)
# SUNA_REFRESH_TOKEN={token_data['refresh_token']}
# SUNA_USER_EMAIL={token_data['user_email']}
# SUNA_TOKEN_EXPIRES_IN={token_data['expires_in']}
# SUNA_TOKEN_TYPE={token_data['token_type']}
"""
    
    with open('client/.env', 'w') as f:
        f.write(env_content)
    
    print("📝 Created client/.env file with authentication data")
    print("🚀 You can now run the Suna client:")
    print("   cd client")
    print("   source .env")
    print("   python suna_client.py \"Your prompt here\"")


def main():
    """Main execution"""
    print("🔑 Supabase Token Generator")
    print("=" * 50)
    
    # Configuration from the environment files
    supabase_url = "https://nmwqprgbxtnikkmwhwyt.supabase.co"
    anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5td3FwcmdieHRuaWtrbXdod3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNDU5MDEsImV4cCI6MjA2NDgyMTkwMX0.EzkoHbnrhM-kLP2BGezC3DuNerqqDol88L_ZOPDumN4"
    backend_url = "http://34.171.125.26:8000/api"
    
    # User credentials
    email = "gal@eloo.ai"
    password = "12345"
    
    # Get the token
    token_data = get_supabase_token(email, password, supabase_url, anon_key)
    
    if token_data['success']:
        print("\n" + "=" * 50)
        print("🎉 AUTHENTICATION SUCCESSFUL!")
        print("=" * 50)
        
        print(f"\n📋 Configuration for Suna Client:")
        print(f"SUNA_BACKEND_URL={backend_url}")
        print(f"SUNA_ACCESS_TOKEN={token_data['access_token']}")
        print(f"SUNA_USER_ID={token_data['user_id']}")
        
        # Create .env file
        create_env_file(token_data, backend_url)
        
        # Save full response to JSON file
        with open('client/auth_response.json', 'w') as f:
            json.dump(token_data, f, indent=2)
        print("💾 Full authentication response saved to client/auth_response.json")
        
    else:
        print("\n" + "=" * 50)
        print("❌ AUTHENTICATION FAILED!")
        print("=" * 50)
        print(f"Error: {token_data['error']}")
        if 'status_code' in token_data:
            print(f"Status Code: {token_data['status_code']}")
        
        sys.exit(1)


if __name__ == '__main__':
    main() 