#!/usr/bin/env python3
"""
Test Backend Connectivity

Debug script to test the backend API and find correct endpoints.
"""

import requests
import json


def test_backend_endpoints():
    """Test various backend endpoints to find the correct ones"""
    
    backend_base = "http://34.171.125.26:8000"
    backend_api = "http://34.171.125.26:8000/api"
    
    endpoints_to_test = [
        # Base URLs
        (backend_base, "GET", "Base backend URL"),
        (backend_api, "GET", "API base URL"),
        
        # Health endpoints
        (f"{backend_base}/health", "GET", "Health (base)"),
        (f"{backend_api}/health", "GET", "Health (api)"),
        (f"{backend_base}/api/health", "GET", "Health (base/api)"),
        (f"{backend_base}/healthcheck", "GET", "Healthcheck"),
        (f"{backend_api}/healthcheck", "GET", "Healthcheck (api)"),
        
        # Common API patterns
        (f"{backend_base}/docs", "GET", "Docs (base)"),
        (f"{backend_api}/docs", "GET", "Docs (api)"),
        (f"{backend_base}/api/docs", "GET", "Docs (base/api)"),
        (f"{backend_base}/openapi.json", "GET", "OpenAPI spec"),
        (f"{backend_api}/openapi.json", "GET", "OpenAPI spec (api)"),
    ]
    
    print("🔍 Testing Backend Endpoints")
    print("=" * 60)
    
    working_endpoints = []
    
    for url, method, description in endpoints_to_test:
        print(f"\n📡 Testing: {description}")
        print(f"URL: {url}")
        
        try:
            response = requests.request(method, url, timeout=10)
            
            status = "✅" if response.status_code < 400 else "❌"
            print(f"{status} Status: {response.status_code}")
            
            if response.status_code < 400:
                working_endpoints.append((url, description, response.status_code))
                
                # Try to parse response
                try:
                    if response.headers.get('content-type', '').startswith('application/json'):
                        json_data = response.json()
                        print(f"📄 JSON Response: {json.dumps(json_data, indent=2)[:200]}...")
                    else:
                        text_data = response.text
                        print(f"📄 Response: {text_data[:200]}...")
                except:
                    print(f"📄 Raw length: {len(response.content)} bytes")
            else:
                try:
                    error_data = response.json()
                    print(f"💥 Error: {error_data}")
                except:
                    print(f"💥 Error: {response.text[:100]}")
                    
        except requests.Timeout:
            print("⏰ Timeout")
        except requests.ConnectionError:
            print("🔌 Connection Error")
        except Exception as e:
            print(f"💥 Exception: {e}")
    
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    
    if working_endpoints:
        print("✅ Working Endpoints:")
        for url, desc, status in working_endpoints:
            print(f"  {status} - {desc}: {url}")
    else:
        print("❌ No working endpoints found")
    
    return working_endpoints


def test_with_auth():
    """Test endpoints with authentication"""
    # Get token first
    supabase_url = "https://nmwqprgbxtnikkmwhwyt.supabase.co"
    anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5td3FwcmdieHRuaWtrbXdod3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNDU5MDEsImV4cCI6MjA2NDgyMTkwMX0.EzkoHbnrhM-kLP2BGezC3DuNerqqDol88L_ZOPDumN4"
    
    auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
    headers = {
        'apikey': anon_key,
        'Authorization': f'Bearer {anon_key}',
        'Content-Type': 'application/json'
    }
    payload = {'email': 'gal@eloo.ai', 'password': 'gabeta11'}
    
    print("\n🔐 Getting authentication token...")
    
    try:
        response = requests.post(auth_url, headers=headers, json=payload)
        if response.status_code != 200:
            print("❌ Failed to get token")
            return
        
        auth_data = response.json()
        token = auth_data['access_token']
        print(f"✅ Got token: {token[:50]}...")
        
        # Test authenticated endpoints
        backend_bases = [
            "http://34.171.125.26:8000",
            "http://34.171.125.26:8000/api"
        ]
        
        auth_headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        for base in backend_bases:
            print(f"\n🔑 Testing authenticated endpoints on {base}")
            
            auth_endpoints = [
                f"{base}/health",
                f"{base}/projects",
                f"{base}/threads", 
                f"{base}/profile",
                f"{base}/me"
            ]
            
            for endpoint in auth_endpoints:
                try:
                    response = requests.get(endpoint, headers=auth_headers, timeout=10)
                    status = "✅" if response.status_code < 400 else "❌"
                    print(f"  {status} {endpoint}: {response.status_code}")
                    
                    if response.status_code < 400:
                        try:
                            data = response.json()
                            print(f"    📄 {json.dumps(data, indent=4)[:150]}...")
                        except:
                            print(f"    📄 {response.text[:100]}...")
                            
                except Exception as e:
                    print(f"  💥 {endpoint}: {e}")
        
    except Exception as e:
        print(f"❌ Auth error: {e}")


def check_openapi_endpoints():
    """Check what endpoints are available from OpenAPI spec"""
    
    try:
        response = requests.get("http://34.171.125.26:8000/openapi.json", timeout=10)
        if response.status_code == 200:
            spec = response.json()
            
            print("\n🔍 Available API Endpoints from OpenAPI:")
            print("=" * 60)
            
            paths = spec.get('paths', {})
            for path, methods in paths.items():
                for method, details in methods.items():
                    summary = details.get('summary', 'No summary')
                    print(f"  {method.upper()} {path} - {summary}")
            
            return paths
        else:
            print(f"❌ Failed to get OpenAPI spec: {response.status_code}")
            return {}
    except Exception as e:
        print(f"❌ Error getting OpenAPI spec: {e}")
        return {}


if __name__ == '__main__':
    working = test_backend_endpoints()
    test_with_auth()
    check_openapi_endpoints() 