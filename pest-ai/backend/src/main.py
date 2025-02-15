from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import sys
from pathlib import Path
import os
from dotenv import load_dotenv

# Add the src directory to Python path
src_path = str(Path(__file__).parent)
if src_path not in sys.path:
    sys.path.append(src_path)

# Load environment variables from multiple possible locations
env_paths = [
    os.path.join(src_path, '.env'),  # /src/.env
    os.path.join(src_path, '..', '.env'),  # /backend/.env
    '.env'  # current directory
]

for env_path in env_paths:
    if os.path.exists(env_path):
        print(f"Loading environment variables from: {env_path}")
        load_dotenv(env_path)
        break
else:
    print("No .env file found, using system environment variables")

# Verify critical environment variables
for var in ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY']:
    value = os.environ.get(var)
    print(f"{var} exists: {bool(value)}")

# Import routers
from routes.search_routes import router as search_router

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the routers
app.include_router(search_router, prefix="/api/search")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    reload = os.getenv("ENVIRONMENT") != "production"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)
