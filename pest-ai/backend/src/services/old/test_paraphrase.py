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

from src.services.paraphrase_service import process_question

async def print_subquestion_results(result: dict, index: int) -> None:
    """Print the results for a single sub-question in a formatted way"""
    sub_key = f"subquestion{index}"
    var_key = f"variations_subquestion{index}"
    key_key = f"keywords_found_subquestion{index}"
    
    print(f"\nSub-question {index}:")
    print(f"- Improved: {result.get(sub_key, 'N/A')}")
    
    print("- Variations:")
    for var in result.get(var_key, []):
        print(f"  • {var}")
    
    print("- Keywords:")
    keywords = result.get(key_key, [])
    if keywords:
        for kw in keywords:
            print(f"  • {kw}")
    else:
        print("  • No keywords found")

async def run_test_case(test: dict, case_num: int, debug_dir: Path) -> None:
    """Run a single test case and print its results"""
    print(f"\n📝 Test Case {case_num}: {test['description']}")
    print(f"Input Query: {test['query']}")
    
    try:
        # Process the question
        result = await process_question(test['query'])
        
        # Print results
        print("\n✅ Results:")
        print(f"Number of sub-questions: {result.get('number_of_subquestions', 0)}")
        
        # Print each sub-question's results
        for j in range(result.get('number_of_subquestions', 0)):
            await print_subquestion_results(result, j+1)
        
        # Save debug output
        debug_file = debug_dir / f"paraphrase_test_{case_num}.json"
        with open(debug_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        print(f"\n💾 Debug output saved to: {debug_file}")
        
    except Exception as e:
        print(f"\n❌ Error in test case {case_num}: {str(e)}")
        import traceback
        print(f"Traceback:\n{traceback.format_exc()}")

async def test_paraphrase():
    """Test the paraphrase service functionality with various test cases"""
    # Test cases
    test_cases = [
        {
            "query": "what is noptmax",
            "description": "Simple direct question"
        },
        {
            "query": "lamforgive whts da icor, hel p with numlam?",
            "description": "Complex question with multiple parts"
        },
        {
            "query": "show me examples of using jacupdate, nobs and whats npar",
            "description": "Request for examples"
        }
    ]
    
    print("\n🧪 Starting Paraphrase Service Tests")
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
    asyncio.run(test_paraphrase()) 