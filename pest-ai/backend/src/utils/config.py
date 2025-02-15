import os
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file if it exists (for local development)
load_dotenv()

# Debug: Print environment variables (safely)
logger.info("Checking environment variables in config.py...")
logger.info(f"OPENAI_API_KEY exists: {bool(os.environ.get('OPENAI_API_KEY'))}")
logger.info(f"SUPABASE_URL exists: {bool(os.environ.get('SUPABASE_URL'))}")
logger.info(f"SUPABASE_KEY exists: {bool(os.environ.get('SUPABASE_KEY'))}")

# API Keys - Read directly from os.environ to ensure we get the latest values
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    logger.warning("⚠️ OPENAI_API_KEY is not configured. Application may not work properly.")

# Supabase config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
if not SUPABASE_URL:
    logger.warning("⚠️ SUPABASE_URL is not configured. Application may not work properly.")

SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not SUPABASE_KEY:
    logger.warning("⚠️ SUPABASE_KEY is not configured. Application may not work properly.")

# App config
PORT = int(os.environ.get("PORT", "8000"))
DEBUG = os.environ.get("DEBUG", "False").lower() == "true"
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")

# Logging
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

# Critical configuration validation in production
if ENVIRONMENT == "production":
    missing_vars = []
    if not OPENAI_API_KEY:
        missing_vars.append("OPENAI_API_KEY")
    if not SUPABASE_URL:
        missing_vars.append("SUPABASE_URL")
    if not SUPABASE_KEY:
        missing_vars.append("SUPABASE_KEY")
        
    if missing_vars:
        error_msg = "Error: The following environment variables are required in production:\n"
        for var in missing_vars:
            error_msg += f"- {var}\n"
            logger.error(f"Missing required environment variable: {var}")
        raise ValueError(error_msg)