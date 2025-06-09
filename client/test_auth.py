#!/usr/bin/env python3
"""
Debug Supabase Authentication

Test script to debug the authentication flow with Supabase.
"""

import requests
import json


def test_supabase_auth():
    """Test Supabase authentication with debug output"""
    
    # Configuration
    supabase_url = "https://nmwqprgbxtnikkmwhwyt.supabase.co"
    anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5td3FwcmdieHRuaWtrbXdod3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNDU5MDEsImV4cCI6MjA2NDgyMTkwMX0.EzkoHbnrhM-kLP2BGezC3DuNerqqDol88L_ZOPDumN4"
    email = "gal@eloo.ai"
    password = "gabeta11"
    
    print("🔐 Testing Supabase Authentication")
    print("=" * 40)
    print(f"URL: {supabase_url}")
    print(f"Email: {email}")
    
    # Auth endpoint
    auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
    print(f"Auth URL: {auth_url}")
    
    headers = {
        'apikey': anon_key,
        'Authorization': f'Bearer {anon_key}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'email': email,
        'password': password
    }
    
    print("\n📤 Request:")
    print(f"Headers: {json.dumps(dict(headers), indent=2)}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(auth_url, headers=headers, json=payload)
        
        print(f"\n📥 Response:")
        print(f"Status Code: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        
        try:
            response_json = response.json()
            print(f"Body: {json.dumps(response_json, indent=2)}")
        except:
            print(f"Raw Body: {response.text}")
        
        if response.status_code == 200:
            auth_data = response.json()
            print("\n✅ Authentication Successful!")
            print(f"User ID: {auth_data['user']['id']}")
            print(f"Email: {auth_data['user']['email']}")
            print(f"Access Token: {auth_data['access_token'][:50]}...")
            return True
        else:
            print(f"\n❌ Authentication Failed!")
            return False
            
    except Exception as e:
        print(f"\n❌ Exception: {e}")
        return False


if __name__ == '__main__':
    test_supabase_auth() 