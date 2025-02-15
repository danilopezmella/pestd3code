import os
from utils.config import OPENAI_API_KEY
from openai import OpenAI
from db.supabase_manager import SupabaseManager
from services.debug_service import DebugService
from typing import List
import json
from datetime import datetime

class SearchService:
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

    # Previous functions that are not used anymore
    
    # def semantic_search(self, query_variations: list[str], limit: int = 5):
    #     """Performs a semantic search using embeddings for all query variations."""
    #     print("\n🔍 Starting semantic search...")
    #     print(f"📥 Query variations: {query_variations}")

        
    #     results = []
    #     for query in query_variations:
    #         print(f"\n🔄 Processing variation: '{query}'")
    #         embedding = self.get_embedding(query)
    #         response = self.supabase.match_documents_by_embedding(embedding, limit)
    #         # Print results with similarity scores
    #         if response.data:
    #             print("\n📊 Results with similarity scores:")
    #             for result in response.data:
    #                 similarity = result.get('similarity', 0)
    #                 content = result.get('content', '')[:200]  # Show first 200 chars
    #                 header = result.get('header', '')
    #                 print(f"📝 Similarity: [{similarity:.4f}]")
    #                 print(f"   Header: {header}")
    #                 print(f"   Content: {content}...")
    #                 print("   " + "-"*80)  # Separator
    #         results.extend(response.data if response.data else [])

    #     return results[:limit]  # Return only top results

    # def keyword_search(self, query_variations: list[str], limit: int = 5):
    #     """Search using BM25 full-text search for all query variations."""
    #     results = []
    #     for query in query_variations:
    #         print(f"\n🔍 Running keyword search for: {query}")
    #         response = self.supabase.match_documents_by_text(query, limit)
    #         # Print results with rank scores
    #         if response.data:
    #             print("\n📊 Results with rank scores:")
    #             for result in response.data:
    #                 rank = result.get('rank', 0)
    #                 content = result.get('content', '')[:200]  # Show first 200 chars
    #                 header = result.get('header', '')
    #                 print(f"📝 Rank: [{rank:.4f}]")
    #                 print(f"   Header: {header}")
    #                 print(f"   Content: {content}...")
    #                 print("   " + "-"*80)  # Separator
    #         results.extend(response.data if response.data else [])

    #     return results[:limit]

    def hybrid_search(self, parsed_question: dict, limit: int = 5, alpha: float = None):
        """Runs hybrid search separately for each sub-question and concatenates all results.
        
        Args:
            parsed_question: Dictionary containing question data
            limit: Maximum number of results to return per sub-question
            alpha: Weight for keyword scores (0 to 1). If None, uses default_alpha.
                  0 = only semantic scores
                  1 = only keyword scores
                  0.5 = equal weight
        """
        try:
            # Validate input
            if not parsed_question:
                raise ValueError("parsed_question cannot be empty")
            
            if "number_of_subquestions" not in parsed_question:
                raise ValueError("parsed_question must contain 'number_of_subquestions'")
            
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
                'number_of_subquestions': parsed_question.get('number_of_subquestions', 1)
            }

            for i in range(parsed_question["number_of_subquestions"]):
                sub_question_key = f"subquestion{i+1}"
                variations_key = f"variations_subquestion{i+1}"

                # Validate required keys exist
                if sub_question_key not in parsed_question:
                    print(f"⚠️  Warning: {sub_question_key} not found in parsed_question")
                    continue
                
                if variations_key not in parsed_question:
                    print(f"⚠️  Warning: {variations_key} not found in parsed_question")
                    continue

                improved_sub_question = parsed_question[sub_question_key]
                query_variations = parsed_question[variations_key]

                # Validate query content
                if not improved_sub_question:
                    print(f"⚠️  Warning: Empty improved question for {sub_question_key}")
                    continue

                if not query_variations:
                    print(f"⚠️  Warning: No variations found for {sub_question_key}, using only improved question")
                    query_variations = [improved_sub_question]

                print(f"\n🔍 Processing improved query: '{improved_sub_question}'")
                
                try:
                    # First get results from improved query (primary results)
                    print("\n🔍 Running semantic search for primary query")
                    embedding = self.get_embedding(improved_sub_question)
                    primary_semantic_response = self.supabase.match_documents_by_embedding(
                        embedding=embedding,
                        limit=limit * 2
                    )
                    if primary_semantic_response.data:
                        print("\n📊 Results with similarity scores:")
                        for result in primary_semantic_response.data:
                            similarity = result.get('similarity', 0)
                            content = result.get('content', '')[:200]
                            header = result.get('header', '')
                            print(f"📝 Similarity: [{similarity:.4f}]")
                            print(f"   Header: {header}")
                            print(f"   Content: {content}...")
                            print("   " + "-"*80)

                    print("\n🔍 Running keyword search for primary query")
                    primary_keyword_response = self.supabase.match_documents_by_text(
                        query=improved_sub_question,
                        limit=limit * 2
                    )
                    if primary_keyword_response.data:
                        print("\n📊 Results with rank scores:")
                        for result in primary_keyword_response.data:
                            rank = result.get('rank', 0)
                            content = result.get('content', '')[:200]
                            header = result.get('header', '')
                            print(f"📝 Rank: [{rank:.4f}]")
                            print(f"   Header: {header}")
                            print(f"   Content: {content}...")
                            print("   " + "-"*80)

                    if not primary_semantic_response.data and not primary_keyword_response.data:
                        print(f"⚠️  Warning: No results found for primary query: '{improved_sub_question}'")
                    
                    # Then get additional results from variations
                    variation_semantic_results = []
                    variation_keyword_results = []
                    
                    for query in query_variations:
                        if not query:  # Skip empty variations
                            continue
                            
                        if query != improved_sub_question:  # Skip if it's the same as improved query
                            print(f"\n🔄 Processing variation: '{query}'")
                            try:
                                print(f"\n🔍 Running semantic search for variation")
                                var_embedding = self.get_embedding(query)
                                var_semantic_response = self.supabase.match_documents_by_embedding(
                                    embedding=var_embedding,
                                    limit=limit * 2
                                )
                                if var_semantic_response.data:
                                    print("\n📊 Results with similarity scores:")
                                    for result in var_semantic_response.data:
                                        similarity = result.get('similarity', 0)
                                        content = result.get('content', '')[:200]
                                        header = result.get('header', '')
                                        print(f"📝 Similarity: [{similarity:.4f}]")
                                        print(f"   Header: {header}")
                                        print(f"   Content: {content}...")
                                        print("   " + "-"*80)
                                    variation_semantic_results.extend(var_semantic_response.data)

                                print(f"\n🔍 Running keyword search for variation")
                                var_keyword_response = self.supabase.match_documents_by_text(
                                    query=query,
                                    limit=limit * 2
                                )
                                if var_keyword_response.data:
                                    print("\n📊 Results with rank scores:")
                                    for result in var_keyword_response.data:
                                        rank = result.get('rank', 0)
                                        content = result.get('content', '')[:200]
                                        header = result.get('header', '')
                                        print(f"📝 Rank: [{rank:.4f}]")
                                        print(f"   Header: {header}")
                                        print(f"   Content: {content}...")
                                        print("   " + "-"*80)
                                    variation_keyword_results.extend(var_keyword_response.data)
                            except Exception as e:
                                print(f"⚠️  Error processing variation '{query}': {str(e)}")
                                continue

                    # Create combined results dictionary starting with primary results
                    combined_results = {}
                    skipped_docs = 0  # Counter for skipped documents
                    
                    def add_to_combined_results(doc, is_primary=True, source_type="semantic"):
                        """Helper to safely add documents to combined results."""
                        if not doc:  # Skip empty documents
                            return False
                            
                        if 'chunk_id' not in doc:
                            nonlocal skipped_docs
                            skipped_docs += 1
                            print(f"⚠️  Warning: Document without chunk_id found in {source_type} results {'(primary)' if is_primary else '(variation)'}")
                            return False
                        return True

                    # Process primary semantic results
                    for doc in (primary_semantic_response.data or []):
                        if add_to_combined_results(doc, True, "semantic"):
                            doc['normalized_semantic'] = doc.get('similarity', 0)
                            doc['normalized_keyword'] = 0
                            doc['is_from_primary'] = True
                            combined_results[doc['chunk_id']] = doc
                    
                    # Process primary keyword results
                    for doc in (primary_keyword_response.data or []):
                        if add_to_combined_results(doc, True, "keyword"):
                            doc['normalized_keyword'] = doc.get('rank', 0)
                            if doc['chunk_id'] in combined_results:
                                combined_results[doc['chunk_id']]['normalized_keyword'] = doc.get('rank', 0)
                            else:
                                doc['normalized_semantic'] = 0
                                doc['is_from_primary'] = True
                                combined_results[doc['chunk_id']] = doc

                    # Only process variations if we have any
                    if variation_semantic_results or variation_keyword_results:
                        # Process variation semantic results (with penalty)
                        variation_penalty = 0.1
                        new_matches = 0
                        variation_docs = set()  # Track variation document IDs
                        for doc in variation_semantic_results:
                            if add_to_combined_results(doc, False, "semantic"):
                                if doc['chunk_id'] not in combined_results:  # Only add if not in primary results
                                    doc['normalized_semantic'] = doc.get('similarity', 0) * (1 - variation_penalty)
                                    doc['normalized_keyword'] = 0
                                    doc['is_from_primary'] = False
                                    combined_results[doc['chunk_id']] = doc
                                    variation_docs.add(doc['chunk_id'])
                                    new_matches += 1
                        if new_matches > 0:
                            print(f"📊 Added {new_matches} new unique documents from semantic variations")
                        
                        # Process variation keyword results (with penalty)
                        for doc in variation_keyword_results:
                            if add_to_combined_results(doc, False, "keyword"):
                                if doc['chunk_id'] not in combined_results:  # Only add if not in primary results
                                    doc['normalized_keyword'] = doc.get('rank', 0) * (1 - variation_penalty)
                                    doc['normalized_semantic'] = 0
                                    doc['is_from_primary'] = False
                                    combined_results[doc['chunk_id']] = doc
                                    variation_docs.add(doc['chunk_id'])
                                    new_matches += 1
                                elif not combined_results[doc['chunk_id']].get('is_from_primary', False):
                                    # Update keyword score if it's better than existing variation score
                                    current_score = combined_results[doc['chunk_id']].get('normalized_keyword', 0)
                                    new_score = doc.get('rank', 0) * (1 - variation_penalty)
                                    if new_score > current_score:
                                        combined_results[doc['chunk_id']]['normalized_keyword'] = new_score
                        
                        if new_matches > 0:
                            print(f"📊 Added {new_matches} new unique documents from keyword variations")

                    if skipped_docs > 0:
                        print(f"\n⚠️  Warning: Skipped {skipped_docs} documents due to missing chunk_id")

                    # Handle case where no results were found
                    if not combined_results:
                        print(f"\n⚠️  Warning: No results found for question: '{improved_sub_question}'")
                        structured_results[f"semantic_search_results_{sub_question_key}"] = []
                        structured_results[f"keyword_search_results_{sub_question_key}"] = []
                        continue

                    # Calculate combined scores
                    results_list = []
                    primary_docs = set()
                    for doc in combined_results.values():
                        doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                        results_list.append(doc)
                        if doc.get('is_from_primary', False):
                            primary_docs.add(doc['chunk_id'])

                    # Sort by combined score
                    results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)
                    
                    # Ensure we include both primary and variation results
                    final_results = []
                    primary_results = [doc for doc in results_list if doc.get('is_from_primary', False)]
                    variation_results = [doc for doc in results_list if not doc.get('is_from_primary', False)]
                    
                    # Take top results from each, prioritizing primary but ensuring variation representation
                    primary_limit = min(3, len(primary_results))
                    variation_limit = min(2, len(variation_results))
                    
                    final_results.extend(primary_results[:primary_limit])
                    final_results.extend(variation_results[:variation_limit])
                    
                    # If we didn't get enough results from one category, take more from the other
                    remaining_slots = limit - len(final_results)
                    if remaining_slots > 0:
                        if len(primary_results) > primary_limit:
                            final_results.extend(primary_results[primary_limit:primary_limit + remaining_slots])
                        elif len(variation_results) > variation_limit:
                            final_results.extend(variation_results[variation_limit:variation_limit + remaining_slots])
                    
                    # Sort final results by combined score
                    final_results.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

                    # Print reranking debug info
                    print(f"\n🔄 Reranked Results (alpha={alpha}):")
                    print(f"📊 Total unique documents found: {len(results_list)}")
                    print(f"📊 From primary query: {len(primary_results)}")
                    print(f"📊 From variations only: {len(variation_results)}")
                    print(f"📊 Selected for final results: {len(final_results)} (Primary: {sum(1 for doc in final_results if doc.get('is_from_primary', False))}, Variations: {sum(1 for doc in final_results if not doc.get('is_from_primary', False))})")
                    
                    for idx, doc in enumerate(final_results, 1):
                        print(f"\n=== Result {idx} ===")
                        print(f"ID: {doc.get('chunk_id', 'MISSING')}")
                        print(f"Source: {'Primary Query' if doc.get('is_from_primary') else 'Variation'}")
                        print(f"Combined Score: {doc['combined_score']:.3f}")
                        print(f"Keyword Score: {doc.get('normalized_keyword', 0):.3f}")
                        print(f"Semantic Score: {doc.get('normalized_semantic', 0):.3f}")
                        print(f"Original Rank: {doc.get('rank', 0)}")
                        print(f"Original Similarity: {doc.get('similarity', 0):.3f}")
                        print("---")

                    # Store results
                    structured_results[f"semantic_search_results_{sub_question_key}"] = final_results
                    structured_results[f"keyword_search_results_{sub_question_key}"] = final_results

                except Exception as e:
                    print(f"\n❌ Error processing sub-question {sub_question_key}: {str(e)}")
                    structured_results[f"semantic_search_results_{sub_question_key}"] = []
                    structured_results[f"keyword_search_results_{sub_question_key}"] = []
                    continue

            # Handle case where no results were found for any sub-question
            if not any(len(results) > 0 for results in structured_results.values()):
                print("\n❌ No results found for any sub-question")
            
            # Print final document count summary for all sub-questions
            print("\n📈 FINAL DOCUMENT COUNT SUMMARY")
            print("=" * 50)
            total_docs = 0
            total_primary = 0
            total_variations = 0
            
            for i in range(parsed_question["number_of_subquestions"]):
                sub_key = f"semantic_search_results_subquestion{i+1}"
                if sub_key in structured_results:
                    results = structured_results[sub_key]
                    sub_total = len(results)
                    sub_primary = sum(1 for doc in results if doc.get('is_from_primary', False))
                    sub_variations = sum(1 for doc in results if not doc.get('is_from_primary', False))
                    
                    total_docs += sub_total
                    total_primary += sub_primary
                    total_variations += sub_variations
                    
                    print(f"\nSub-question {i+1}:")
                    print(f"  - Total documents: {sub_total}")
                    print(f"  - From primary query: {sub_primary}")
                    print(f"  - From variations: {sub_variations}")
            
            print("\nOverall Totals:")
            print(f"  - Total unique documents: {total_docs}")
            print(f"  - From primary queries: {total_primary}")
            print(f"  - From variations: {total_variations}")
            print("=" * 50)
            
            # After processing all results, create debug files
            self.debug_service.create_search_debug_file(structured_results, query_info)
            
            # Create variations debug if we have variations
            variations_info = {
                'number_of_subquestions': parsed_question.get('number_of_subquestions', 1)
            }
            for i in range(parsed_question['number_of_subquestions']):
                sub_key = f'subquestion{i+1}'
                var_key = f'variations_{sub_key}'
                if sub_key in parsed_question and var_key in parsed_question:
                    variations_info[sub_key] = parsed_question[sub_key]
                    variations_info[var_key] = parsed_question[var_key]
            self.debug_service.create_variations_debug_file(variations_info)
            
            # Create metrics debug
            metrics_info = {
                'totals': {
                    'total_docs': total_docs,
                    'primary_docs': total_primary,
                    'variation_docs': total_variations
                }
            }
            self.debug_service.create_metrics_debug_file(metrics_info)

            return structured_results

        except Exception as e:
            print(f"\n❌ Fatal error in hybrid_search: {str(e)}")
            return {
                "error": str(e),
                "semantic_search_results_subquestion1": [],
                "keyword_search_results_subquestion1": []
            }

    def hybrid_search_with_keywords(self, parsed_question: dict, limit: int = 5, alpha: float = None):
        """Hybrid search with keyword filtering."""
        try:
            alpha = alpha if alpha is not None else self.default_alpha
            structured_results = {}
            
            # Create query info for debug
            query_info = {
                'search_method': 'hybrid_filtered',
                'alpha': alpha,
                'number_of_subquestions': parsed_question.get('number_of_subquestions', 1)
            }

            for i in range(parsed_question["number_of_subquestions"]):
                sub_question_key = f"subquestion{i+1}"
                variations_key = f"variations_subquestion{i+1}"
                keywords_key = f"keywords_found_subquestion{i+1}"

                # Validate required keys
                if not all(key in parsed_question for key in [sub_question_key, variations_key, keywords_key]):
                    print(f"⚠️  Warning: Missing required keys for {sub_question_key}")
                    continue

                improved_sub_question = parsed_question[sub_question_key]
                query_variations = parsed_question[variations_key]
                keywords = parsed_question[keywords_key]

                if not keywords:
                    print(f"⚠️  No keywords found for {sub_question_key}, falling back to regular hybrid search")
                    # Fall back to regular hybrid search
                    results = self.hybrid_search({
                        "number_of_subquestions": 1,
                        "subquestion1": improved_sub_question,
                        "variations_subquestion1": query_variations
                    }, limit, alpha)
                    structured_results.update(results)
                    continue

                print(f"\n🔍 Processing query with keywords: '{improved_sub_question}'")
                print(f"📑 Using keywords filter: {keywords}")

                try:
                    # 1. First get documents matching keywords from all variations
                    all_filtered_ids = set()
                    
                    # Start with primary query
                    print(f"\n🔍 Getting keyword matches for primary query")
                    keyword_response = self.supabase.match_documents_by_text(
                        " ".join(keywords),
                        limit=10000  # Get a large initial set
                    )
                    if keyword_response.data:
                        all_filtered_ids.update(doc['chunk_id'] for doc in keyword_response.data)
                        print(f"📊 Found {len(keyword_response.data)} matches from primary query")
                    
                    # Then process variations
                    for query in query_variations:
                        if query and query != improved_sub_question:  # Skip if it's empty or same as primary
                            print(f"\n🔄 Getting keyword matches for variation: '{query}'")
                            var_keyword_response = self.supabase.match_documents_by_text(
                                " ".join(keywords),
                                limit=10000
                            )
                            if var_keyword_response.data:
                                new_ids = set(doc['chunk_id'] for doc in var_keyword_response.data)
                                new_matches = len(new_ids - all_filtered_ids)
                                all_filtered_ids.update(new_ids)
                                print(f"📊 Found {new_matches} new matches from variation")

                    # Convert set back to list for further processing
                    filtered_ids = list(all_filtered_ids)

                    if not filtered_ids:
                        print(f"⚠️  No documents found matching keywords: {keywords}")
                        structured_results[f"semantic_search_results_{sub_question_key}"] = []
                        structured_results[f"keyword_search_results_{sub_question_key}"] = []
                        continue

                    print(f"\n📊 Found total of {len(filtered_ids)} unique documents matching keywords")

                    # 2. Run both semantic and keyword search on filtered documents
                    combined_results = {}
                    
                    # Process primary query first - semantic search on filtered docs
                    print(f"\n🔍 Running semantic search for primary query")
                    embedding = self.get_embedding(improved_sub_question)
                    semantic_response = self.supabase.match_documents_by_embedding_filtered(
                        embedding=embedding,
                        filtered_ids=filtered_ids,
                        limit=limit * 2
                    )

                    # Process semantic results from primary query
                    if semantic_response.data:
                        print(f"📊 Found {len(semantic_response.data)} semantic matches from primary query")
                        for doc in semantic_response.data:
                            doc['normalized_semantic'] = doc.get('similarity', 0)
                            doc['normalized_keyword'] = 0
                            doc['is_from_primary'] = True
                            combined_results[doc['chunk_id']] = doc

                    # Process variations for semantic search
                    variation_semantic_results = []
                    for query in query_variations:
                        if query and query != improved_sub_question:  # Skip if empty or same as primary
                            print(f"\n🔄 Running semantic search for variation: '{query}'")
                            try:
                                var_embedding = self.get_embedding(query)
                                var_response = self.supabase.match_documents_by_embedding_filtered(
                                    embedding=var_embedding,
                                    filtered_ids=filtered_ids,
                                    limit=limit * 2
                                )
                                if var_response.data:
                                    print(f"📊 Found {len(var_response.data)} semantic matches from variation")
                                    variation_semantic_results.extend(var_response.data)
                            except Exception as e:
                                print(f"⚠️  Error processing semantic variation '{query}': {str(e)}")
                                continue

                    # Process variation semantic results (with penalty)
                    variation_penalty = 0.1
                    new_matches = 0
                    variation_docs = set()  # Track variation document IDs
                    for doc in variation_semantic_results:
                        if doc['chunk_id'] not in combined_results:  # Only add if not in primary results
                            doc['normalized_semantic'] = doc.get('similarity', 0) * (1 - variation_penalty)
                            doc['normalized_keyword'] = 0
                            doc['is_from_primary'] = False
                            combined_results[doc['chunk_id']] = doc
                            variation_docs.add(doc['chunk_id'])
                            new_matches += 1
                    if new_matches > 0:
                        print(f"📊 Added {new_matches} new unique documents from semantic variations")

                    # Run keyword search on filtered docs
                    print(f"\n🔍 Running keyword search for primary query")
                    keyword_response_filtered = self.supabase.match_documents_by_text_filtered(
                        query=improved_sub_question,
                        filtered_ids=filtered_ids,
                        limit=limit * 2
                    )

                    # Process keyword results from primary query
                    if keyword_response_filtered.data:
                        print(f"📊 Found {len(keyword_response_filtered.data)} keyword matches from primary query")
                        for doc in keyword_response_filtered.data:
                            doc['normalized_keyword'] = doc.get('rank', 0)
                            if doc['chunk_id'] in combined_results:
                                combined_results[doc['chunk_id']]['normalized_keyword'] = doc.get('rank', 0)
                            else:
                                doc['normalized_semantic'] = 0
                                doc['is_from_primary'] = True
                                combined_results[doc['chunk_id']] = doc

                    # Process variations for keyword search
                    variation_keyword_results = []
                    for query in query_variations:
                        if query and query != improved_sub_question:  # Skip if empty or same as primary
                            print(f"\n🔄 Running keyword search for variation: '{query}'")
                            try:
                                var_response = self.supabase.match_documents_by_text_filtered(
                                    query=query,
                                    filtered_ids=filtered_ids,
                                    limit=limit * 2
                                )
                                if var_response.data:
                                    print(f"📊 Found {len(var_response.data)} keyword matches from variation")
                                    variation_keyword_results.extend(var_response.data)
                            except Exception as e:
                                print(f"⚠️  Error processing keyword variation '{query}': {str(e)}")
                                continue

                    # Process variation keyword results (with penalty)
                    new_matches = 0
                    for doc in variation_keyword_results:
                        if doc['chunk_id'] not in combined_results:  # Only add if not in primary results
                            doc['normalized_keyword'] = doc.get('rank', 0) * (1 - variation_penalty)
                            doc['normalized_semantic'] = 0
                            doc['is_from_primary'] = False
                            combined_results[doc['chunk_id']] = doc
                            variation_docs.add(doc['chunk_id'])
                            new_matches += 1
                        elif not combined_results[doc['chunk_id']].get('is_from_primary', False):
                            # Update keyword score if it's better than existing variation score
                            current_score = combined_results[doc['chunk_id']].get('normalized_keyword', 0)
                            new_score = doc.get('rank', 0) * (1 - variation_penalty)
                            if new_score > current_score:
                                combined_results[doc['chunk_id']]['normalized_keyword'] = new_score
                    
                    if new_matches > 0:
                        print(f"📊 Added {new_matches} new unique documents from keyword variations")

                    # Calculate combined scores
                    results_list = []
                    primary_docs = set()
                    for doc in combined_results.values():
                        doc['combined_score'] = alpha * doc.get('normalized_keyword', 0) + (1 - alpha) * doc.get('normalized_semantic', 0)
                        results_list.append(doc)
                        if doc.get('is_from_primary', False):
                            primary_docs.add(doc['chunk_id'])

                    # Sort by combined score
                    results_list.sort(key=lambda x: x.get('combined_score', 0), reverse=True)

                    # Print reranking debug info
                    print(f"\n🔄 Reranked Results (alpha={alpha}):")
                    print(f"📊 Total unique documents found: {len(results_list)}")
                    print(f"📊 From primary query: {len(primary_docs)}")
                    print(f"📊 From variations only: {len(variation_docs)}")
                    print(f"📊 Overlap (found in both): {len(primary_docs & variation_docs)}")
                    for idx, doc in enumerate(results_list[:5], 1):
                        print(f"\n=== Result {idx} ===")
                        print(f"ID: {doc.get('chunk_id', 'MISSING')}")
                        print(f"Source: {'Primary Query' if doc.get('is_from_primary') else 'Variation'}")
                        print(f"Combined Score: {doc['combined_score']:.3f}")
                        print(f"Keyword Score: {doc.get('normalized_keyword', 0):.3f}")
                        print(f"Semantic Score: {doc.get('normalized_semantic', 0):.3f}")
                        print(f"Original Rank: {doc.get('rank', 0)}")
                        print(f"Original Similarity: {doc.get('similarity', 0):.3f}")
                        print("---")

                    # Store results
                    structured_results[f"semantic_search_results_{sub_question_key}"] = results_list[:limit]
                    structured_results[f"keyword_search_results_{sub_question_key}"] = results_list[:limit]

                except Exception as e:
                    print(f"\n❌ Error processing keyword-filtered search: {str(e)}")
                    structured_results[f"semantic_search_results_{sub_question_key}"] = []
                    structured_results[f"keyword_search_results_{sub_question_key}"] = []

            # Print final document count summary for all sub-questions
            print("\n📈 FINAL DOCUMENT COUNT SUMMARY")
            print("=" * 50)
            total_docs = 0
            total_primary = 0
            total_variations = 0
            
            for i in range(parsed_question["number_of_subquestions"]):
                sub_key = f"semantic_search_results_subquestion{i+1}"
                if sub_key in structured_results:
                    results = structured_results[sub_key]
                    sub_total = len(results)
                    sub_primary = sum(1 for doc in results if doc.get('is_from_primary', False))
                    sub_variations = sum(1 for doc in results if not doc.get('is_from_primary', False))
                    
                    total_docs += sub_total
                    total_primary += sub_primary
                    total_variations += sub_variations
                    
                    print(f"\nSub-question {i+1}:")
                    print(f"  - Total documents: {sub_total}")
                    print(f"  - From primary query: {sub_primary}")
                    print(f"  - From variations: {sub_variations}")
            
            print("\nOverall Totals:")
            print(f"  - Total unique documents: {total_docs}")
            print(f"  - From primary queries: {total_primary}")
            print(f"  - From variations: {total_variations}")
            print("=" * 50)

            # After processing all results, create debug files
            self.debug_service.create_search_debug_file(structured_results, query_info)
            
            # Create variations debug if we have variations
            variations_info = {
                'number_of_subquestions': parsed_question.get('number_of_subquestions', 1)
            }
            for i in range(parsed_question['number_of_subquestions']):
                sub_key = f'subquestion{i+1}'
                var_key = f'variations_{sub_key}'
                keywords_key = f'keywords_found_{sub_key}'
                if all(k in parsed_question for k in [sub_key, var_key, keywords_key]):
                    variations_info[sub_key] = parsed_question[sub_key]
                    variations_info[var_key] = parsed_question[var_key]
                    variations_info[f'keywords_{sub_key}'] = parsed_question[keywords_key]
            self.debug_service.create_variations_debug_file(variations_info)
            
            # Create metrics debug
            metrics_info = {
                'totals': {
                    'total_docs': total_docs,
                    'primary_docs': total_primary,
                    'variation_docs': total_variations
                }
            }
            self.debug_service.create_metrics_debug_file(metrics_info)
            
            return structured_results

        except Exception as e:
            print(f"\n❌ Fatal error in hybrid_search_with_keywords: {str(e)}")
            return {
                "error": str(e),
                "semantic_search_results_subquestion1": [],
                "keyword_search_results_subquestion1": []
            }


