import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

def get_db_connection():
    """Creates and returns a connection to Supabase (PostgreSQL)."""
    
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT")
    )
