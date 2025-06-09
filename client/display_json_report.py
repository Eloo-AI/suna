#!/usr/bin/env python3

import json
import re
from suna_client import SunaConfig, SunaClient

def extract_json_from_content(content):
    """Extract JSON content from a message"""
    # Look for JSON content between backticks or within text
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
        r'(\{[^{}]*"[^"]*"[^{}]*\})',
        r'cat > \w+\.json << \'EOF\'\s*(\{.*?\})\s*EOF',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, content, re.DOTALL)
        for match in matches:
            try:
                parsed = json.loads(match)
                return parsed
            except json.JSONDecodeError:
                continue
    
    return None

def main():
    # Load config and get the last result from messages
    with open('test_config.json', 'r') as f:
        config_data = json.load(f)
    
    config = SunaConfig(**config_data)
    client = SunaClient(config)
    
    print("🔍 Looking for JSON report in previous execution messages...")
    print("=" * 80)
    
    # Get the last thread to find messages
    accounts = client.get_accounts()
    if not accounts:
        print("❌ No accounts found")
        return
    
    account = accounts[0]
    threads = client.get_threads_for_account(account.account_id)
    
    if not threads:
        print("❌ No threads found")
        return
    
    # Use the most recent thread
    thread = threads[0]
    print(f"📋 Checking thread: {thread.thread_id}")
    
    messages = client.get_messages_for_thread(thread.thread_id)
    print(f"📝 Found {len(messages)} messages")
    
    # Look for JSON content in messages
    json_found = False
    for i, msg in enumerate(messages):
        content = str(msg.content)
        
        # Check if this contains the actual JSON report
        if 'mock_report.json' in content and '{' in content:
            print(f"\n📄 MESSAGE {i+1} - Found JSON report creation:")
            
            # Try to extract the JSON from command content
            if 'cat >' in content:
                # Extract from cat command
                start = content.find('{')
                if start != -1:
                    # Find the matching closing brace
                    brace_count = 0
                    end = start
                    for j, char in enumerate(content[start:]):
                        if char == '{':
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                end = start + j + 1
                                break
                    
                    if end > start:
                        json_text = content[start:end]
                        try:
                            # Clean up escaped quotes and newlines
                            json_text = json_text.replace('\\"', '"').replace('\\n', '\n')
                            parsed = json.loads(json_text)
                            print("🎯 EXTRACTED JSON REPORT:")
                            print(json.dumps(parsed, indent=2))
                            json_found = True
                            break
                        except json.JSONDecodeError as e:
                            print(f"❌ JSON parsing error: {e}")
                            print(f"Raw JSON text (first 500 chars): {json_text[:500]}")
        
        # Also check for JSON in assistant responses
        elif 'assistant' in str(msg.type) and '{' in content and '"report_' in content:
            json_content = extract_json_from_content(content)
            if json_content:
                print(f"\n📄 MESSAGE {i+1} - Found JSON in assistant response:")
                print("🎯 EXTRACTED JSON REPORT:")
                print(json.dumps(json_content, indent=2))
                json_found = True
                break
    
    if not json_found:
        print("\n❌ No complete JSON report found in messages")
        print("\n🔍 Sample content from recent messages:")
        for i, msg in enumerate(messages[-5:]):
            content = str(msg.content)
            if '{' in content:
                print(f"\nMessage {len(messages)-4+i}:")
                print(f"Type: {msg.type}")
                print(f"Content preview: {content[:200]}...")

if __name__ == "__main__":
    main() 