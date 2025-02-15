from typing import Dict, Any

def format_result_to_md(result: Dict[str, Any]) -> str:
    """
    Format a single search result into the standardized MD format for LLM consumption.
    """
    return f"""## Context

### Summary
**{result.get('summary_self', 'No summary available')}**

### Header
**{result.get('header', 'No header')}**

### Content
{result.get('content', 'No content')}

### Source
- **File Name:** {result.get('file_name', 'Unknown file')}
- **Main Section:** {result.get('header_level_1', '')}
- **Subsection:** {result.get('header_level_2', '')}

### Additional Summaries
- **Higher-Level Summary:** {result.get('header_summary_1', 'No higher-level summary')}
- **Detailed Summary:** {result.get('header_summary_2', 'No detailed summary')}

### Related Context
- **Previous Summary:** {result.get('summary_prev', 'No previous summary')}
- **Next Summary:** {result.get('summary_next', 'No next summary')}

### Metadata
- **Keywords:** {', '.join(result.get('keywords', []))}
- **Chunk ID:** {result.get('chunk_id', 'Unknown')}
- **Chunk Index:** {result.get('chunk_index', 'Unknown')}
- **Previous Chunk ID:** {result.get('prev_id', 'None')}
- **Next Chunk ID:** {result.get('next_id', 'None')}

---""" 