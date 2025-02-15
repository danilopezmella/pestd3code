# ROADMAP: Question-Answer Pipeline

## Services Overview

### 1. Question Processing (`paraphrase_service_nokw.py`)
- **Purpose**: Prepare user question for search
- **Input**: Raw user question
- **Process**:
  - Split complex questions
  - Generate semantic variations
  - Provide fallback variations if error
- **Output**: JSON with subquestions and variations
- **Test**: `test_paraphrase_nokw.py`

### 2. Enhanced Search (`enhanced_search_service.py`)
- **Purpose**: Hybrid search with keyword filtering
- **Input**: Processed questions JSON
- **Process**:
  - Extract keywords (Python)
  - Filter by exact keyword match (SQL)
  - Hybrid search:
    - Semantic search (embeddings)
    - Keyword search (BM25)
  - Score combination and deduplication
- **Output**: JSON with ranked results per subquestion
- **Test**: `test_enhanced_search.py`

### 3. Response Generation (`response_service.py`)
- **Purpose**: Generate structured responses
- **Input**: Enhanced search results
- **Process**: 
  - Format results into sections:
    ```
    ❓ Question
    📖 Definition
    🎯 Values/Settings  
    🔍 Implications
    💡 Examples
    🤔 Follow-up Questions
    ```
- **Output**: Formatted markdown with emojis
- **Test**: `test_response.py`

## Data Flow

flowchart TD
    A[User Question] --> B[Question Processing]
    B --> C[Enhanced Search]
    C --> D[Response Generation]
    D --> E[Final Response]

    subgraph QP[1. Question Processing]
      B --> B1[Split Questions]
      B1 --> B2[Generate Variations]
      B2 --> B3[JSON Output]
    end

    subgraph ES[2. Enhanced Search]
      C --> C1[Extract Keywords]
      C1 --> C2[SQL Filtering]
      C2 --> C3[Hybrid Search]
      C3 --> C4[Score & Dedupe]
    end

    subgraph RG[3. Response Generation]
      D --> D1[Format Sections]
      D1 --> D2[Add Citations]
      D2 --> D3[Markdown Output]
    end

# Start of Selection
# Start Generation Here
![Flowchart of Data Flow](file:///C:/Users/gwm/Pictures/Screenshots/mermaid.png)
This flowchart illustrates the data flow through the system, showing how user questions are processed, enhanced search is conducted, and structured responses are generated.
# End of Selection


## Testing Strategy
- Unit tests per service
- Integration tests end-to-end
- Test files match service names

## Future Improvements
1. Enhance keyword extraction
2. Optimize SQL queries
3. Expand response formats
4. Add more tests

## Dependencies
- Python 3.8+
- PostgreSQL
- OpenAI API
- Supabase

## Documentation
- README.md per service
- API docs
- Testing docs