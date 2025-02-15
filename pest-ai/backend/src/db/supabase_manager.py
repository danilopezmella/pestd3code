from supabase import create_client
import os
from dotenv import load_dotenv

class SupabaseManager:
    def __init__(self):
        load_dotenv()
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Missing Supabase credentials in .env file")
            
        self.supabase = create_client(self.supabase_url, self.supabase_key)
        
    def match_documents_by_text(self, query: str | list[str], limit: int = 5):
        """Full text search using PostgreSQL."""
        print("\n🔍 DEBUG: Starting text search...")
        print(f"📥 Input query: {query}")
            
        # Input validation
        if not query:
            raise ValueError("Query cannot be empty")
            
        # Use the improved question directly
        try:
            search_query = query.strip() if isinstance(query, str) else query[0].strip()
        except Exception as e:
            print(f"❌ Query processing error: {str(e)}")
            raise
            
        print(f"🔎 Final search query: {search_query}")
            
        # Execute search with detailed error logging
        try:
            print(f"🔄 Executing RPC call with params: search_query='{search_query}', match_count={limit}")
            response = self.supabase.rpc(
                'match_documents_by_text',
                {
                    'search_query': search_query,
                    'match_count': limit
                }
            ).execute()
            
            print(f"📊 Response status: {getattr(response, 'status_code', 'unknown')}")
            # Safely print truncated response data
            if hasattr(response, 'data') and response.data:
                print("📊 Response data preview:")
                for idx, item in enumerate(response.data[:3]):  # Show first 3 results
                    content_preview = item.get('content', '')[:10]  # First 100 chars of content
                    print(f"  Result {idx + 1}: {content_preview}...")
            else:
                print("📊 Response data: no data")
            print(f"📊 Response error: {getattr(response, 'error', 'none')}")
            
            if not response.data:
                print("⚠️  No results found in database")
            else:
                print(f"✅ Found {len(response.data)} results")
            return response
            
        except Exception as e:
            import traceback
            print(f"❌ Search error type: {type(e)}")
            print(f"❌ Search error message: {str(e)}")
            print(f"❌ Traceback:\n{traceback.format_exc()}")
            raise
        
    def match_documents_by_embedding(self, embedding: list, limit: int = 5):
        """Semantic search using embeddings"""
        print("\n🧠 DEBUG: Starting embedding search...")
        
        try:
            print(f"📥 Input embedding length: {len(embedding)}")
            print(f"📥 Input embedding type: {type(embedding)}")
            print(f"📥 First few values: {embedding[:3] if len(embedding) > 3 else embedding}")
        except Exception as e:
            print(f"❌ Embedding validation error: {str(e)}")
            raise
            
        try:
            print(f"🔄 Executing RPC call with params: embedding_length={len(embedding)}, match_count={limit}")
            response = self.supabase.rpc(
                'match_documents',
                {
                    'query_embedding': embedding,
                    'match_count': limit
                }
            ).execute()
            
            # print(f"📊 Response status: {getattr(response, 'status_code', 'unknown')}")
            # Safely print truncated response data
            if hasattr(response, 'data') and response.data:
                print("📊 Response data preview:")
                for idx, item in enumerate(response.data[:3]):  # Show first 3 results
                    content_preview = item.get('content', '')[:10]  # First 100 chars of content
                    print(f"  Result {idx + 1}: {content_preview}...")
            else:
                print("📊 Response data: no data")
            print(f"📊 Response error: {getattr(response, 'error', 'none')}")
            
            if not response.data:
                print("⚠️  No results found in database")
            else:
                print(f"✅ Found {len(response.data)} results")
            return response
            
        except Exception as e:
            import traceback
            print(f"❌ Search error type: {type(e)}")
            print(f"❌ Search error message: {str(e)}")
            print(f"❌ Traceback:\n{traceback.format_exc()}")
            raise

    def match_documents_by_text_filtered(self, query: str, filtered_ids: list[str], limit: int = 5):
        """Full text search using PostgreSQL with pre-filtered document IDs."""
        print("\n🔍 DEBUG: Starting filtered text search...")
        print(f"📥 Input query: {query}")
        print(f"📥 Filtered IDs count: {len(filtered_ids)}")
            
        # Input validation
        if not query:
            raise ValueError("Query cannot be empty")
            
        search_query = query.strip()
        print(f"🔎 Final search query: {search_query}")
            
        # Execute search with detailed error logging
        try:
            print(f"🔄 Executing RPC call with params: search_query='{search_query}', match_count={limit}, filtered_ids={len(filtered_ids)} items")
            response = self.supabase.rpc(
                'match_documents_by_text_filtered',
                {
                    'search_query': search_query,
                    'filtered_ids': filtered_ids,
                    'match_count': limit
                }
            ).execute()
            
            print(f"📊 Response status: {getattr(response, 'status_code', 'unknown')}")
            if hasattr(response, 'data') and response.data:
                print("📊 Response data preview:")
                for idx, item in enumerate(response.data[:3]):
                    content_preview = item.get('content', '')[:100]
                    print(f"  Result {idx + 1}: {content_preview}...")
            else:
                print("📊 Response data: no data")
            print(f"📊 Response error: {getattr(response, 'error', 'none')}")
            
            if not response.data:
                print("⚠️  No results found in filtered set")
            else:
                print(f"✅ Found {len(response.data)} results")
            return response
            
        except Exception as e:
            import traceback
            print(f"❌ Search error type: {type(e)}")
            print(f"❌ Search error message: {str(e)}")
            print(f"❌ Traceback:\n{traceback.format_exc()}")
            raise

    def match_documents_by_embedding_filtered(self, embedding: list, filtered_ids: list[str], limit: int = 5):
        """Semantic search using embeddings with pre-filtered document IDs."""
        print("\n🧠 DEBUG: Starting filtered embedding search...")
        print(f"📥 Filtered IDs count: {len(filtered_ids)}")
        
        try:
            print(f"📥 Input embedding length: {len(embedding)}")
            print(f"📥 Input embedding type: {type(embedding)}")
            print(f"📥 First few values: {embedding[:3] if len(embedding) > 3 else embedding}")
        except Exception as e:
            print(f"❌ Embedding validation error: {str(e)}")
            raise
            
        try:
            print(f"🔄 Executing RPC call with params: embedding_length={len(embedding)}, match_count={limit}, filtered_ids={len(filtered_ids)} items")
            response = self.supabase.rpc(
                'match_filtered_documents',
                {
                    'query_embedding': embedding,
                    'filtered_ids': filtered_ids,
                    'match_count': limit
                }
            ).execute()
            
            print(f"📊 Response status: {getattr(response, 'status_code', 'unknown')}")
            if hasattr(response, 'data') and response.data:
                print("📊 Response data preview:")
                for idx, item in enumerate(response.data[:3]):
                    content_preview = item.get('content', '')[:100]
                    print(f"  Result {idx + 1}: {content_preview}...")
            else:
                print("📊 Response data: no data")
            print(f"📊 Response error: {getattr(response, 'error', 'none')}")
            
            if not response.data:
                print("⚠️  No results found in filtered set")
            else:
                print(f"✅ Found {len(response.data)} results")
            return response
            
        except Exception as e:
            import traceback
            print(f"❌ Search error type: {type(e)}")
            print(f"❌ Search error message: {str(e)}")
            print(f"❌ Traceback:\n{traceback.format_exc()}")
            raise 