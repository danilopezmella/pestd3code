from reranking_service import ReRankingService
import json
from pathlib import Path
import os

def test_reranking():
    # Initialize service
    service = ReRankingService()
    
    # Get the absolute path to the backend directory
    current_dir = Path(__file__).parent  # services directory
    backend_dir = current_dir.parent.parent  # backend directory
    
    # Path to debug file
    debug_file = backend_dir / "debug/2025-02-01_1728_search_results.md"
    
    if not debug_file.exists():
        print(f"⚠️ Debug file not found at: {debug_file}")
        return
    
    # Test query
    query = "what is pestmode"
    
    print(f"🔍 Processing debug file: {debug_file}")
    print(f"📝 Query: {query}")
    
    # Rerank results
    results = service.rerank_from_md(str(debug_file), query)
    
    # Save results
    output_file = debug_file.parent / f"{debug_file.stem}_reranked.json"
    service.save_reranked_results(results, str(output_file))
    
    print(f"\n✅ Results saved to: {output_file}")
    print(f"📊 Found {len(results.results)} results")
    print(f"🏷️ Detected keywords: {results.detected_keywords}")
    
    # Print agent analysis
    if results.agent_analysis:
        print("\n🤖 Agent Analysis:")
        print(f"   Ranking Explanation: {results.agent_analysis['ranking_explanation']}")
        print("\n   Search Quality:")
        quality = results.agent_analysis['search_quality']
        print(f"   - Coverage: {quality['coverage']:.2f}")
        print(f"   - Diversity: {quality['diversity']:.2f}")
        print(f"   - Relevance: {quality['relevance']:.2f}")
    
    # Print top 5 results summary
    print("\n🔝 Top 5 Results:")
    for i, result in enumerate(results.results[:5], 1):
        print(f"\n{i}. {result.header}")
        print(f"   Combined Score: {result.scores.combined_score:.3f}")
        if result.scores.agent_score is not None:
            print(f"   Agent Score: {result.scores.agent_score:.3f}")
        if result.agent_explanation:
            print(f"   Explanation: {result.agent_explanation}")
        print(f"   File: {result.file_name}")
        print(f"   Summary: {result.summary_self[:100]}...")

if __name__ == "__main__":
    test_reranking() 