import os
from utils.config import OPENAI_API_KEY
from openai import OpenAI
from db.supabase_manager import SupabaseManager
from services.debug_service import DebugService
from typing import List
import json
from datetime import datetime

from services.format_service import format_result_to_md

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

                    print("\n🧪 Testing score normalization:")
                    self._normalize_scores(semantic_response.data, 'similarity')

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
                        doc['normalized_semantic'] = doc.get('normalized_similarity', 0)
                        doc['normalized_keyword'] = 0
                        doc['found_in'] = ['original']
                        combined_results[doc['chunk_id']] = doc
                
                # Process keyword results
                for doc in (keyword_response.data or []):
                    if add_to_combined_results(doc, "keyword"):
                        doc['normalized_keyword'] = doc.get('normalized_rank', 0)
                        if doc['chunk_id'] in combined_results:
                            combined_results[doc['chunk_id']]['normalized_keyword'] = doc.get('normalized_rank', 0)
                            if 'original' not in combined_results[doc['chunk_id']]['found_in']:
                                combined_results[doc['chunk_id']]['found_in'].append('original')
                        else:
                            doc['normalized_semantic'] = 0
                            doc['found_in'] = ['original']
                            combined_results[doc['chunk_id']] = doc

                if skipped_docs > 0:
                    print(f"\n⚠️  Warning: Skipped {skipped_docs} documents due to missing chunk_id")

                # Calculate combined scores
                results_list = []
                for doc in combined_results.values():
                    doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                    # Add debug factors
                    doc['debug_factors'] = {
                        "semantic_score": doc.get('normalized_semantic', 0),
                        "keyword_score": doc.get('normalized_keyword', 0),
                        "combined_score": doc['combined_score'],
                        "final_score": doc['combined_score'],
                        "length_factor": 1.0
                    }
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
                
                # # Create metrics debug
                # metrics_info = {
                #     'totals': {
                #         'total_docs': len(results_list),
                #         'unique_docs': len(set(doc['chunk_id'] for doc in results_list))
                #     }
                # }
                # self.debug_service.create_metrics_debug_file(metrics_info)
                
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

    def hybrid_search_with_keywords(self, question: str, variations: list[str], keywords: list[str], limit: int = 5, alpha: float = None):
        """Runs hybrid search with keyword filtering for multiple variations.
        
        Args:
            question: The original search query
            variations: List of question variations to also search for
            keywords: List of keywords that MUST appear in the results
            limit: Maximum number of results to return
            alpha: Weight for keyword scores (0 to 1)
        """
        try:
            # Use default alpha if none provided
            alpha = self.default_alpha if alpha is None else alpha
            
            # Validate alpha
            if not 0 <= alpha <= 1:
                raise ValueError("Alpha must be between 0 and 1")
                
            print(f"\n⚖️  Using alpha={alpha:.2f} (keyword={alpha:.2f}, semantic={1-alpha:.2f})")
            
            # Create query info for debug
            query_info = {
                'search_method': 'hybrid_with_keywords',
                'alpha': alpha,
                'keywords': keywords,
                'variations': variations
            }

            # If no keywords provided, fall back to regular hybrid search
            if not keywords:
                print("\n⚠️ No keywords provided, falling back to regular hybrid search")
                
                # Initialize combined results
                all_results = {}
                
                # Process original question first
                print(f"\n🔍 Processing original question: '{question}'")
                results = self.hybrid_search(question, limit, alpha)
                for doc in results.get("semantic_search_results", []):
                    doc['found_in'] = ['original']
                    all_results[doc['chunk_id']] = doc
                
                # Process each variation if any
                if variations:
                    for i, variation in enumerate(variations, 1):
                        variation_key = f"variation_{i}"
                        print(f"\n🔍 Processing variation {i}: '{variation}'")
                        var_results = self.hybrid_search(variation, limit, alpha)
                        for doc in var_results.get("semantic_search_results", []):
                            if doc['chunk_id'] in all_results:
                                if doc.get('combined_score', 0) > all_results[doc['chunk_id']].get('combined_score', 0):
                                    all_results[doc['chunk_id']] = doc
                                if variation_key not in all_results[doc['chunk_id']]['found_in']:
                                    all_results[doc['chunk_id']]['found_in'].append(variation_key)
                            else:
                                doc['found_in'] = [variation_key]
                                all_results[doc['chunk_id']] = doc
                
                # Convert to list and sort by score
                results_list = list(all_results.values())
                results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)
                
                # Setup debug directory with absolute path
                current_dir = os.path.dirname(os.path.abspath(__file__))
                debug_dir = os.path.join(current_dir, "..", "..", "debug", "rerank")
                os.makedirs(debug_dir, exist_ok=True)
                
                # Create markdown directory
                md_dir = os.path.join(debug_dir, "markdown")
                os.makedirs(md_dir, exist_ok=True)
                
                # Use request timestamp if provided, otherwise generate new one
                timestamp = request_timestamp or datetime.now().strftime("%Y%m%d_%H%M%S")

                # Generate markdown file for this subquestion
                md_content = f"# Search Results for: {question}\n\n"
                md_content += f"Keywords: None\n\n"
                
                # Add variations section if there are any
                if variations:
                    md_content += f"## Variations\n"
                    for i, variation in enumerate(variations, 1):
                        md_content += f"{i}. {variation}\n"
                    md_content += "\n"
                
                for idx, doc in enumerate(results_list[:5], 1):
                    # Format result using format_service
                    formatted_result = format_result_to_md(doc)
                    md_content += f"\n{formatted_result}\n"

                # Save markdown file for this subquestion
                subq_suffix = f"_subquestion_{subquestion_number}" if subquestion_number is not None else ""
                md_file = os.path.join(md_dir, f"results_{timestamp}{subq_suffix}.md")
                with open(md_file, "w", encoding="utf-8") as f:
                    f.write(md_content)
                print(f"\n📝 Markdown results saved to: {md_file}")
                
                return {
                    "semantic_search_results": results_list[:5],
                    "keyword_search_results": results_list[:5],
                    "markdown_file": md_file
                }

            print(f"\n🔍 Processing original query: '{question}'")
            print(f"🔍 With {len(variations)} variations")
            print(f"🔑 Required keywords: {keywords}")
            
            try:
                # Get documents that match any keyword
                print(f"\n🔍 Getting keyword matches for filtering")
                all_filtered_ids = set()
                
                # Buscar documentos para cada keyword individualmente
                for keyword in keywords:
                    print(f"\n🔍 Searching for keyword: {keyword}")
                    keyword_response = self.supabase.match_documents_by_text(
                        keyword,
                        limit=10000  # Get a large initial set
                    )
                    if keyword_response.data:
                        new_ids = set(doc['chunk_id'] for doc in keyword_response.data)
                        new_matches = len(new_ids - all_filtered_ids)
                        all_filtered_ids.update(new_ids)
                        print(f"📊 Found {new_matches} new matches for keyword '{keyword}'")
                
                # Then process variations if any
                if variations:
                    for query in variations:
                        if query and query != question:  # Skip if empty or same as primary
                            print(f"\n🔄 Getting keyword matches for variation: '{query}'")
                            var_keyword_response = self.supabase.match_documents_by_text(
                                query,
                                limit=10000
                            )
                            if var_keyword_response.data:
                                new_ids = set(doc['chunk_id'] for doc in var_keyword_response.data)
                                new_matches = len(new_ids - all_filtered_ids)
                                all_filtered_ids.update(new_ids)
                                print(f"📊 Found {new_matches} new matches from variation")

                # If no documents found with keywords, fall back to regular search
                if not all_filtered_ids:
                    print(f"\n⚠️ No documents found matching keywords, falling back to regular hybrid search")
                    return self.hybrid_search_with_keywords_multi_rerank(
                        question=question,
                        keywords=[],
                        variations=variations,
                        limit=limit,
                        alpha=alpha,
                        subquestion_number=subquestion_number,
                        request_timestamp=request_timestamp
                    )

                # Convert set back to list for further processing
                filtered_ids = list(all_filtered_ids)
                print(f"\n📊 Found total of {len(filtered_ids)} unique documents matching keywords")

                # Initialize combined results
                all_results = {}
                
                # Process original question first
                print(f"\n🔍 Running semantic search for primary query")
                embedding = self.get_embedding(question)
                semantic_response = self.supabase.match_documents_by_embedding_filtered(
                    embedding=embedding,
                    filtered_ids=filtered_ids,
                    limit=limit * 2
                )

                # Process semantic results
                if semantic_response.data:
                    print(f"📊 Found {len(semantic_response.data)} semantic matches")
                    self._normalize_scores(semantic_response.data, 'similarity')
                    for doc in semantic_response.data:
                        doc['normalized_semantic'] = doc.get('normalized_similarity', 0)
                        doc['normalized_keyword'] = 0
                        doc['found_in'] = ['original']
                        all_results[doc['chunk_id']] = doc

                # Get keyword search results
                print(f"\n🔍 Running keyword search for primary query")
                keyword_response = self.supabase.match_documents_by_text_filtered(
                    query=question,
                    filtered_ids=filtered_ids,
                    limit=limit * 2
                )

                # Process keyword results
                if keyword_response.data:
                    print(f"📊 Found {len(keyword_response.data)} keyword matches")
                    self._normalize_scores(keyword_response.data, 'rank')
                    for doc in keyword_response.data:
                        if doc['chunk_id'] in all_results:
                            all_results[doc['chunk_id']]['normalized_keyword'] = doc.get('normalized_rank', 0)
                            if 'original' not in all_results[doc['chunk_id']]['found_in']:
                                all_results[doc['chunk_id']]['found_in'].append('original')
                        else:
                            doc['normalized_keyword'] = doc.get('normalized_rank', 0)
                            doc['normalized_semantic'] = 0
                            doc['found_in'] = ['original']
                            all_results[doc['chunk_id']] = doc

                # Process variations if any
                if variations:
                    for i, variation in enumerate(variations, 1):
                        variation_key = f"variation_{i}"
                        print(f"\n🔍 Processing variation {i}: '{variation}'")
                    
                        # Get semantic results for variation
                        var_embedding = self.get_embedding(variation)
                        var_semantic_response = self.supabase.match_documents_by_embedding_filtered(
                            embedding=var_embedding,
                            filtered_ids=filtered_ids,
                            limit=limit * 2
                        )
                    
                        if var_semantic_response.data:
                            print(f"📊 Found {len(var_semantic_response.data)} semantic matches")
                            self._normalize_scores(var_semantic_response.data, 'similarity')
                            for doc in var_semantic_response.data:
                                if doc['chunk_id'] in all_results:
                                    if doc.get('normalized_similarity', 0) > all_results[doc['chunk_id']].get('normalized_semantic', 0):
                                        all_results[doc['chunk_id']]['normalized_semantic'] = doc.get('normalized_similarity', 0)
                                    if variation_key not in all_results[doc['chunk_id']]['found_in']:
                                        all_results[doc['chunk_id']]['found_in'].append(variation_key)
                                else:
                                    doc['normalized_semantic'] = doc.get('normalized_similarity', 0)
                                    doc['normalized_keyword'] = 0
                                    doc['found_in'] = [variation_key]
                                    all_results[doc['chunk_id']] = doc
                    
                        # Get keyword results for variation
                        var_keyword_response = self.supabase.match_documents_by_text_filtered(
                            query=variation,
                            filtered_ids=filtered_ids,
                            limit=limit * 2
                        )
                    
                        if var_keyword_response.data:
                            print(f"📊 Found {len(var_keyword_response.data)} keyword matches")
                            self._normalize_scores(var_keyword_response.data, 'rank')
                            for doc in var_keyword_response.data:
                                if doc['chunk_id'] in all_results:
                                    if doc.get('normalized_rank', 0) > all_results[doc['chunk_id']].get('normalized_keyword', 0):
                                        all_results[doc['chunk_id']]['normalized_keyword'] = doc.get('normalized_rank', 0)
                                    if variation_key not in all_results[doc['chunk_id']]['found_in']:
                                        all_results[doc['chunk_id']]['found_in'].append(variation_key)
                                else:
                                    doc['normalized_keyword'] = doc.get('normalized_rank', 0)
                                    doc['normalized_semantic'] = 0
                                    doc['found_in'] = [variation_key]
                                    all_results[doc['chunk_id']] = doc

                # Calculate combined scores and add debug factors
                for doc in all_results.values():
                    doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                    doc['debug_factors'] = {
                        "semantic_score": doc.get('normalized_semantic', 0),
                        "keyword_score": doc.get('normalized_keyword', 0),
                        "combined_score": doc['combined_score'],
                        "final_score": doc['combined_score'],
                        "length_factor": 1.0
                    }

                # Convert to list and sort by score
                results_list = list(all_results.values())
                results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

                # Print results summary
                print(f"\n🔄 Final Results:")
                print(f"📊 Total unique documents: {len(results_list)}")
                for idx, doc in enumerate(results_list[:5], 1):
                    print(f"\n=== Result {idx} ===")
                    print(f"ID: {doc.get('chunk_id', 'MISSING')}")
                    print(f"Combined Score: {doc['combined_score']:.3f}")
                    print("---")

                # Setup debug directory with absolute path
                current_dir = os.path.dirname(os.path.abspath(__file__))
                debug_dir = os.path.join(current_dir, "..", "..", "debug", "rerank")
                os.makedirs(debug_dir, exist_ok=True)
                
                # Create markdown directory
                md_dir = os.path.join(debug_dir, "markdown")
                os.makedirs(md_dir, exist_ok=True)
                
                # Use request timestamp if provided, otherwise generate new one
                timestamp = request_timestamp or datetime.now().strftime("%Y%m%d_%H%M%S")

                # Generate markdown file for this subquestion
                md_content = f"# Search Results for: {question}\n\n"
                md_content += f"Keywords: {', '.join(keywords) if keywords else 'None'}\n\n"
                
                # Add variations section if there are any
                if variations:
                    md_content += f"## Variations\n"
                    for i, variation in enumerate(variations, 1):
                        md_content += f"{i}. {variation}\n"
                    md_content += "\n"
                
                for idx, doc in enumerate(results_list[:5], 1):
                    # Format result using format_service
                    formatted_result = format_result_to_md(doc)
                    md_content += f"\n{formatted_result}\n"

                # Save markdown file for this subquestion
                subq_suffix = f"_subquestion_{subquestion_number}" if subquestion_number is not None else ""
                md_file = os.path.join(md_dir, f"results_{timestamp}{subq_suffix}.md")
                with open(md_file, "w", encoding="utf-8") as f:
                    f.write(md_content)
                print(f"\n📝 Markdown results saved to: {md_file}")

                # Format results for return
                structured_results = {
                    "semantic_search_results": results_list[:limit],
                    "keyword_search_results": results_list[:limit],
                    "markdown_file": md_file
                }
                
                return structured_results

            except Exception as e:
                print(f"\n❌ Error processing query: {str(e)}")
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

    def _process_single_query(self, question: str, documents_with_keywords: dict, limit: int, alpha: float):
        """Process a single query variation."""
        print("\n🔍 Running semantic search on filtered documents")
        embedding = self.get_embedding(question)
        
        # Get semantic scores for filtered documents
        semantic_response = self.supabase.match_documents_by_embedding_filtered(
            embedding=embedding,
            filtered_ids=list(documents_with_keywords.keys()),
            limit=limit * 4
        )
        
        # Get keyword scores for filtered documents
        keyword_response = self.supabase.match_documents_by_text_filtered(
            query=question,
            filtered_ids=list(documents_with_keywords.keys()),
            limit=limit * 4
        )
        
        # Initialize combined results
        combined_results = {}
        
        # Process semantic results
        if semantic_response.data:
            print(f"📊 Found {len(semantic_response.data)} semantic matches")
            for doc in semantic_response.data:
                doc['normalized_semantic'] = doc.get('normalized_similarity', 0)
                doc['normalized_keyword'] = 0
                doc['found_in'] = ['original']
                combined_results[doc['chunk_id']] = doc
        
        # Process keyword results
        if keyword_response.data:
            print(f"📊 Found {len(keyword_response.data)} keyword matches")
            for doc in keyword_response.data:
                if doc['chunk_id'] in combined_results:
                    combined_results[doc['chunk_id']]['normalized_keyword'] = doc.get('normalized_rank', 0)
                else:
                    doc['normalized_keyword'] = doc.get('normalized_rank', 0)
                    doc['normalized_semantic'] = 0
                    doc['found_in'] = ['original']
                    combined_results[doc['chunk_id']] = doc
        
        # Calculate combined scores and add debug factors
        for doc in combined_results.values():
            doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
            doc['debug_factors'] = {
                "semantic_score": doc.get('normalized_semantic', 0),
                "keyword_score": doc.get('normalized_keyword', 0),
                "combined_score": doc['combined_score'],
                "final_score": doc['combined_score'],
                "length_factor": 1.0
            }
        
        return combined_results

    def _merge_results(self, all_results: dict, new_results: dict):
        """Merge new results into all_results, keeping highest scores."""
        for chunk_id, doc in new_results.items():
            if chunk_id not in all_results or doc['combined_score'] > all_results[chunk_id]['combined_score']:
                all_results[chunk_id] = doc 

    def _normalize_scores(self, documents: list, score_field: str) -> None:
        """Normalize scores to range [0,1].
        
        Args:
            documents: List of documents with scores
            score_field: Name of the field containing the score to normalize
            
        Example:
            self._normalize_scores(docs, 'similarity')  # Creates 'normalized_similarity'
            self._normalize_scores(docs, 'rank')       # Creates 'normalized_rank'
        """
        if not documents:
            return
        
        # Extract scores
        scores = [doc.get(score_field, 0) for doc in documents]
        min_score = min(scores)
        max_score = max(scores)
        
        print(f"\n📊 Normalizing {score_field} scores:")
        print(f"   Min score: {min_score:.4f}")
        print(f"   Max score: {max_score:.4f}")
        
        # Handle edge case where all scores are the same
        if max_score == min_score:
            normalized_value = 1.0 if max_score > 0 else 0.0
            print(f"   All scores are equal, setting normalized value to: {normalized_value}")
            for doc in documents:
                doc[f'normalized_{score_field}'] = normalized_value
        else:
            # Normal case: normalize to [0,1] range
            for doc in documents:
                original = doc.get(score_field, 0)
                normalized = (original - min_score) / (max_score - min_score)
                doc[f'normalized_{score_field}'] = normalized
                print(f"   Doc {doc.get('chunk_id', 'unknown')}: {original:.4f} -> {normalized:.4f}") 

    def hybrid_search_with_keywords_multi(self, question: str, keywords: List[str], variations: List[str] = None, limit: int = 5, alpha: float = 0.7):
        """Enhanced version of hybrid search with better keyword scoring."""
        try:
            query_info = {
                "keywords": keywords,
                "variations": variations,
                "alpha": alpha
            }
            
            # Get documents that match any keyword
            print(f"\n🔍 Filtering documents by keywords: {keywords}")
            documents_with_keywords = set()
            for keyword in keywords:
                keyword_matches = self.supabase.match_documents_by_text(keyword, limit=limit * 4)
                if keyword_matches.data:
                    documents_with_keywords.update(doc['chunk_id'] for doc in keyword_matches.data)
            
            print(f"📊 Found {len(documents_with_keywords)} documents matching keywords")
            
            if not documents_with_keywords:
                print("\n⚠️ No documents found matching keywords")
                return {
                    "semantic_search_results": [],
                    "keyword_search_results": []
                }
            
            try:
                all_results = {}
                
                # Process original question
                print(f"\n🔍 Processing original question: '{question}'")
                results = self._process_single_query(
                    question=question,
                    documents_with_keywords=documents_with_keywords,
                    limit=limit,
                    alpha=alpha
                )
                self._merge_results(all_results, results)
                
                # Process each variation if provided
                if variations:
                    for i, variation in enumerate(variations, 1):
                        print(f"\n🔍 Processing variation {i}: '{variation}'")
                        results = self._process_single_query(
                            question=variation,
                            documents_with_keywords=documents_with_keywords,
                            limit=limit,
                            alpha=alpha
                        )
                        self._merge_results(all_results, results)

                # Calculate combined scores and add debug factors
                for doc in all_results.values():
                    doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                    doc['debug_factors'] = {
                        "semantic_score": doc.get('normalized_semantic', 0),
                        "keyword_score": doc.get('normalized_keyword', 0),
                        "combined_score": doc['combined_score'],
                        "final_score": doc['combined_score'],
                        "length_factor": 1.0
                    }

                # Convert to list and sort by score
                results_list = list(all_results.values())
                results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

                # Print final results debug info
                print(f"\n🔄 Final Results After All Variations:")
                print(f"📊 Total unique documents: {len(results_list)}")
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
                
                return structured_results

            except Exception as e:
                print(f"\n❌ Error processing query: {str(e)}")
                return {
                    "semantic_search_results": [],
                    "keyword_search_results": []
                }

        except Exception as e:
            print(f"\n❌ Fatal error in hybrid_search_with_keywords_multi: {str(e)}")
            return {
                "error": str(e),
                "semantic_search_results": [],
                "keyword_search_results": []
            } 
            
            
    def hybrid_search_with_keywords_multi_rerank(self, question: str, keywords: List[str], variations: List[str] = None, limit: int = 5, alpha: float = 0.3, subquestion_number: int = None, request_timestamp: str = None):
        """Enhanced version of hybrid search with better keyword scoring and integrated reranking.
        
        Args:
            question: The original search query
            keywords: List of keywords that MUST appear in the results
            variations: Optional list of question variations to also search for
            limit: Maximum number of results to return
            alpha: Weight for keyword scores (0 to 1)
            
        Returns:
            Dictionary containing search results with reranking scores and debug information
        """
        try:
            # Input validation
            if not question:
                raise ValueError("Question cannot be empty")
            
            # Ensure keywords is a list
            keywords = keywords or []
            if not isinstance(keywords, list):
                keywords = [keywords]
                
            # Ensure variations is a list
            variations = variations or []
            if not isinstance(variations, list):
                variations = [variations]
                
            # If no keywords provided, fall back to regular hybrid search
            if not keywords:
                print("\n⚠️ No keywords provided, falling back to regular hybrid search")
                
                # Initialize combined results
                all_results = {}
                
                # Process original question first
                print(f"\n🔍 Processing original question: '{question}'")
                results = self.hybrid_search(question, limit, alpha)
                for doc in results.get("semantic_search_results", []):
                    doc['found_in'] = ['original']
                    all_results[doc['chunk_id']] = doc
                
                # Process each variation if any
                if variations:
                    for i, variation in enumerate(variations, 1):
                        variation_key = f"variation_{i}"
                        print(f"\n🔍 Processing variation {i}: '{variation}'")
                        var_results = self.hybrid_search(variation, limit, alpha)
                        for doc in var_results.get("semantic_search_results", []):
                            if doc['chunk_id'] in all_results:
                                if doc.get('combined_score', 0) > all_results[doc['chunk_id']].get('combined_score', 0):
                                    all_results[doc['chunk_id']] = doc
                                if variation_key not in all_results[doc['chunk_id']]['found_in']:
                                    all_results[doc['chunk_id']]['found_in'].append(variation_key)
                            else:
                                doc['found_in'] = [variation_key]
                                all_results[doc['chunk_id']] = doc

                # Convert to list and sort by score
                results_list = list(all_results.values())
                results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

                # Setup debug directory with absolute path
                current_dir = os.path.dirname(os.path.abspath(__file__))
                debug_dir = os.path.join(current_dir, "..", "..", "debug", "rerank")
                os.makedirs(debug_dir, exist_ok=True)
                
                # Create markdown directory
                md_dir = os.path.join(debug_dir, "markdown")
                os.makedirs(md_dir, exist_ok=True)
                
                # Use request timestamp if provided, otherwise generate new one
                timestamp = request_timestamp or datetime.now().strftime("%Y%m%d_%H%M%S")

                # Generate markdown file for this subquestion
                md_content = f"# Search Results for: {question}\n\n"
                md_content += f"Keywords: None\n\n"
                
                # Add variations section if there are any
                if variations:
                    md_content += f"## Variations\n"
                    for i, variation in enumerate(variations, 1):
                        md_content += f"{i}. {variation}\n"
                    md_content += "\n"
                
                for idx, doc in enumerate(results_list[:5], 1):
                    # Format result using format_service
                    formatted_result = format_result_to_md(doc)
                    md_content += f"\n{formatted_result}\n"

                # Save markdown file for this subquestion
                subq_suffix = f"_subquestion_{subquestion_number}" if subquestion_number is not None else ""
                md_file = os.path.join(md_dir, f"results_{timestamp}{subq_suffix}.md")
                with open(md_file, "w", encoding="utf-8") as f:
                    f.write(md_content)
                print(f"\n📝 Markdown results saved to: {md_file}")
                
                return {
                    "semantic_search_results": results_list[:5],
                    "keyword_search_results": results_list[:5],
                    "markdown_file": md_file
                }

            print(f"\n🔍 Processing search with parameters:")
            print(f"Question: {question}")
            print(f"Keywords: {keywords}")
            print(f"Number of variations: {len(variations)}")
            print(f"Limit: {limit}")
            print(f"Alpha: {alpha}")
            
            # Get documents that match any keyword
            print(f"\n🔍 Getting keyword matches for filtering")
            all_filtered_ids = set()
            
            # Buscar documentos para cada keyword individualmente
            for keyword in keywords:
                print(f"\n🔍 Searching for keyword: {keyword}")
                keyword_response = self.supabase.match_documents_by_text(
                    keyword,
                    limit=10000  # Get a large initial set
                )
                if keyword_response.data:
                    new_ids = set(doc['chunk_id'] for doc in keyword_response.data)
                    new_matches = len(new_ids - all_filtered_ids)
                    all_filtered_ids.update(new_ids)
                    print(f"📊 Found {new_matches} new matches for keyword '{keyword}'")
            
            # Then process variations if any
            if variations:
                for query in variations:
                    if query and query != question:  # Skip if empty or same as primary
                        print(f"\n🔄 Getting keyword matches for variation: '{query}'")
                        var_keyword_response = self.supabase.match_documents_by_text(
                            query,
                            limit=10000
                        )
                        if var_keyword_response.data:
                            new_ids = set(doc['chunk_id'] for doc in var_keyword_response.data)
                            new_matches = len(new_ids - all_filtered_ids)
                            all_filtered_ids.update(new_ids)
                            print(f"📊 Found {new_matches} new matches from variation")

            # If no documents found with keywords, fall back to regular search
            if not all_filtered_ids:
                print(f"\n⚠️ No documents found matching keywords, falling back to regular hybrid search")
                return self.hybrid_search_with_keywords_multi_rerank(
                    question=question,
                    keywords=[],
                    variations=variations,
                    limit=limit,
                    alpha=alpha,
                    subquestion_number=subquestion_number,
                    request_timestamp=request_timestamp
                )

            # Convert set back to list for further processing
            filtered_ids = list(all_filtered_ids)
            print(f"\n📊 Found total of {len(filtered_ids)} unique documents matching keywords")

            # Initialize combined results
            all_results = {}
            
            # Process original question first
            print(f"\n🔍 Running semantic search for primary query")
            embedding = self.get_embedding(question)
            semantic_response = self.supabase.match_documents_by_embedding_filtered(
                embedding=embedding,
                filtered_ids=filtered_ids,
                limit=limit * 2
            )

            # Process semantic results
            if semantic_response.data:
                print(f"📊 Found {len(semantic_response.data)} semantic matches")
                self._normalize_scores(semantic_response.data, 'similarity')
                for doc in semantic_response.data:
                    doc['normalized_semantic'] = doc.get('normalized_similarity', 0)
                    doc['normalized_keyword'] = 0
                    doc['found_in'] = ['original']
                    all_results[doc['chunk_id']] = doc

            # Get keyword search results
            print(f"\n🔍 Running keyword search for primary query")
            keyword_response = self.supabase.match_documents_by_text_filtered(
                query=question,
                filtered_ids=filtered_ids,
                limit=limit * 2
            )

            # Process keyword results
            if keyword_response.data:
                print(f"📊 Found {len(keyword_response.data)} keyword matches")
                self._normalize_scores(keyword_response.data, 'rank')
                for doc in keyword_response.data:
                    if doc['chunk_id'] in all_results:
                        all_results[doc['chunk_id']]['normalized_keyword'] = doc.get('normalized_rank', 0)
                        if 'original' not in all_results[doc['chunk_id']]['found_in']:
                            all_results[doc['chunk_id']]['found_in'].append('original')
                    else:
                        doc['normalized_keyword'] = doc.get('normalized_rank', 0)
                        doc['normalized_semantic'] = 0
                        doc['found_in'] = ['original']
                        all_results[doc['chunk_id']] = doc

            # Process variations if any
            if variations:
                for i, variation in enumerate(variations, 1):
                    variation_key = f"variation_{i}"
                    print(f"\n🔍 Processing variation {i}: '{variation}'")
                
                    # Get semantic results for variation
                    var_embedding = self.get_embedding(variation)
                    var_semantic_response = self.supabase.match_documents_by_embedding_filtered(
                        embedding=var_embedding,
                        filtered_ids=filtered_ids,
                        limit=limit * 2
                    )
                
                    if var_semantic_response.data:
                        print(f"📊 Found {len(var_semantic_response.data)} semantic matches")
                        self._normalize_scores(var_semantic_response.data, 'similarity')
                        for doc in var_semantic_response.data:
                            if doc['chunk_id'] in all_results:
                                if doc.get('normalized_similarity', 0) > all_results[doc['chunk_id']].get('normalized_semantic', 0):
                                    all_results[doc['chunk_id']]['normalized_semantic'] = doc.get('normalized_similarity', 0)
                                if variation_key not in all_results[doc['chunk_id']]['found_in']:
                                    all_results[doc['chunk_id']]['found_in'].append(variation_key)
                            else:
                                doc['normalized_semantic'] = doc.get('normalized_similarity', 0)
                                doc['normalized_keyword'] = 0
                                doc['found_in'] = [variation_key]
                                all_results[doc['chunk_id']] = doc
                
                    # Get keyword results for variation
                    var_keyword_response = self.supabase.match_documents_by_text_filtered(
                        query=variation,
                        filtered_ids=filtered_ids,
                        limit=limit * 2
                    )
                
                    if var_keyword_response.data:
                        print(f"📊 Found {len(var_keyword_response.data)} keyword matches")
                        self._normalize_scores(var_keyword_response.data, 'rank')
                        for doc in var_keyword_response.data:
                            if doc['chunk_id'] in all_results:
                                if doc.get('normalized_rank', 0) > all_results[doc['chunk_id']].get('normalized_keyword', 0):
                                    all_results[doc['chunk_id']]['normalized_keyword'] = doc.get('normalized_rank', 0)
                                if variation_key not in all_results[doc['chunk_id']]['found_in']:
                                    all_results[doc['chunk_id']]['found_in'].append(variation_key)
                            else:
                                doc['normalized_keyword'] = doc.get('normalized_rank', 0)
                                doc['normalized_semantic'] = 0
                                doc['found_in'] = [variation_key]
                                all_results[doc['chunk_id']] = doc

            # Calculate combined scores and add debug factors
            for doc in all_results.values():
                doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                doc['debug_factors'] = {
                    "semantic_score": doc.get('normalized_semantic', 0),
                    "keyword_score": doc.get('normalized_keyword', 0),
                    "combined_score": doc['combined_score'],
                    "final_score": doc['combined_score'],
                    "length_factor": 1.0
                }

            # Convert to list and sort by score
            results_list = list(all_results.values())
            results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

            # Print results summary
            print(f"\n🔄 Final Results:")
            print(f"📊 Total unique documents: {len(results_list)}")
            for idx, doc in enumerate(results_list[:5], 1):
                print(f"\n=== Result {idx} ===")
                print(f"ID: {doc.get('chunk_id', 'MISSING')}")
                print(f"Combined Score: {doc['combined_score']:.3f}")
                print("---")

            # Setup debug directory with absolute path
            current_dir = os.path.dirname(os.path.abspath(__file__))
            debug_dir = os.path.join(current_dir, "..", "..", "debug", "rerank")
            os.makedirs(debug_dir, exist_ok=True)
            
            # Create markdown directory
            md_dir = os.path.join(debug_dir, "markdown")
            os.makedirs(md_dir, exist_ok=True)
            
            # Use request timestamp if provided, otherwise generate new one
            timestamp = request_timestamp or datetime.now().strftime("%Y%m%d_%H%M%S")

            # Generate markdown file for this subquestion
            md_content = f"# Search Results for: {question}\n\n"
            md_content += f"Keywords: {', '.join(keywords) if keywords else 'None'}\n\n"
            
            # Add variations section if there are any
            if variations:
                md_content += f"## Variations\n"
                for i, variation in enumerate(variations, 1):
                    md_content += f"{i}. {variation}\n"
                md_content += "\n"
            
            for idx, doc in enumerate(results_list[:5], 1):
                # Format result using format_service
                formatted_result = format_result_to_md(doc)
                md_content += f"\n{formatted_result}\n"

            # Save markdown file for this subquestion
            subq_suffix = f"_subquestion_{subquestion_number}" if subquestion_number is not None else ""
            md_file = os.path.join(md_dir, f"results_{timestamp}{subq_suffix}.md")
            with open(md_file, "w", encoding="utf-8") as f:
                f.write(md_content)
            print(f"\n📝 Markdown results saved to: {md_file}")

            # Format results for return
            structured_results = {
                "semantic_search_results": results_list[:limit],
                "keyword_search_results": results_list[:limit],
                "markdown_file": md_file
            }
            
            return structured_results

        except Exception as e:
            print(f"\n❌ Fatal error in hybrid_search_with_keywords_multi_rerank: {str(e)}")
            return {
                "error": str(e),
                "semantic_search_results": [],
                "keyword_search_results": []
            } 