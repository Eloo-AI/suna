#!/usr/bin/env python3
"""
Manual Supabase migration script - bypasses CLI entirely
Connects directly to Supabase using psycopg2 and applies migrations
"""

import os
import psycopg2
import sys
from urllib.parse import urlparse

def get_db_connection(supabase_url, service_key):
    """Create direct PostgreSQL connection to Supabase"""
    # Parse the Supabase URL to get the database connection info
    parsed = urlparse(supabase_url)
    host = parsed.hostname
    
    # Supabase uses port 5432 for direct PostgreSQL connections
    # The connection string format for Supabase is different from the API URL
    db_host = host.replace('.supabase.co', '.pooler.supabase.com')
    
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=5432,
            database='postgres',
            user='postgres',
            password=service_key
        )
        return conn
    except Exception as e:
        print(f"❌ Failed to connect: {e}")
        print("Make sure your SERVICE_ROLE key (not anon key) is correct")
        sys.exit(1)

def apply_migration_file(cursor, filepath):
    """Apply a single migration file"""
    try:
        with open(filepath, 'r') as f:
            sql_content = f.read()
        
        # Execute the SQL
        cursor.execute(sql_content)
        print(f"✅ Applied: {os.path.basename(filepath)}")
        return True
    except Exception as e:
        print(f"❌ Failed to apply {os.path.basename(filepath)}: {e}")
        return False

def main():
    print("🔧 Manual Supabase Migration Script")
    print("=" * 40)
    
    # Get Supabase credentials
    supabase_url = input("Enter your Supabase URL (https://xxx.supabase.co): ").strip()
    if not supabase_url:
        print("❌ Supabase URL is required!")
        sys.exit(1)
    
    service_key = input("Enter your Supabase SERVICE_ROLE key (not anon key): ").strip()
    if not service_key:
        print("❌ Service role key is required!")
        sys.exit(1)
    
    # Connect to database
    print("🔗 Connecting to Supabase...")
    conn = get_db_connection(supabase_url, service_key)
    cursor = conn.cursor()
    
    # Get migration files in order
    migrations_dir = os.path.join('backend', 'supabase', 'migrations')
    if not os.path.exists(migrations_dir):
        print(f"❌ Migrations directory not found: {migrations_dir}")
        sys.exit(1)
    
    migration_files = [f for f in os.listdir(migrations_dir) if f.endswith('.sql')]
    migration_files.sort()  # Apply in chronological order
    
    print(f"📊 Found {len(migration_files)} migration files")
    
    # Apply each migration
    success_count = 0
    for migration_file in migration_files:
        filepath = os.path.join(migrations_dir, migration_file)
        if apply_migration_file(cursor, filepath):
            success_count += 1
            conn.commit()  # Commit after each successful migration
        else:
            conn.rollback()  # Rollback on failure
            print(f"⚠️  Continuing with next migration...")
    
    cursor.close()
    conn.close()
    
    print(f"\n✨ Migration complete: {success_count}/{len(migration_files)} applied successfully")
    
    if success_count > 0:
        print("\n🚨 Next steps:")
        print("1. Go to Supabase Dashboard → Your Project → Settings → API")
        print("2. In 'Exposed Schema' section, add 'basejump' if not already there")
        print("3. Save the changes")
        print("4. You can now start your Docker containers!")

if __name__ == "__main__":
    main() 