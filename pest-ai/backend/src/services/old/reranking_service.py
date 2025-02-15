import os
import json
from datetime import datetime
from typing import List, Dict, Any

class RerankingService:
    def __init__(self, debug_dir: str = "backend/debug/rerank"):
        self.debug_dir = debug_dir
        os.makedirs(debug_dir, exist_ok=True)

    def rerank_results(
        self,
        main_question: str,
        variations: List[str],
        keywords: List[str],
        search_results: Dict[str, Any],
        subquestion_index: int,
        timestamp: str
    ) -> Dict[str, Any]:
        """Rerank search results and save debug files."""
        
        # 1. Save pre-rerank results
        pre_rerank_data = {
            "subquestion": main_question,
            "variations": variations,
            "keywords": keywords,
            "raw_results": search_results["semantic_search_results"]
        }
        
        pre_rerank_file = os.path.join(
            self.debug_dir, 
            f"pre_rerank_multi_subq_{subquestion_index}_{timestamp}.json"
        )
        with open(pre_rerank_file, "w", encoding="utf-8") as f:
            json.dump(pre_rerank_data, f, indent=2, ensure_ascii=False)

        # 2. Apply reranking
        reranked_results = []
        for result in search_results["semantic_search_results"]:
            semantic_score = result.get("normalized_semantic", 0)
            keyword_score = result.get("normalized_keyword", 0)
            combined_score = result.get("combined_score", 0)
            
            content = result.get("content", "")
            length_factor = self._calculate_length_factor(content)
            
            final_score = combined_score * length_factor
            
            result["reranked_score"] = final_score
            result["debug_factors"] = {
                "length_factor": length_factor,
                "content_length": len(content),
                "semantic_score": semantic_score,
                "keyword_score": keyword_score,
                "combined_score": combined_score,
                "final_score": final_score
            }
            reranked_results.append(result)

        # 3. Deduplicate
        seen_chunks = {}
        for result in reranked_results:
            chunk_id = result["chunk_id"]
            if chunk_id not in seen_chunks or result["reranked_score"] > seen_chunks[chunk_id]["reranked_score"]:
                seen_chunks[chunk_id] = result

        # 4. Get top 5
        final_results = list(seen_chunks.values())
        final_results.sort(key=lambda x: x["reranked_score"], reverse=True)
        top_results = final_results[:5]

        # 5. Save post-rerank results
        post_rerank_data = {
            "subquestion": main_question,
            "variations": variations,
            "keywords": keywords,
            "top_results": top_results,
            "metrics": {
                "raw_results_count": len(search_results["semantic_search_results"]),
                "unique_results_count": len(final_results),
                "variations_count": len(variations)
            }
        }
        
        post_rerank_file = os.path.join(
            self.debug_dir, 
            f"post_rerank_multi_subq_{subquestion_index}_{timestamp}.json"
        )
        with open(post_rerank_file, "w", encoding="utf-8") as f:
            json.dump(post_rerank_data, f, indent=2, ensure_ascii=False)

        return {
            "top_results": top_results,
            "metrics": post_rerank_data["metrics"]
        }

    def _calculate_length_factor(self, content: str) -> float:
        """Calculate length factor based on content length."""
        if len(content) < 200:
            return 0.3
        elif len(content) < 500:
            return 0.7
        return 1.0 