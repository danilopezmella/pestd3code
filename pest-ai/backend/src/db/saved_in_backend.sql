-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing functions
DROP FUNCTION IF EXISTS match_documents(vector(1536), integer);
DROP FUNCTION IF EXISTS match_documents_by_text(text, integer);
DROP FUNCTION IF EXISTS match_filtered_documents(vector(1536), text[], integer);

-- Create or update indexes
DO $$ 
BEGIN
    -- Índice para embeddings
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'idx_hybrid_search_embedding') THEN
        CREATE INDEX idx_hybrid_search_embedding 
            ON hybrid_search USING ivfflat (embedding vector_cosine_ops);
    END IF;

    -- Índices para búsqueda por texto
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'idx_hybrid_search_content') THEN
        CREATE INDEX idx_hybrid_search_content 
            ON hybrid_search USING GIN (to_tsvector('english', content));
    END IF;
    
    -- ... resto de índices con sus respectivos IF NOT EXISTS ...
END $$;

-- Function for semantic search
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(1536),
    match_count int
)
RETURNS TABLE (
    chunk_id text,
    chunk_index int,
    content text,
    header text,
    level int,
    file_name text,
    prev_id text,
    next_id text,
    summary_self text,
    summary_prev text,
    summary_next text,
    header_level_1 text,
    header_level_2 text,
    header_summary_1 text,
    header_summary_2 text,
    keywords text[],
    similarity float8
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN query
    SELECT
        hs.chunk_id,
        hs.chunk_index,
        hs.content,
        hs.header,
        hs.level,
        hs.file_name,
        hs.prev_id,
        hs.next_id,
        hs.summary_self,
        hs.summary_prev,
        hs.summary_next,
        hs.header_level_1,
        hs.header_level_2,
        hs.header_summary_1,
        hs.header_summary_2,
        hs.keywords,
        (1 - (hs.embedding <=> query_embedding))::float8 as similarity
    FROM hybrid_search hs
    WHERE hs.embedding IS NOT NULL
    ORDER BY hs.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
CREATE OR REPLACE FUNCTION match_documents_by_text(
    search_query text,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    chunk_id text,
    chunk_index int,
    content text,
    header text,
    level int,
    file_name text,
    prev_id text,
    next_id text,
    summary_self text,
    summary_prev text,
    summary_next text,
    header_level_1 text,
    header_level_2 text,
    header_summary_1 text,
    header_summary_2 text,
    keywords text[],
    rank float8
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        hs.chunk_id,
        hs.chunk_index,
        hs.content,
        hs.header,
        hs.level,
        hs.file_name,
        hs.prev_id,
        hs.next_id,
        hs.summary_self,
        hs.summary_prev,
        hs.summary_next,
        hs.header_level_1,
        hs.header_level_2,
        hs.header_summary_1,
        hs.header_summary_2,
        hs.keywords,
        ts_rank_cd(
            setweight(to_tsvector('english', hs.content), 'D') ||
            setweight(to_tsvector('english', hs.header), 'A') ||
            setweight(to_tsvector('english', COALESCE(hs.summary_self, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(hs.summary_prev, '')), 'C') ||
            setweight(to_tsvector('english', COALESCE(hs.summary_next, '')), 'C') ||
            setweight(to_tsvector('english', COALESCE(hs.header_level_1, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(hs.header_level_2, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(array_to_string(hs.keywords, ' '), '')), 'B'),
            websearch_to_tsquery('english', search_query)
        )::float8 as rank
    FROM hybrid_search hs
    WHERE
        hs.keywords IS NOT NULL -- Validar que las keywords no sean nulas
        AND cardinality(hs.keywords) > 0 -- Validar que las keywords no estén vacías
        AND (
            to_tsvector('english', hs.content) @@ websearch_to_tsquery('english', search_query) OR
            to_tsvector('english', hs.header) @@ websearch_to_tsquery('english', search_query) OR
            to_tsvector('english', COALESCE(hs.summary_self, '')) @@ websearch_to_tsquery('english', search_query) OR
            to_tsvector('english', COALESCE(hs.summary_prev, '')) @@ websearch_to_tsquery('english', search_query) OR
            to_tsvector('english', COALESCE(hs.summary_next, '')) @@ websearch_to_tsquery('english', search_query) OR
            to_tsvector('english', COALESCE(hs.header_level_1, '')) @@ websearch_to_tsquery('english', search_query) OR
            to_tsvector('english', COALESCE(hs.header_level_2, '')) @@ websearch_to_tsquery('english', search_query) OR
            to_tsvector('english', COALESCE(array_to_string(hs.keywords, ' '), '')) @@ websearch_to_tsquery('english', search_query)
        )
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;


-- Function for semantic search with pre-filtered documents
CREATE OR REPLACE FUNCTION match_filtered_documents(
    query_embedding vector(1536),
    filtered_ids text[],
    match_count int
)
RETURNS TABLE (
    chunk_id text,
    chunk_index int,
    content text,
    header text,
    level int,
    file_name text,
    prev_id text,
    next_id text,
    summary_self text,
    summary_prev text,
    summary_next text,
    header_level_1 text,
    header_level_2 text,
    header_summary_1 text,
    header_summary_2 text,
    keywords text[],
    similarity float8
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        hs.chunk_id,
        hs.chunk_index,
        hs.content,
        hs.header,
        hs.level,
        hs.file_name,
        hs.prev_id,
        hs.next_id,
        hs.summary_self,
        hs.summary_prev,
        hs.summary_next,
        hs.header_level_1,
        hs.header_level_2,
        hs.header_summary_1,
        hs.header_summary_2,
        hs.keywords,
        (1 - (hs.embedding <=> query_embedding))::float8 AS similarity
    FROM hybrid_search hs
    WHERE hs.chunk_id = ANY(filtered_ids)  -- Filtrar por IDs preseleccionados
    AND hs.embedding IS NOT NULL           -- Validar que los embeddings no sean NULL
    AND hs.keywords IS NOT NULL            -- Ignorar documentos sin keywords
    AND cardinality(hs.keywords) > 0       -- Ignorar documentos con keywords vacíos
    ORDER BY hs.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;