import os
import asyncio
import sys
from pathlib import Path
import logging
import csv

# Configure logging to show only INFO and above
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',  # Simplified format
    handlers=[
        logging.StreamHandler()
    ]
)

# Disable debug logging for other modules
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logging.getLogger('openai').setLevel(logging.WARNING)

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent.parent
sys.path.append(str(backend_dir))

from src.services.enhanced_search_service import enhanced_search

async def test_enhanced_search():
    # Test query
    query = "How does changing **NOPTMAX** from a positive value to 0 or negative values affect the computational load of a PEST run?"
    print(f"Searching for: {query}")
    
    # Create debug directory
    debug_dir = os.path.join("debug")
    os.makedirs(debug_dir, exist_ok=True)
    
    try:
        # Run enhanced search
        await enhanced_search(query, debug_dir)
        print("\n✅ Search completed successfully")
        print(f"💾 Results saved in: {os.path.abspath(debug_dir)}")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        print("Traceback:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Change to the backend directory before running tests
    os.chdir(backend_dir)
    asyncio.run(test_enhanced_search()) 