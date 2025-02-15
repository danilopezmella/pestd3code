import json
from datetime import datetime
from pathlib import Path
import logging

class DebugSearchService:
    """Simple debug service for search results that generates markdown output"""
    
    def __init__(self, debug_dir: str = "debug"):
        self.debug_dir = Path(debug_dir)
        self.debug_dir.mkdir(exist_ok=True)
        
    def format_result(self, result: dict, index: int) -> str:
        """Format a single search result into markdown"""
        md = f"\n## Result {index}\n\n"
        md += f"Document ID: {result.get('chunk_id', 'N/A')}\n"
        md += f"File: {result.get('file_name', 'N/A')}\n"
        md += f"Header: {result.get('header', 'N/A')}\n"
        md += f"Level: {result.get('level', 'N/A')}\n\n"
        
        # Content section
        md += "Content:\n```\n"
        md += f"{result.get('content', 'N/A')}\n"
        md += "```\n\n"
        
        # Always show summaries section
        md += "Summaries:\n"
        # Self summary - should always exist
        self_summary = result.get('summary_self')
        if self_summary and str(self_summary).strip():
            md += f"Self Summary: {self_summary}\n"
        else:
            md += "Self Summary: [MISSING - This is unexpected as all documents should have a self summary]\n"
            
        # Previous summary - optional
        prev_summary = result.get('summary_prev')
        if prev_summary and str(prev_summary).strip():
            md += f"Previous Summary: {prev_summary}\n"
        else:
            md += "Previous Summary: [Not available - This is normal for first sections]\n"
            
        # Next summary - optional
        next_summary = result.get('summary_next')
        if next_summary and str(next_summary).strip():
            md += f"Next Summary: {next_summary}\n"
        else:
            md += "Next Summary: [Not available - This is normal for last sections]\n"
        
        # Header summaries - should exist for most documents
        md += "\nHeader Summaries:\n"
        header_1 = result.get('header_level_1')
        if header_1 and str(header_1).strip():
            md += f"Level 1: {header_1}\n"
        else:
            md += "Level 1: [MISSING - This is unexpected as most documents should have L1 header summary]\n"
            
        header_2 = result.get('header_level_2')
        if header_2 and str(header_2).strip():
            md += f"Level 2: {header_2}\n"
        else:
            md += "Level 2: [MISSING - This is unexpected as most documents should have L2 header summary]\n"
        
        # Scores
        md += "\nScores:\n"
        md += f"- Combined Score: {result.get('combined_score', 0):.3f}\n"
        md += f"- Keyword Score: {result.get('normalized_keyword', 0):.3f}\n"
        md += f"- Semantic Score: {result.get('normalized_semantic', 0):.3f}\n"
        md += f"- Original Rank: {result.get('rank', 0):.1f}\n"
        md += f"- Original Similarity: {result.get('similarity', 0):.3f}\n"
        
        md += "\n---\n"
        return md
        
    def save_search_results(self, query: str, results: dict) -> str:
        """Save search results in markdown format"""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d_%H%M")
        filename = f"{timestamp}_search_results.md"
        filepath = self.debug_dir / filename
        
        # Extract keywords if present
        keywords = results.get('keywords', [])
        
        # Start building markdown content
        md = f"# Search Results for: {query}\n\n"
        if keywords:
            md += f"Keywords: {', '.join(keywords)}\n\n"
        
        # Add semantic search results
        semantic_results = results.get('semantic_search_results', [])
        for i, result in enumerate(semantic_results, 1):
            md += self.format_result(result, i)
            
        # Save to file
        filepath.write_text(md, encoding='utf-8')
        logging.info(f"Search results saved to {filepath}")
        
        return str(filepath) 