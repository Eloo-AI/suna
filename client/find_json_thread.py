#!/usr/bin/env python3

import json
from suna_client import SunaConfig, SunaClient

def main():
    with open('test_config.json', 'r') as f:
        config_data = json.load(f)
    
    config = SunaConfig(**config_data)
    client = SunaClient(config)
    
    print("🔍 Finding thread with 'a short mock report in format of JSON for test purposes'...")
    
    accounts = client.get_accounts()
    account = accounts[0]
    threads = client.get_threads_for_account(account.account_id)
    
    print(f"📋 Checking {len(threads)} threads...")
    
    for i, thread in enumerate(threads):
        try:
            messages = client.get_messages_for_thread(thread.thread_id)
            for msg in messages:
                content = str(msg.content)
                if "a short mock report in format of JSON for test purposes" in content:
                    print(f"\n✅ FOUND THREAD: {thread.thread_id}")
                    print(f"   Created: {thread.created_at}")
                    print(f"   Messages: {len(messages)}")
                    
                    # Now look for the JSON report
                    json_found = False
                    for j, msg in enumerate(messages):
                        msg_content = str(msg.content)
                        
                        # Look for cat command with JSON
                        if 'cat > mock_report.json' in msg_content and '{' in msg_content:
                            print(f"\n📄 Found JSON creation in message {j+1}")
                            
                            # Extract the JSON content from the cat command
                            try:
                                # Find the start and end of the JSON
                                start = msg_content.find('{')
                                if start != -1:
                                    # Count braces to find the end
                                    brace_count = 0
                                    end = start
                                    in_string = False
                                    escape_next = False
                                    
                                    for k, char in enumerate(msg_content[start:]):
                                        if escape_next:
                                            escape_next = False
                                            continue
                                        
                                        if char == '\\':
                                            escape_next = True
                                            continue
                                        
                                        if char == '"' and not escape_next:
                                            in_string = not in_string
                                        
                                        if not in_string:
                                            if char == '{':
                                                brace_count += 1
                                            elif char == '}':
                                                brace_count -= 1
                                                if brace_count == 0:
                                                    end = start + k + 1
                                                    break
                                    
                                    if end > start:
                                        json_text = msg_content[start:end]
                                        # Clean up the JSON
                                        json_text = json_text.replace('\\"', '"')
                                        json_text = json_text.replace('\\n', '\n')
                                        
                                        try:
                                            parsed = json.loads(json_text)
                                            print("\n🎯 EXTRACTED JSON REPORT:")
                                            print(json.dumps(parsed, indent=2))
                                            json_found = True
                                            return
                                        except json.JSONDecodeError as e:
                                            print(f"❌ JSON parsing error: {e}")
                                            print(f"Raw JSON (first 1000 chars):")
                                            print(json_text[:1000])
                            except Exception as e:
                                print(f"❌ Error extracting JSON: {e}")
                    
                    if not json_found:
                        print("❌ No valid JSON found in this thread")
                    
                    return
                    
        except Exception as e:
            print(f"❌ Error checking thread {thread.thread_id}: {e}")
            continue
    
    print("❌ Thread not found")

if __name__ == "__main__":
    main() 