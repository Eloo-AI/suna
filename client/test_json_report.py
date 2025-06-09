#!/usr/bin/env python3

import json
from suna_client import SunaConfig, SunaClient

def main():
    # Load config
    with open('test_config.json', 'r') as f:
        config_data = json.load(f)
    
    config = SunaConfig(**config_data)
    client = SunaClient(config)
    
    # Execute the prompt for JSON report
    prompt = "a short mock report in format of JSON for test purposes"
    print(f"🚀 Testing prompt: {prompt}")
    print("=" * 80)
    
    result = client.execute_prompt(prompt)
    
    print("\n" + "=" * 80)
    print("📊 FINAL RESULT:")
    print(f"Status: {result.get('status')}")
    print(f"Messages count: {len(result.get('final_messages', []))}")
    print(f"Agent Run ID: {result.get('agent_run_id')}")
    print(f"VNC URL: {result.get('vnc_url', 'N/A')}")
    
    # Search for JSON content in messages
    print("\n📋 SEARCHING FOR JSON REPORT...")
    messages = result.get('final_messages', [])
    
    json_found = False
    for i, msg in enumerate(messages):
        content = str(msg.content)
        
        # Look for JSON-like content
        if ('json' in content.lower() and '{' in content) or (content.strip().startswith('{') and content.strip().endswith('}')):
            json_found = True
            print(f"\n📄 MESSAGE {i+1} (JSON CONTENT FOUND):")
            print("-" * 60)
            
            # Try to extract and pretty-print JSON
            try:
                # Try to find JSON in the content
                lines = content.split('\n')
                json_lines = []
                in_json = False
                
                for line in lines:
                    if '{' in line and not in_json:
                        in_json = True
                        json_lines.append(line)
                    elif in_json:
                        json_lines.append(line)
                        if '}' in line:
                            break
                
                if json_lines:
                    json_text = '\n'.join(json_lines)
                    # Try to parse and pretty print
                    try:
                        # Extract just the JSON part
                        start = json_text.find('{')
                        end = json_text.rfind('}') + 1
                        if start != -1 and end != -1:
                            clean_json = json_text[start:end]
                            parsed = json.loads(clean_json)
                            print("🎯 EXTRACTED JSON REPORT:")
                            print(json.dumps(parsed, indent=2))
                        else:
                            print("Raw content:")
                            print(content[:800] + ('...' if len(content) > 800 else ''))
                    except json.JSONDecodeError:
                        print("Raw content (couldn't parse JSON):")
                        print(content[:800] + ('...' if len(content) > 800 else ''))
                else:
                    print("Raw content:")
                    print(content[:800] + ('...' if len(content) > 800 else ''))
                    
            except Exception as e:
                print(f"Error processing content: {e}")
                print("Raw content:")
                print(content[:800] + ('...' if len(content) > 800 else ''))
    
    if not json_found:
        print("❌ No JSON content found in messages")
        print("\n📝 Sample of final messages:")
        for i, msg in enumerate(messages[-3:]):  # Show last 3 messages
            print(f"\nMessage {len(messages)-2+i}:")
            print(f"Type: {msg.type}")
            content = str(msg.content)
            print(f"Content: {content[:200]}{'...' if len(content) > 200 else ''}")

if __name__ == "__main__":
    main() 