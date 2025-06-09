#!/usr/bin/env python3
"""
Suna API Client

A Python client that replicates the frontend's API flow to interact with the Suna backend.
Sends prompts to agents and retrieves final artifacts/reports.

Updated to match the exact network flow from frontend console logs.

Usage:
    python suna_client.py "Create a simple website with a contact form"
"""

import json
import time
import uuid
import requests
import sseclient
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import argparse
import sys
import os
from urllib.parse import urljoin
from datetime import datetime


@dataclass
class SunaConfig:
    """Configuration for Suna API client"""
    backend_url: str
    supabase_url: str
    supabase_anon_key: str
    # Either provide access_token + user_id OR email + password
    access_token: Optional[str] = None
    user_id: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


@dataclass
class Account:
    """Account data structure from Supabase RPC"""
    account_id: str
    account_role: str
    is_primary_owner: bool
    name: str
    slug: Optional[str]
    personal_account: bool
    created_at: str
    updated_at: str


@dataclass
class Project:
    """Project data structure"""
    project_id: str
    name: str
    description: Optional[str]
    account_id: str
    sandbox: Dict[str, Any]
    is_public: bool
    created_at: str
    updated_at: str


@dataclass
class Thread:
    """Thread data structure"""
    thread_id: str
    account_id: str
    project_id: str
    is_public: bool
    created_at: str
    updated_at: str
    agent_id: Optional[str]
    metadata: Dict[str, Any]


@dataclass
class AgentRun:
    """Agent run data structure"""
    id: str
    thread_id: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    responses: Optional[List[Dict[str, Any]]] = None
    
    def __post_init__(self):
        # Handle responses field - if it's None, initialize as empty list
        if self.responses is None:
            self.responses = []


@dataclass
class Message:
    """Message data structure"""
    message_id: str
    thread_id: str
    type: str
    is_llm_message: bool
    content: Any
    metadata: Dict[str, Any]
    created_at: str
    updated_at: str


class SunaAPIError(Exception):
    """Custom exception for Suna API errors"""
    pass


class SunaClient:
    """Client for interacting with Suna backend API"""
    
    def __init__(self, config: SunaConfig):
        self.config = config
        self.session = requests.Session()
        self.current_user = None
        self.current_accounts = []
        
        # If no access token provided, authenticate with Supabase
        if not config.access_token:
            if not all([config.email, config.password]):
                raise ValueError("Either provide access_token+user_id OR email+password")
            
            auth_result = self._authenticate_with_supabase()
            if not auth_result['success']:
                raise SunaAPIError(f"Supabase authentication failed: {auth_result['error']}")
            
            self.config.access_token = auth_result['access_token']
            self.config.user_id = auth_result['user_id']
        
        self.session.headers.update({
            'Authorization': f'Bearer {self.config.access_token}'
        })
    
    def _authenticate_with_supabase(self) -> Dict[str, Any]:
        """Authenticate with Supabase using email/password"""
        print("🔐 Authenticating with Supabase...")
        
        auth_url = f"{self.config.supabase_url}/auth/v1/token?grant_type=password"
        
        headers = {
            'apikey': self.config.supabase_anon_key,
            'Authorization': f'Bearer {self.config.supabase_anon_key}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'email': self.config.email,
            'password': self.config.password
        }
        
        try:
            response = requests.post(auth_url, headers=headers, json=payload)
            
            if response.status_code == 200:
                auth_data = response.json()
                print(f"✅ Authenticated as {auth_data['user']['email']}")
                
                return {
                    'success': True,
                    'access_token': auth_data['access_token'],
                    'user_id': auth_data['user']['id'],
                    'user_email': auth_data['user']['email'],
                    'expires_in': auth_data['expires_in']
                }
            else:
                error_data = response.json() if response.text else {}
                return {
                    'success': False,
                    'error': error_data.get('error_description', error_data.get('error', 'Unknown error'))
                }
                
        except requests.RequestException as e:
            return {
                'success': False,
                'error': f"Network error: {str(e)}"
            }
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make HTTP request with error handling"""
        url = urljoin(self.config.backend_url, endpoint)
        
        # Add Authorization header for backend API calls
        headers = kwargs.get('headers', {})
        if self.config.access_token:
            headers['Authorization'] = f'Bearer {self.config.access_token}'
        
        # Only set Content-Type to JSON if not already set and not sending form data or files
        if 'Content-Type' not in headers and 'data' not in kwargs and 'files' not in kwargs:
            headers['Content-Type'] = 'application/json'
        kwargs['headers'] = headers
        
        try:
            response = self.session.request(method, url, **kwargs)
            
            if response.status_code == 402:
                raise SunaAPIError("Payment required - billing issue")
            elif response.status_code == 401:
                raise SunaAPIError("Authentication failed - invalid token")
            elif not response.ok:
                error_text = response.text if response.text else "No error details"
                raise SunaAPIError(f"API error {response.status_code}: {error_text}")
                
            return response
            
        except requests.RequestException as e:
            raise SunaAPIError(f"Network error: {str(e)}")
    
    def _make_supabase_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make Supabase REST API request with proper headers"""
        url = urljoin(self.config.supabase_url, endpoint)
        
        headers = kwargs.get('headers', {})
        headers.update({
            'apikey': self.config.supabase_anon_key,
            'Authorization': f'Bearer {self.config.access_token}',
            'Content-Type': 'application/json'
        })
        kwargs['headers'] = headers
        
        try:
            response = requests.request(method, url, **kwargs)
            
            if not response.ok:
                error_text = response.text if response.text else "No error details"
                raise SunaAPIError(f"Supabase API error {response.status_code}: {error_text}")
                
            return response
            
        except requests.RequestException as e:
            raise SunaAPIError(f"Network error: {str(e)}")

    def check_health(self) -> Dict[str, Any]:
        """Step 1: Check backend health"""
        print("🏥 Checking backend health...")
        
        response = self._make_request('GET', '/api/health')
        health_data = response.json()
        
        print(f"✅ Backend health OK")
        print(f"   Status: {health_data['status']}")
        print(f"   Instance ID: {health_data['instance_id']}")
        print(f"   Timestamp: {health_data['timestamp']}")
        
        return health_data

    def get_accounts(self) -> List[Account]:
        """Step 2: Get accounts via Supabase RPC"""
        print("👤 Fetching user accounts...")
        
        response = self._make_supabase_request('POST', '/rest/v1/rpc/get_accounts')
        accounts_data = response.json()
        
        accounts = [Account(**account) for account in accounts_data]
        self.current_accounts = accounts
        
        print(f"✅ Found {len(accounts)} account(s)")
        for account in accounts:
            print(f"   - {account.name} ({account.account_role})")
        
        return accounts

    def initiate_agent(self, prompt: str) -> Dict[str, str]:
        """Step 3: Initiate agent with prompt"""
        print("🤖 Initiating agent...")
        
        # Send as multipart/form-data exactly as the backend expects
        # Using files parameter to ensure multipart encoding
        form_data = {
            'prompt': (None, prompt),
            'model_name': (None, 'claude-sonnet-4'),
            'enable_thinking': (None, 'false'),
            'reasoning_effort': (None, 'low'), 
            'stream': (None, 'true'),
            'enable_context_manager': (None, 'false')
        }
        
        response = self._make_request('POST', '/api/agent/initiate', files=form_data)
        initiate_data = response.json()
        
        print(f"✅ Agent initiated")
        print(f"   Thread ID: {initiate_data['thread_id']}")
        print(f"   Agent Run ID: {initiate_data['agent_run_id']}")
        
        return initiate_data

    def get_user(self) -> Dict[str, Any]:
        """Step 4: Get current user info from Supabase"""
        print("👤 Fetching user information...")
        
        response = self._make_supabase_request('GET', '/auth/v1/user')
        user_data = response.json()
        
        self.current_user = user_data
        print(f"✅ User: {user_data['email']}")
        
        return user_data

    def get_thread_by_id(self, thread_id: str) -> Thread:
        """Step 5: Get thread by ID using Supabase filter"""
        print(f"🧵 Fetching thread {thread_id}...")
        
        params = {
            'select': '*',
            'thread_id': f'eq.{thread_id}'
        }
        
        response = self._make_supabase_request('GET', '/rest/v1/threads', params=params)
        thread_data = response.json()
        
        if not thread_data:
            raise SunaAPIError(f"Thread {thread_id} not found")
        
        # Fix: Response is an array but we need a single object
        thread_obj = thread_data[0] if isinstance(thread_data, list) else thread_data
        thread = Thread(**thread_obj)
        print(f"✅ Thread found in project {thread.project_id}")
        
        return thread

    def get_projects_for_account(self, account_id: str) -> List[Project]:
        """Step 6: Get projects for account using Supabase filter"""
        print(f"📁 Fetching projects for account {account_id}...")
        
        params = {
            'select': '*',
            'account_id': f'eq.{account_id}'
        }
        
        response = self._make_supabase_request('GET', '/rest/v1/projects', params=params)
        projects_data = response.json()
        
        projects = [Project(**project) for project in projects_data]
        print(f"✅ Found {len(projects)} project(s)")
        
        return projects

    def get_threads_for_account(self, account_id: str) -> List[Thread]:
        """Step 7: Get threads for account using Supabase filter"""
        print(f"🧵 Fetching threads for account {account_id}...")
        
        params = {
            'select': '*',
            'account_id': f'eq.{account_id}'
        }
        
        response = self._make_supabase_request('GET', '/rest/v1/threads', params=params)
        threads_data = response.json()
        
        threads = [Thread(**thread) for thread in threads_data]
        print(f"✅ Found {len(threads)} thread(s)")
        
        return threads

    def get_messages_for_thread(self, thread_id: str) -> List[Message]:
        """Step 8: Get messages for thread with filters and ordering"""
        print(f"💬 Fetching messages for thread {thread_id}...")
        
        # Fix: Use multiple type filters and proper ordering
        params = {
            'select': '*',
            'thread_id': f'eq.{thread_id}',
            'type': ['neq.cost', 'neq.summary'],
            'order': 'created_at.asc'
        }
        
        response = self._make_supabase_request('GET', '/rest/v1/messages', params=params)
        messages_data = response.json()
        
        messages = [Message(**message) for message in messages_data]
        print(f"✅ Found {len(messages)} message(s)")
        
        return messages

    def get_project_by_id(self, project_id: str) -> Project:
        """Step 9: Get project by ID using Supabase filter"""
        print(f"📁 Fetching project {project_id}...")
        
        params = {
            'select': '*',
            'project_id': f'eq.{project_id}'
        }
        
        response = self._make_supabase_request('GET', '/rest/v1/projects', params=params)
        project_data = response.json()
        
        if not project_data:
            raise SunaAPIError(f"Project {project_id} not found")
        
        # Fix: Response could be an array or single object
        project_obj = project_data[0] if isinstance(project_data, list) else project_data
        project = Project(**project_obj)
        print(f"✅ Project: {project.name}")
        
        return project

    def get_agent_runs_for_thread(self, thread_id: str) -> List[AgentRun]:
        """Step 10: Get agent runs for thread using backend API"""
        print(f"🏃 Fetching agent runs for thread {thread_id}...")
        
        response = self._make_request('GET', f'/api/thread/{thread_id}/agent-runs')
        runs_data = response.json()
        
        # Filter fields to match AgentRun dataclass
        agent_runs = []
        for run in runs_data['agent_runs']:
            # Extract only the fields that AgentRun expects
            filtered_run = {
                'id': run.get('id'),
                'thread_id': run.get('thread_id'),
                'status': run.get('status'),
                'started_at': run.get('started_at'),
                'completed_at': run.get('completed_at'),
                'error': run.get('error'),
                'created_at': run.get('created_at'),
                'updated_at': run.get('updated_at'),
                'responses': run.get('responses')
            }
            agent_runs.append(AgentRun(**filtered_run))
        
        print(f"✅ Found {len(agent_runs)} agent run(s)")
        return agent_runs

    def ensure_sandbox_active(self, project_id: str) -> Dict[str, Any]:
        """Step 11: Ensure sandbox is active"""
        print(f"🏗️ Ensuring sandbox active for project {project_id}...")
        
        response = self._make_request('POST', f'/api/project/{project_id}/sandbox/ensure-active')
        sandbox_data = response.json()
        
        print(f"✅ Sandbox status: {sandbox_data['status']}")
        print(f"   Sandbox ID: {sandbox_data['sandbox_id']}")
        
        return sandbox_data

    def get_agent_run_status(self, agent_run_id: str) -> Dict[str, Any]:
        """Step 12: Get agent run status"""
        print(f"📊 Checking agent run status {agent_run_id}...")
        
        response = self._make_request('GET', f'/api/agent-run/{agent_run_id}')
        status_data = response.json()
        
        print(f"✅ Agent run status: {status_data['status']}")
        
        return status_data

    def stream_agent_response(self, agent_run_id: str, timeout: int = 300) -> List[str]:
        """Step 13: Stream agent response using exact URL pattern from logs"""
        print(f"📡 Streaming agent response for {agent_run_id}...")
        
        # Use exact URL pattern from network logs with token parameter
        stream_url = f"{self.config.backend_url}/api/agent-run/{agent_run_id}/stream"
        
        params = {
            'token': self.config.access_token
        }
        
        try:
            response = requests.get(
                stream_url,
                params=params,
                headers={'Accept': 'text/event-stream'},
                stream=True,
                timeout=timeout
            )
            
            if not response.ok:
                raise SunaAPIError(f"Stream error {response.status_code}: {response.text}")
            
            client = sseclient.SSEClient(response)
            messages = []
            
            print("📡 Streaming events...")
            for event in client.events():
                if event.data:
                    try:
                        data = json.loads(event.data)
                        messages.append(data)
                        
                        if data.get('type') == 'status' and data.get('status') == 'completed':
                            print("✅ Agent run completed")
                            break
                        elif data.get('type') == 'status' and data.get('status') == 'error':
                            print(f"❌ Agent run failed: {data.get('message', 'Unknown error')}")
                            break
                        else:
                            print(f"   Event: {data.get('type', 'unknown')}")
                            
                    except json.JSONDecodeError:
                        # Handle non-JSON data
                        messages.append({'raw': event.data})
            
            return messages
            
        except requests.RequestException as e:
            raise SunaAPIError(f"Streaming error: {str(e)}")

    def get_vnc_url(self, project: Project) -> str:
        """Step 14: Construct VNC URL for sandbox access"""
        print("🖥️ Constructing VNC URL...")
        
        # Try different possible field names for sandbox data
        sandbox_id = (project.sandbox.get('sandbox_id') or 
                     project.sandbox.get('id') or 
                     project.sandbox.get('sandboxId'))
        
        password = (project.sandbox.get('password') or 
                   project.sandbox.get('pass') or 
                   project.sandbox.get('vnc_password'))
        
        print(f"🔍 Sandbox data: {project.sandbox}")
        
        if not sandbox_id:
            raise SunaAPIError("Missing sandbox_id in project sandbox data")
        if not password:
            raise SunaAPIError("Missing password in project sandbox data")
        
        vnc_url = f"https://6080-{sandbox_id}.h1099.daytona.work/vnc_lite.html?password={password}&autoconnect=true&scale=local&width=1024&height=768"
        print(f"🖥️ VNC URL: {vnc_url}")
        return vnc_url

    def list_sandbox_files(self, sandbox_id: str, path: str = "/workspace") -> List[Dict[str, Any]]:
        """List files in sandbox directory"""
        print(f"📁 Listing files in sandbox {sandbox_id} at {path}...")
        
        # URL encode the path
        from urllib.parse import quote
        encoded_path = quote(path)
        
        response = self._make_request('GET', f'/api/sandboxes/{sandbox_id}/files?path={encoded_path}')
        files_data = response.json()
        
        print(f"🔍 Raw API response: {files_data}")
        
        # Handle the API response structure - it returns {'files': [...]}
        if isinstance(files_data, dict) and 'files' in files_data:
            files_list = files_data['files']
        elif isinstance(files_data, list):
            files_list = files_data
        else:
            print(f"⚠️ Unexpected response format: {files_data}")
            files_list = []
        
        print(f"✅ Found {len(files_list)} file(s)/directory(ies)")
        for item in files_list:
            if isinstance(item, dict):
                print(f"🔍 Item structure: {item}")
                item_type = "📁" if item.get('is_dir') or item.get('is_directory') else "📄"
                name = item.get('name') or item.get('filename') or item.get('path') or 'unknown'
                print(f"   {item_type} {name}")
            else:
                print(f"   📄 {item}")
        
        return files_list

    def download_file_content(self, sandbox_id: str, file_path: str) -> str:
        """Download file content from sandbox"""
        print(f"⬇️ Downloading file: {file_path}")
        
        # URL encode the path
        from urllib.parse import quote
        encoded_path = quote(file_path)
        
        response = self._make_request('GET', f'/api/sandboxes/{sandbox_id}/files/content?path={encoded_path}')
        content = response.text
        
        print(f"✅ Downloaded {len(content)} characters")
        return content

    def get_final_messages(self, thread_id: str) -> List[Message]:
        """Step 15: Get final messages after completion"""
        print(f"📝 Fetching final messages for thread {thread_id}...")
        
        return self.get_messages_for_thread(thread_id)

    def execute_prompt_flow(self, prompt: str, project_name: Optional[str] = None) -> Dict[str, Any]:
        """Execute the complete prompt flow matching network console logs exactly"""
        print(f"🚀 Starting prompt execution: {prompt[:50]}...")
        
        try:
            # Step 1: Health check
            health = self.check_health()
            
            # Step 2: Get accounts
            accounts = self.get_accounts()
            if not accounts:
                raise SunaAPIError("No accounts found")
            
            primary_account = accounts[0]  # Use first account
            
            # Step 3: Initiate agent
            initiate_result = self.initiate_agent(prompt)
            thread_id = initiate_result['thread_id']
            agent_run_id = initiate_result['agent_run_id']
            
            # Step 4: Get user info
            user = self.get_user()
            
            # Step 5: Get thread details
            thread = self.get_thread_by_id(thread_id)
            
            # Step 6: Get projects for account
            projects = self.get_projects_for_account(primary_account.account_id)
            
            # Step 7: Get threads for account
            threads = self.get_threads_for_account(primary_account.account_id)
            
            # Step 8: Get initial messages
            initial_messages = self.get_messages_for_thread(thread_id)
            
            # Step 9: Get project details
            project = self.get_project_by_id(thread.project_id)
            
            # Step 10: Get agent runs
            agent_runs = self.get_agent_runs_for_thread(thread_id)
            
            # Step 11: Ensure sandbox is active
            sandbox_status = self.ensure_sandbox_active(project.project_id)
            
            # Step 12: Check agent run status
            run_status = self.get_agent_run_status(agent_run_id)
            
            # Step 13: Stream agent response
            stream_events = self.stream_agent_response(agent_run_id)
            
            # Step 14: Get VNC URL
            try:
                vnc_url = self.get_vnc_url(project)
            except Exception as e:
                print(f"⚠️ Warning: Could not get VNC URL: {str(e)}")
                vnc_url = "N/A"
            
            # Step 15: Get final messages
            final_messages = self.get_final_messages(thread_id)
            
            print("🎉 Prompt execution completed successfully!")
            
            return {
                'success': True,
                'status': 'completed',
                'thread_id': thread_id,
                'agent_run_id': agent_run_id,
                'project': project,
                'final_status': run_status,
                'vnc_url': vnc_url,
                'final_messages': final_messages,
                'stream_events': stream_events
            }
            
        except Exception as e:
            print(f"❌ Error in prompt execution: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def execute_prompt(self, prompt: str, project_name: Optional[str] = None) -> Dict[str, Any]:
        """Simplified wrapper around execute_prompt_flow"""
        return self.execute_prompt_flow(prompt, project_name)

    def execute_prompt_with_file_download(self, prompt: str, project_name: Optional[str] = None) -> Dict[str, Any]:
        """Execute prompt and download any generated files"""
        print(f"🚀 Starting prompt execution with file download: {prompt}...")
        
        # Execute the standard flow first
        result = self.execute_prompt_flow(prompt, project_name)
        
        # If execution was successful, check for generated files
        if result.get('status') == 'completed' and 'project' in result:
            project = result['project']
            # Try different possible field names for sandbox_id
            sandbox_id = (project.sandbox.get('sandbox_id') or 
                         project.sandbox.get('id') or 
                         project.sandbox.get('sandboxId'))
            
            if sandbox_id:
                try:
                    # List files in workspace
                    files = self.list_sandbox_files(sandbox_id, "/workspace")
                    
                    # Filter for .txt files
                    txt_files = [f for f in files if not (f.get('is_dir') or f.get('is_directory')) and f.get('name', '').endswith('.txt')]
                    
                    downloaded_files = []
                    
                    if txt_files:
                        print(f"\n📄 Found {len(txt_files)} .txt file(s), downloading...")
                        
                        for txt_file in txt_files:
                            file_name = txt_file.get('name')
                            file_path = f"/workspace/{file_name}"
                            
                            try:
                                content = self.download_file_content(sandbox_id, file_path)
                                downloaded_files.append({
                                    'name': file_name,
                                    'path': file_path,
                                    'content': content,
                                    'size': len(content)
                                })
                                
                                print(f"\n📄 Content of {file_name}:")
                                print("=" * 50)
                                print(content)
                                print("=" * 50)
                                
                            except Exception as e:
                                print(f"❌ Failed to download {file_name}: {str(e)}")
                    else:
                        print("📄 No .txt files found in workspace")
                    
                    # Add downloaded files to result
                    result['downloaded_files'] = downloaded_files
                    
                except Exception as e:
                    print(f"❌ Error accessing sandbox files: {str(e)}")
                    result['file_download_error'] = str(e)
            else:
                print("❌ No sandbox_id found in project data")
        
        return result

    def initiate_only(self, prompt: str, project_name: Optional[str] = None) -> Dict[str, Any]:
        """Initiate agent request and return essential IDs without streaming"""
        print(f"🚀 Initiating agent request: {prompt}...")
        
        try:
            # Steps 1-2: Health check and get accounts
            self.check_health()
            accounts = self.get_accounts()
            
            if not accounts:
                raise SunaAPIError("No accounts found")
            
            account = accounts[0]
            account_id = account.account_id
            
            # Step 3: Initiate agent
            initiate_response = self.initiate_agent(prompt)
            thread_id = initiate_response['thread_id']
            agent_run_id = initiate_response.get('agent_run_id')
            
            # Steps 4-9: Get basic info
            user_info = self.get_user()
            thread = self.get_thread_by_id(thread_id)
            projects = self.get_projects_for_account(account_id)
            threads = self.get_threads_for_account(account_id)
            messages = self.get_messages_for_thread(thread_id)
            project = self.get_project_by_id(thread.project_id)
            
            # Step 10: Ensure sandbox is active
            sandbox_result = self.ensure_sandbox_active(project.project_id)
            
            # Get sandbox_id
            sandbox_id = (project.sandbox.get('sandbox_id') or 
                         project.sandbox.get('id') or 
                         project.sandbox.get('sandboxId'))
            
            print("\n" + "="*60)
            print("✅ AGENT REQUEST INITIATED SUCCESSFULLY")
            print("="*60)
            print(f"📧 User: {user_info.get('email', 'N/A')}")
            print(f"🧵 Thread ID: {thread_id}")
            print(f"📁 Project ID: {project.project_id}")
            print(f"📁 Project Name: {project.name}")
            print(f"🏃 Agent Run ID: {agent_run_id}")
            print(f"🖥️ Sandbox ID: {sandbox_id}")
            print("="*60)
            print("💡 Use these IDs with the poll command to check status and download files")
            print("="*60)
            
            return {
                'success': True,
                'thread_id': thread_id,
                'project_id': project.project_id,
                'project_name': project.name,
                'agent_run_id': agent_run_id,
                'sandbox_id': sandbox_id,
                'account_id': account_id
            }
            
        except Exception as e:
            print(f"❌ Error in agent initiation: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def poll_and_download(self, agent_run_id: str) -> Dict[str, Any]:
        """Check agent run status and download files if completed"""
        print(f"🔍 Polling agent run {agent_run_id}...")
        
        try:
            # Check agent run status to get thread_id
            run_status = self.get_agent_run_status(agent_run_id)
            status = run_status.get('status', 'unknown')
            
            print(f"📊 Agent run status: {status}")
            
            # Get thread_id from agent run status
            thread_id = run_status.get('thread_id') or run_status.get('threadId')
            if not thread_id:
                print("⚠️ thread_id not found in agent run status, trying alternative approach...")
                # Alternative: Get thread_id from the agent run endpoint
                try:
                    agent_run_response = self._make_request('GET', f'/api/agent-run/{agent_run_id}')
                    agent_run_data = agent_run_response.json()
                    thread_id = agent_run_data.get('thread_id') or agent_run_data.get('threadId')
                    if not thread_id:
                        raise SunaAPIError("Could not get thread_id from agent run data")
                except Exception as e:
                    raise SunaAPIError(f"Could not get thread_id: {str(e)}")
            
            print(f"🧵 Derived thread ID: {thread_id}")
            
            # Get thread to find project_id
            thread = self.get_thread_by_id(thread_id)
            project_id = thread.project_id
            print(f"📁 Derived project ID: {project_id}")
            
            # Get project to find sandbox_id
            project = self.get_project_by_id(project_id)
            sandbox_id = (project.sandbox.get('sandbox_id') or 
                         project.sandbox.get('id') or 
                         project.sandbox.get('sandboxId'))
            
            if not sandbox_id:
                raise SunaAPIError("Could not get sandbox_id from project")
            
            print(f"🖥️ Derived sandbox ID: {sandbox_id}")
            
            if status == 'completed':
                print("✅ Agent run completed! Downloading files...")
                
                try:
                    # List files in workspace
                    files = self.list_sandbox_files(sandbox_id, "/workspace")
                    
                    # Filter for .txt files
                    txt_files = [f for f in files if not (f.get('is_dir') or f.get('is_directory')) and f.get('name', '').endswith('.txt')]
                    
                    downloaded_files = []
                    
                    if txt_files:
                        print(f"\n📄 Found {len(txt_files)} .txt file(s), downloading...")
                        
                        for txt_file in txt_files:
                            file_name = txt_file.get('name')
                            file_path = f"/workspace/{file_name}"
                            
                            try:
                                content = self.download_file_content(sandbox_id, file_path)
                                downloaded_files.append({
                                    'name': file_name,
                                    'path': file_path,
                                    'content': content,
                                    'size': len(content)
                                })
                                
                                print(f"\n📄 Content of {file_name}:")
                                print("=" * 50)
                                print(content)
                                print("=" * 50)
                                
                            except Exception as e:
                                print(f"❌ Failed to download {file_name}: {str(e)}")
                    else:
                        print("📄 No .txt files found in workspace")
                        
                except Exception as e:
                    if "Workspace is not running" in str(e):
                        print("⚠️ Workspace/sandbox is no longer active (expected for completed runs)")
                        print("💡 Files may have been cleaned up. Check the final messages for agent outputs.")
                        downloaded_files = []
                    else:
                        raise e
                
                # Get final messages
                final_messages = self.get_messages_for_thread(thread_id)
                
                return {
                    'success': True,
                    'status': 'completed',
                    'thread_id': thread_id,
                    'project_id': project_id,
                    'sandbox_id': sandbox_id,
                    'downloaded_files': downloaded_files,
                    'final_messages': final_messages,
                    'run_status': run_status
                }
                
            elif status == 'running':
                print("⏳ Agent is still running...")
                return {
                    'success': True,
                    'status': 'running',
                    'thread_id': thread_id,
                    'project_id': project_id,
                    'sandbox_id': sandbox_id,
                    'run_status': run_status
                }
                
            elif status == 'failed':
                error_msg = run_status.get('error', 'Unknown error')
                print(f"❌ Agent run failed: {error_msg}")
                return {
                    'success': False,
                    'status': 'failed',
                    'error': error_msg,
                    'run_status': run_status
                }
                
            else:
                print(f"⚠️ Unknown status: {status}")
                return {
                    'success': True,
                    'status': status,
                    'run_status': run_status
                }
                
        except Exception as e:
            print(f"❌ Error in polling: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def stop_agent_and_cleanup(self, agent_run_id: str) -> Dict[str, Any]:
        """Stop agent run and cleanup resources"""
        print(f"🛑 Stopping agent run {agent_run_id}...")
        
        try:
            # First, get the agent run to find associated IDs
            try:
                agent_run_data = self.get_agent_run_status(agent_run_id)
                thread_id = agent_run_data.get('threadId') or agent_run_data.get('thread_id')
                print(f"📋 Found thread_id: {thread_id}")
            except Exception as e:
                print(f"⚠️ Warning: Could not retrieve agent run details: {e}")
                thread_id = None
            
            # Stop the agent run
            response = self._make_request(
                'POST',
                f'/api/agent-run/{agent_run_id}/stop'
            )
            
            if response.status_code == 200:
                print("✅ Agent run stopped successfully")
                result = response.json()
                print(f"📊 Status: {result.get('status', 'stopped')}")
                
                # Return detailed status
                return {
                    'success': True,
                    'agent_run_id': agent_run_id,
                    'thread_id': thread_id,
                    'status': result.get('status', 'stopped'),
                    'message': 'Agent run stopped successfully'
                }
            else:
                error_msg = f"Failed to stop agent run: {response.status_code} {response.text}"
                print(f"❌ {error_msg}")
                return {
                    'success': False,
                    'error': error_msg,
                    'agent_run_id': agent_run_id
                }
                
        except Exception as e:
            error_msg = f"Error stopping agent run: {str(e)}"
            print(f"❌ {error_msg}")
            return {
                'success': False,
                'error': error_msg,
                'agent_run_id': agent_run_id
            }

    def delete_sandbox(self, sandbox_id: str) -> Dict[str, Any]:
        """Delete a sandbox completely"""
        print(f"🗑️ Deleting sandbox {sandbox_id}...")
        
        try:
            response = self._make_request(
                'DELETE',
                f'/api/sandboxes/{sandbox_id}'
            )
            
            if response.status_code == 200:
                print("✅ Sandbox deleted successfully")
                result = response.json()
                return {
                    'success': True,
                    'sandbox_id': sandbox_id,
                    'status': 'deleted',
                    'message': 'Sandbox deleted successfully'
                }
            else:
                error_msg = f"Failed to delete sandbox: {response.status_code} {response.text}"
                print(f"❌ {error_msg}")
                return {
                    'success': False,
                    'error': error_msg,
                    'sandbox_id': sandbox_id
                }
                
        except Exception as e:
            error_msg = f"Error deleting sandbox: {str(e)}"
            print(f"❌ {error_msg}")
            return {
                'success': False,
                'error': error_msg,
                'sandbox_id': sandbox_id
            }

    def stop_agent_and_delete_sandbox(self, agent_run_id: str) -> Dict[str, Any]:
        """Stop agent run and delete the associated sandbox"""
        print(f"🛑 Stopping agent run {agent_run_id} and deleting sandbox...")
        
        try:
            # Get IDs in the chain
            agent_run_data = self.get_agent_run_status(agent_run_id)
            thread_id = agent_run_data.get('threadId') or agent_run_data.get('thread_id')
            if not thread_id:
                return {'success': False, 'error': 'Could not find thread_id from agent_run_id'}
            
            thread_data = self.get_thread_by_id(thread_id)
            project_id = thread_data.project_id
            if not project_id:
                return {'success': False, 'error': 'Could not find project_id from thread_id'}
            
            project_data = self.get_project_by_id(project_id)
            sandbox_id = project_data.sandbox.get('id')
            if not sandbox_id:
                return {'success': False, 'error': 'Could not find sandbox_id from project_id'}
            
            print(f"📋 Found sandbox_id: {sandbox_id}")
            
            # First stop the agent
            stop_result = self.stop_agent_and_cleanup(agent_run_id)
            
            # Then delete the sandbox
            if stop_result.get('success'):
                delete_result = self.delete_sandbox(sandbox_id)
                
                return {
                    'success': delete_result.get('success', False),
                    'agent_run_id': agent_run_id,
                    'thread_id': thread_id,
                    'project_id': project_id,
                    'sandbox_id': sandbox_id,
                    'stop_result': stop_result,
                    'delete_result': delete_result,
                    'message': 'Agent stopped and sandbox deleted' if delete_result.get('success') else 'Agent stopped but sandbox deletion failed'
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to stop agent run',
                    'stop_result': stop_result
                }
                
        except Exception as e:
            error_msg = f"Error in stop and delete operation: {str(e)}"
            print(f"❌ {error_msg}")
            return {
                'success': False,
                'error': error_msg,
                'agent_run_id': agent_run_id
            }


def load_config_from_file(config_file: str) -> SunaConfig:
    """Load configuration from JSON file"""
    import json
    
    try:
        with open(config_file, 'r') as f:
            config_data = json.load(f)
        
        return SunaConfig(
            backend_url=config_data['backend_url'],
            supabase_url=config_data['supabase_url'],
            supabase_anon_key=config_data['supabase_anon_key'],
            access_token=config_data.get('access_token'),
            user_id=config_data.get('user_id'),
            email=config_data.get('email'),
            password=config_data.get('password')
        )
    except FileNotFoundError:
        raise ValueError(f"Config file {config_file} not found")
    except json.JSONDecodeError:
        raise ValueError(f"Invalid JSON in config file {config_file}")
    except KeyError as e:
        raise ValueError(f"Missing required field {e} in config file {config_file}")


def load_config() -> SunaConfig:
    """Load configuration from environment variables"""
    supabase_url = os.getenv('SUNA_SUPABASE_URL')
    supabase_anon_key = os.getenv('SUNA_SUPABASE_ANON_KEY')
    
    if not supabase_url:
        raise ValueError("SUNA_SUPABASE_URL environment variable is required")
    if not supabase_anon_key:
        raise ValueError("SUNA_SUPABASE_ANON_KEY environment variable is required")
    
    config = SunaConfig(
        backend_url=os.getenv('SUNA_BACKEND_URL', 'http://34.171.125.26:8000'),
        supabase_url=supabase_url,
        supabase_anon_key=supabase_anon_key,
        access_token=os.getenv('SUNA_ACCESS_TOKEN'),
        user_id=os.getenv('SUNA_USER_ID'),
        email=os.getenv('SUNA_EMAIL'),
        password=os.getenv('SUNA_PASSWORD')
    )
    
    return config


def create_config_with_defaults() -> SunaConfig:
    """Create config with sensible defaults for testing"""
    backend_url = input("Backend URL (default: http://34.171.125.26:8000): ").strip()
    if not backend_url:
        backend_url = "http://34.171.125.26:8000"
    
    supabase_url = input("Supabase URL: ").strip()
    if not supabase_url:
        raise ValueError("Supabase URL is required")
    
    supabase_anon_key = input("Supabase Anon Key: ").strip()
    if not supabase_anon_key:
        raise ValueError("Supabase Anon Key is required")
    
    email = input("Email: ").strip()
    password = input("Password: ").strip()
    
    return SunaConfig(
        backend_url=backend_url,
        supabase_url=supabase_url,
        supabase_anon_key=supabase_anon_key,
        email=email,
        password=password
    )


def print_final_report(result: Dict[str, Any]) -> None:
    """Print a detailed final report"""
    if not result['success']:
        print(f"\n❌ Execution failed: {result['error']}")
        return
    
    print("\n" + "="*80)
    print("🎉 EXECUTION COMPLETED SUCCESSFULLY")
    print("="*80)
    
    print(f"\n📊 SUMMARY:")
    print(f"   Thread ID: {result['thread_id']}")
    print(f"   Agent Run ID: {result['agent_run_id']}")
    
    # Check if project field exists (for full workflow results)
    if 'project' in result and result['project']:
        print(f"   Project: {result['project'].name}")
        print(f"   Final Status: {result['final_status']['status']}")
        
        if result['final_status']['status'] == 'completed':
            print(f"   ✅ Completed at: {result['final_status']['completedAt']}")
        
        print(f"\n🖥️ SANDBOX ACCESS:")
        print(f"   VNC URL: {result['vnc_url']}")
        print(f"   Sandbox URL: {result['project'].sandbox.get('sandbox_url', 'N/A')}")
        
        print(f"\n💬 MESSAGES ({len(result['final_messages'])}):")
        for i, msg in enumerate(result['final_messages'][-5:], 1):  # Show last 5 messages
            content_preview = str(msg.content)[:100] + "..." if len(str(msg.content)) > 100 else str(msg.content)
            print(f"   {i}. [{msg.type}] {content_preview}")
        
        print(f"\n📡 STREAM EVENTS ({len(result['stream_events'])}):")
        for i, event in enumerate(result['stream_events'][-5:], 1):  # Show last 5 events
            event_type = event.get('type', 'unknown')
            event_msg = event.get('message', str(event)[:50])
            print(f"   {i}. [{event_type}] {event_msg}")
        
        print("\n" + "="*80)
        print("🔗 Next steps:")
        print(f"   • Open VNC: {result['vnc_url']}")
        print(f"   • View sandbox: {result['project'].sandbox.get('sandbox_url', 'N/A')}")
        print("   • Check messages above for agent outputs")
        print("="*80)
    else:
        # For stop operations, just show the message
        print(f"   Message: {result.get('message', 'Operation completed')}")
        if 'status' in result:
            print(f"   Status: {result['status']}")
        
        # Show additional details for stop-sandbox operations  
        if 'project_id' in result:
            print(f"   Project ID: {result['project_id']}")
        if 'sandbox_id' in result:
            print(f"   Sandbox ID: {result['sandbox_id']}")


def main():
    """Main CLI interface"""
    parser = argparse.ArgumentParser(description='Suna API Client')
    parser.add_argument('--config', type=str, help='Path to config JSON file')
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Initiate command
    initiate_parser = subparsers.add_parser('initiate', help='Start agent request and return IDs')
    initiate_parser.add_argument('prompt', type=str, help='The prompt to send to the agent')
    
    # Poll command
    poll_parser = subparsers.add_parser('poll', help='Check agent status and download files when ready')
    poll_parser.add_argument('agent_run_id', type=str, help='Agent run ID to check')
    
    # Stop command (agent only)
    stop_parser = subparsers.add_parser('stop', help='Stop agent run')
    stop_parser.add_argument('agent_run_id', type=str, help='Agent run ID to stop')
    
    # Stop and delete sandbox command
    stop_sandbox_parser = subparsers.add_parser('stop-sandbox', help='Stop agent run and delete sandbox')
    stop_sandbox_parser.add_argument('agent_run_id', type=str, help='Agent run ID to stop and sandbox to delete')
    
    # Legacy full workflow command
    run_parser = subparsers.add_parser('run', help='Execute full workflow (legacy)')
    run_parser.add_argument('prompt', type=str, help='The prompt to send to the agent')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        # Load configuration
        if args.config:
            config = load_config_from_file(args.config)
        else:
            config = load_config()
        
        # Initialize client
        client = SunaClient(config)
        
        # Execute command
        if args.command == 'initiate':
            result = client.initiate_only(args.prompt)
            print_final_report(result)
            
        elif args.command == 'poll':
            result = client.poll_and_download(args.agent_run_id)
            print_final_report(result)
            
        elif args.command == 'stop':
            result = client.stop_agent_and_cleanup(args.agent_run_id)
            print_final_report(result)
            
        elif args.command == 'stop-sandbox':
            result = client.stop_agent_and_delete_sandbox(args.agent_run_id)
            print_final_report(result)
            
        elif args.command == 'run':
            result = client.execute_prompt_with_file_download(args.prompt)
            print_final_report(result)
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return


if __name__ == "__main__":
    main() 