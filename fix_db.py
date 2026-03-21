import sqlite3
import os

db_path = 'instance/fintrack.db'

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check user table
cursor.execute("PRAGMA table_info(user);")
columns = [col[1] for col in cursor.fetchall()]
print(f"Current columns in 'user': {columns}")

if 'google_picture' not in columns:
    print("Adding 'google_picture' column to 'user' table...")
    try:
        cursor.execute("ALTER TABLE user ADD COLUMN google_picture VARCHAR(255);")
        conn.commit()
        print("Column added successfully.")
    except Exception as e:
        print(f"Error adding column: {e}")
else:
    print("'google_picture' column already exists.")

conn.close()
