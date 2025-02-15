import asyncio
import json
import sys
import logging
from pathlib import Path

# Configure logging to show only INFO and above
logging.basicConfig(level=logging.INFO)

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent.parent
sys.path.append(str(backend_dir))

from src.services.search_service_single import SearchServiceSingle
from src.services.debug_search_service import DebugSearchService

async def run_test_case(test: dict, case_num: int, debug_dir: Path) -> None:
    """Run a single test case and print its results"""
    print(f"\n📝 Test Case {case_num}: {test['description']}")
    print(f"Input Query: {test['query']}")
    
    try:
        # Initialize services
        search_service = SearchServiceSingle()
        debug_service = DebugSearchService(str(debug_dir))
        
        # Process the question
        results = search_service.hybrid_search(test['query'])
        
        # Print results summary
        print("\n✅ Results:")
        print(f"Number of semantic results: {len(results['semantic_search_results'])}")
        print(f"Number of keyword results: {len(results['keyword_search_results'])}")
        
        # Save debug output in both formats
        # 1. JSON format (for complete data)
        json_file = debug_dir / f"search_test_{case_num}.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
            
        # 2. Markdown format (for readability)
        md_file = debug_service.save_search_results(test['query'], results)
        
        print(f"\n💾 Debug output saved to:")
        print(f"- JSON: {json_file}")
        print(f"- Markdown: {md_file}")
        
    except Exception as e:
        print(f"\n❌ Error in test case {case_num}: {str(e)}")
        import traceback
        print(f"Traceback:\n{traceback.format_exc()}")

async def test_search():
    """Test the search service functionality with a simple test case"""
    # Test cases
    test_cases = [
        {
            "query": "what is noptmax",
            "description": "Simple direct question about NOPTMAX"
        }
    ]
    
    print("\n🧪 Starting Search Service Tests")
    print("=" * 50)
    
    # Ensure debug directory exists
    debug_dir = backend_dir / "debug"
    debug_dir.mkdir(exist_ok=True)
    
    # Run each test case
    for i, test in enumerate(test_cases, 1):
        await run_test_case(test, i, debug_dir)
    
    print("\n🏁 Testing Complete")

if __name__ == "__main__":
    # Change to the backend directory before running tests
    import os
    os.chdir(backend_dir)
    asyncio.run(test_search()) 