import os
from datetime import datetime
import json

class DebugService:
    def __init__(self, debug_dir="debug"):
        """Initialize the debug service.
        
        Args:
            debug_dir: Directory to store debug files (default: 'debug')
        """
        self.debug_dir = debug_dir
        self._ensure_debug_dir()
    
    def _ensure_debug_dir(self):
        """Ensure the debug directory exists."""
        if not os.path.exists(self.debug_dir):
            os.makedirs(self.debug_dir)
    
    def _get_timestamp(self):
        """Get current timestamp in the format YYYY-MM-DD_HHMM."""
        return datetime.utcnow().strftime("%Y-%m-%d_%H%M")
    
    def _format_document(self, doc: dict, idx: int, doc_type: str = "semantic") -> str:
        """Format a single document with all its metadata.
        
        Args:
            doc: Document dictionary with all metadata
            idx: Document index
            doc_type: Type of document ("semantic" or "keyword")
        """
        output = []
        output.append(f"\n{idx}. Document ID: {doc.get('chunk_id', 'MISSING')}")
        
        # Basic metadata
        output.append(f"   File: {doc.get('file_name', 'N/A')}")
        output.append(f"   Header: {doc.get('header', 'N/A')}")
        output.append(f"   Level: {doc.get('level', 'N/A')}")
        
        # Navigation path
        output.append(f"   Full Path: {doc.get('header_level_1', 'N/A')} > {doc.get('header_level_2', 'N/A')}")
        
        # Scores
        output.append(f"   Combined Score: {doc.get('combined_score', 0):.3f}")
        if doc_type == "semantic":
            output.append(f"   Similarity: {doc.get('similarity', 0):.3f}")
        else:
            output.append(f"   Rank: {doc.get('rank', 0):.3f}")
        output.append(f"   Normalized Semantic: {doc.get('normalized_semantic', 0):.3f}")
        output.append(f"   Normalized Keyword: {doc.get('normalized_keyword', 0):.3f}")
        
        # Content
        output.append("   Content:")
        output.append("   ```")
        content = doc.get('content', '[No content]')
        for line in content.split('\n'):
            output.append(f"   {line}")
        output.append("   ```")
        
        # Summaries
        output.append(f"   Self Summary: {doc.get('summary_self', 'N/A')}")
        output.append(f"   Previous Summary: {doc.get('summary_prev', 'N/A')}")
        output.append(f"   Next Summary: {doc.get('summary_next', 'N/A')}")
        
        # Header summaries
        output.append(f"   Header Summary Level 1: {doc.get('header_summary_1', 'N/A')}")
        output.append(f"   Header Summary Level 2: {doc.get('header_summary_2', 'N/A')}")
        
        # Navigation
        output.append(f"   Navigation: prev_id={doc.get('prev_id', 'N/A')}, next_id={doc.get('next_id', 'N/A')}")
        
        # Keywords
        output.append(f"   Keywords: {', '.join(doc.get('keywords', []))}")
        
        output.append("\n" + "-"*80)
        return "\n".join(output)

    def _format_reranked_result(self, doc: dict, idx: int) -> str:
        """Format a single result after reranking in a compact format.
        
        Args:
            doc: Document dictionary with scores
            idx: Result index
        """
        output = []
        output.append(f"\n=== Result {idx} ===")
        output.append(f"ID: {doc.get('chunk_id', 'MISSING')}")
        output.append(f"Combined Score: {doc.get('combined_score', 0):.3f}")
        output.append(f"Keyword Score: {doc.get('normalized_keyword', 0):.3f}")
        output.append(f"Semantic Score: {doc.get('normalized_semantic', 0):.3f}")
        output.append(f"Original Rank: {doc.get('rank', 0)}")
        output.append(f"Original Similarity: {doc.get('similarity', 0):.3f}")
        output.append("---")
        return "\n".join(output)

    def create_search_debug_file(self, search_results, query_info):
        """Print search debug information."""
        # print("\n📝 Debug Information Summary:")
        # print(f"🔍 Query: {query_info.get('question', 'N/A')}")
        # print(f"🔑 Keywords: {query_info.get('keywords', [])}")
        # print(f"🔄 Variations: {len(query_info.get('variations', []))}")
        # print(f"📊 Results: {len(search_results.get('semantic_search_results', []))} documents")
        # print("✅ Debug files generated:")
        
        # # Usar el mismo formato que search_routes.py
        # timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        # debug_dir = "backend/debug/rerank"
        # print(f"   - Pre-rerank: {debug_dir}/pre_rerank_multi_subq_1_{timestamp}.json")
        # print(f"   - Post-rerank: {debug_dir}/post_rerank_multi_subq_1_{timestamp}.json")

    def create_variations_debug_file(self, variations_info):
        """Create a debug file for variation analysis.
        
        Args:
            variations_info: Dictionary containing variation information
        """
        timestamp = self._get_timestamp()
        filename = f"{timestamp}_variations.md"
        filepath = os.path.join(self.debug_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"# Variations Analysis - {timestamp} UTC\n\n")
            
            for i in range(variations_info.get('number_of_subquestions', 1)):
                sub_key = f"subquestion{i+1}"
                var_key = f"variations_{sub_key}"
                
                if sub_key in variations_info and var_key in variations_info:
                    f.write(f"## Original Query: \"{variations_info[sub_key]}\"\n\n")
                    f.write("### Generated Variations:\n")
                    
                    for idx, var in enumerate(variations_info[var_key], 1):
                        f.write(f"{idx}. \"{var}\"\n")
                    
                    f.write("\n")
        
        return filepath
    
    def create_metrics_debug_file(self, metrics_info):
        """Create a debug file for search metrics.
        
        Args:
            metrics_info: Dictionary containing metrics information
        """
        timestamp = self._get_timestamp()
        filename = f"{timestamp}_metrics.md"
        filepath = os.path.join(self.debug_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"# Search Metrics - {timestamp} UTC\n\n")
            
            if 'totals' in metrics_info:
                f.write("## Overall Metrics\n")
                totals = metrics_info['totals']
                f.write(f"- Total Documents: {totals.get('total_docs', 0)}\n")
                f.write(f"- Primary Results: {totals.get('primary_docs', 0)}\n")
                f.write(f"- Variation Results: {totals.get('variation_docs', 0)}\n")
            
            if 'scores' in metrics_info:
                f.write("\n## Score Distribution\n")
                scores = metrics_info['scores']
                f.write("```\n")
                f.write(f"Keyword Scores:  {scores.get('keyword_scores', [])}\n")
                f.write(f"Semantic Scores: {scores.get('semantic_scores', [])}\n")
                f.write(f"Combined Scores: {scores.get('combined_scores', [])}\n")
                f.write("```\n")
        
        return filepath 