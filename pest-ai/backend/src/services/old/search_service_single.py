import os
from src.utils.config import OPENAI_API_KEY
from openai import OpenAI
from src.db.supabase_manager import SupabaseManager
from src.services.debug_service import DebugService

class SearchServiceSingle:
    def __init__(self, default_alpha: float = 0.3):
        """Initialize the search service.
        
        Args:
            default_alpha: Weight for keyword scores in hybrid search (0 to 1).
                         0 = only semantic scores
                         1 = only keyword scores
                         0.5 = equal weight (default)
        """
        if not 0 <= default_alpha <= 1:
            raise ValueError("Alpha must be between 0 and 1")
            
        self.default_alpha = default_alpha
        self.supabase = SupabaseManager()
        self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
        self.debug_service = DebugService()

    def get_embedding(self, text: str) -> list:
        """Get embedding for search query using OpenAI."""
        print(f"\n🔤 Converting to embedding: '{text}'")
        response = self.openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=text
        )
        return response.data[0].embedding

    def hybrid_search(self, question: str, limit: int = 5, alpha: float = None):
        """Runs hybrid search for a single question.
        
        Args:
            question: The question to search for
            limit: Maximum number of results to return
            alpha: Weight for keyword scores (0 to 1). If None, uses default_alpha.
                  0 = only semantic scores
                  1 = only keyword scores
                  0.5 = equal weight
        """
        try:
            # Validate input
            if not question:
                raise ValueError("question cannot be empty")
            
            # Use default alpha if none provided
            alpha = self.default_alpha if alpha is None else alpha
            
            # Validate alpha
            if not 0 <= alpha <= 1:
                raise ValueError("Alpha must be between 0 and 1")
                
            print(f"\n⚖️  Using alpha={alpha:.2f} (keyword={alpha:.2f}, semantic={1-alpha:.2f})")
            
            structured_results = {}

            # Create query info for debug
            query_info = {
                'search_method': 'hybrid',
                'alpha': alpha,
                'number_of_subquestions': 1
            }

            print(f"\n🔍 Processing query: '{question}'")
            
            try:
                # Get results from query
                print("\n🔍 Running semantic search for query")
                embedding = self.get_embedding(question)
                semantic_response = self.supabase.match_documents_by_embedding(
                    embedding=embedding,
                    limit=limit * 2
                )
                if semantic_response.data:
                    print("\n📊 Results with similarity scores:")
                    for result in semantic_response.data:
                        similarity = result.get('similarity', 0)
                        content = result.get('content', '')[:200]
                        header = result.get('header', '')
                        print(f"📝 Similarity: [{similarity:.4f}]")
                        print(f"   Header: {header}")
                        print(f"   Content: {content}...")
                        print("   " + "-"*80)

                print("\n🔍 Running keyword search for query")
                keyword_response = self.supabase.match_documents_by_text(
                    query=question,
                    limit=limit * 2
                )
                if keyword_response.data:
                    print("\n📊 Results with rank scores:")
                    for result in keyword_response.data:
                        rank = result.get('rank', 0)
                        content = result.get('content', '')[:200]
                        header = result.get('header', '')
                        print(f"📝 Rank: [{rank:.4f}]")
                        print(f"   Header: {header}")
                        print(f"   Content: {content}...")
                        print("   " + "-"*80)

                if not semantic_response.data and not keyword_response.data:
                    print(f"⚠️  Warning: No results found for query: '{question}'")
                    return {
                        "semantic_search_results": [],
                        "keyword_search_results": []
                    }

                # Create combined results dictionary
                combined_results = {}
                skipped_docs = 0  # Counter for skipped documents
                
                def add_to_combined_results(doc, source_type="semantic"):
                    """Helper to safely add documents to combined results."""
                    if not doc:  # Skip empty documents
                        return False
                        
                    if 'chunk_id' not in doc:
                        nonlocal skipped_docs
                        skipped_docs += 1
                        print(f"⚠️  Warning: Document without chunk_id found in {source_type} results")
                        return False
                    return True

                # Process semantic results
                for doc in (semantic_response.data or []):
                    if add_to_combined_results(doc, "semantic"):
                        doc['normalized_semantic'] = doc.get('similarity', 0)
                        doc['normalized_keyword'] = 0
                        combined_results[doc['chunk_id']] = doc
                
                # Process keyword results
                for doc in (keyword_response.data or []):
                    if add_to_combined_results(doc, "keyword"):
                        doc['normalized_keyword'] = doc.get('rank', 0)
                        if doc['chunk_id'] in combined_results:
                            combined_results[doc['chunk_id']]['normalized_keyword'] = doc.get('rank', 0)
                        else:
                            doc['normalized_semantic'] = 0
                            combined_results[doc['chunk_id']] = doc

                if skipped_docs > 0:
                    print(f"\n⚠️  Warning: Skipped {skipped_docs} documents due to missing chunk_id")

                # Calculate combined scores
                results_list = []
                for doc in combined_results.values():
                    doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                    results_list.append(doc)

                # Sort by combined score
                results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

                # Print results debug info
                print(f"\n🔄 Final Results:")
                print(f"📊 Total unique documents found: {len(results_list)}")
                for idx, doc in enumerate(results_list[:5], 1):
                    print(f"\n=== Result {idx} ===")
                    print(f"ID: {doc.get('chunk_id', 'MISSING')}")
                    print(f"Combined Score: {doc['combined_score']:.3f}")
                    print("---")

                # Store results
                structured_results = {
                    "semantic_search_results": results_list[:limit],
                    "keyword_search_results": results_list[:limit]
                }

                # Create debug files
                query_info['question'] = question
                self.debug_service.create_search_debug_file(structured_results, query_info)
                
                # Create metrics debug
                metrics_info = {
                    'totals': {
                        'total_docs': len(results_list),
                        'unique_docs': len(set(doc['chunk_id'] for doc in results_list))
                    }
                }
                self.debug_service.create_metrics_debug_file(metrics_info)
                
                return structured_results

            except Exception as e:
                print(f"\n❌ Error processing query: {str(e)}")
                return {
                    "semantic_search_results": [],
                    "keyword_search_results": []
                }

        except Exception as e:
            print(f"\n❌ Fatal error in hybrid_search: {str(e)}")
            return {
                "error": str(e),
                "semantic_search_results": [],
                "keyword_search_results": []
            }

    def hybrid_search_with_keywords(self, question: str, keywords: list[str], limit: int = 5, alpha: float = None):
        """Hybrid search with keyword filtering for a single question.
        
        Args:
            question: The question to search for
            keywords: List of keywords to filter by
            limit: Maximum number of results to return
            alpha: Weight for keyword scores (0 to 1). If None, uses default_alpha.
        """
        try:
            alpha = alpha if alpha is not None else self.default_alpha
            
            # Create query info for debug
            query_info = {
                'search_method': 'hybrid_filtered',
                'alpha': alpha,
                'number_of_subquestions': 1,
                'question': question,
                'keywords': keywords
            }

            if not keywords:
                print(f"⚠️  No keywords provided, falling back to regular hybrid search")
                return self.hybrid_search(question, limit, alpha)

            print(f"\n🔍 Processing query with keywords: '{question}'")
            print(f"📑 Using keywords filter: {keywords}")

            try:
                # 1. First get documents matching keywords
                print(f"\n🔍 Getting keyword matches")
                keyword_response = self.supabase.match_documents_by_text(
                    " ".join(keywords),
                    limit=10000  # Get a large initial set
                )
                
                # Get filtered IDs
                filtered_ids = []
                if keyword_response.data:
                    filtered_ids = [doc['chunk_id'] for doc in keyword_response.data]
                    print(f"📊 Found {len(filtered_ids)} matches from keywords")

                if not filtered_ids:
                    print(f"⚠️  No documents found matching keywords: {keywords}")
                    return {
                        "semantic_search_results": [],
                        "keyword_search_results": []
                    }

                # 2. Run both semantic and keyword search on filtered documents
                combined_results = {}
                
                # Semantic search on filtered docs
                print(f"\n🔍 Running semantic search on filtered documents")
                embedding = self.get_embedding(question)
                semantic_response = self.supabase.match_documents_by_embedding_filtered(
                    embedding=embedding,
                    filtered_ids=filtered_ids,
                    limit=limit * 2
                )

                # Process semantic results
                if semantic_response.data:
                    print(f"📊 Found {len(semantic_response.data)} semantic matches")
                    for doc in semantic_response.data:
                        doc['normalized_semantic'] = doc.get('similarity', 0)
                        doc['normalized_keyword'] = 0
                        combined_results[doc['chunk_id']] = doc

                # Keyword search on filtered docs
                print(f"\n🔍 Running keyword search on filtered documents")
                keyword_response_filtered = self.supabase.match_documents_by_text_filtered(
                    query=question,
                    filtered_ids=filtered_ids,
                    limit=limit * 2
                )

                # Process keyword results
                if keyword_response_filtered.data:
                    print(f"📊 Found {len(keyword_response_filtered.data)} keyword matches")
                    for doc in keyword_response_filtered.data:
                        doc['normalized_keyword'] = doc.get('rank', 0)
                        if doc['chunk_id'] in combined_results:
                            combined_results[doc['chunk_id']]['normalized_keyword'] = doc.get('rank', 0)
                        else:
                            doc['normalized_semantic'] = 0
                            combined_results[doc['chunk_id']] = doc

                # Calculate combined scores
                results_list = []
                for doc in combined_results.values():
                    doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                    results_list.append(doc)

                # Sort by combined score
                results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

                # Print results debug info
                print(f"\n🔄 Final Results:")
                print(f"📊 Total unique documents found: {len(results_list)}")
                for idx, doc in enumerate(results_list[:5], 1):
                    print(f"\n=== Result {idx} ===")
                    print(f"ID: {doc.get('chunk_id', 'MISSING')}")
                    print(f"Combined Score: {doc['combined_score']:.3f}")
                    print("---")

                # Store results
                structured_results = {
                    "semantic_search_results": results_list[:limit],
                    "keyword_search_results": results_list[:limit]
                }

                # Create debug files
                self.debug_service.create_search_debug_file(structured_results, query_info)
                
                # Create metrics debug
                metrics_info = {
                    'totals': {
                        'total_docs': len(results_list),
                        'unique_docs': len(set(doc['chunk_id'] for doc in results_list))
                    }
                }
                self.debug_service.create_metrics_debug_file(metrics_info)
                
                return structured_results

            except Exception as e:
                print(f"\n❌ Error processing keyword-filtered search: {str(e)}")
                return {
                    "semantic_search_results": [],
                    "keyword_search_results": []
                }

        except Exception as e:
            print(f"\n❌ Fatal error in hybrid_search_with_keywords: {str(e)}")
            return {
                "error": str(e),
                "semantic_search_results": [],
                "keyword_search_results": []
            } 