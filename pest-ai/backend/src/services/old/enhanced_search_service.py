import logging
import json
from pathlib import Path
from typing import Dict, List, Any
import os
import traceback

from src.services.paraphrase_service import process_question
from src.services.search_service_single import SearchServiceSingle

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def enhanced_search(question: str, debug_dir: str = None) -> dict:
    try:
        # Initialize services
        search_service = SearchServiceSingle()
        
        # Get improved questions and variations using process_question
        response = await process_question(question)
        
        # Extract subquestions and variations
        subquestions = []
        variations_map = {}
        keywords_map = {}
        
        for i in range(1, response['number_of_subquestions'] + 1):
            subq = response[f'subquestion{i}']
            subquestions.append(subq)
            variations_map[subq] = response[f'variations_subquestion{i}']
            keywords_map[subq] = response[f'keywords_found_subquestion{i}']

        all_results = []
        
        # Process each subquestion
        for subq_idx, subq in enumerate(subquestions, 1):
            print(f"Processing subquestion {subq_idx}: {subq}")
            variations = variations_map[subq]
            keywords = keywords_map[subq]
            print(f"Using keywords: {keywords}")

            # Perform hybrid search with keywords
            search_results = search_service.hybrid_search_with_keywords(
                question=subq,
                variations=variations,
                keywords=keywords
            )

            # Extract and format top 5 results
            final_results = []
            if 'semantic_search_results' in search_results and 'keyword_search_results' in search_results:
                # Get all unique results
                all_docs = {}
                
                # Add semantic search results
                for doc in search_results['semantic_search_results']:
                    if doc['chunk_id'] not in all_docs:
                        all_docs[doc['chunk_id']] = {
                            'chunk_id': doc['chunk_id'],
                            'content': doc['content'],
                            'header': doc['header'],
                            'level': doc['level'],
                            'file_name': doc['file_name'],
                            'combined_score': doc['combined_score'],
                            'keywords': doc.get('keywords', []),
                            'summary_self': doc.get('summary_self', ''),
                            'summary_prev': doc.get('summary_prev', ''),
                            'summary_next': doc.get('summary_next', ''),
                            'header_summary_1': doc.get('header_summary_1', ''),
                            'header_summary_2': doc.get('header_summary_2', ''),
                            'prev_id': doc.get('prev_id', ''),
                            'next_id': doc.get('next_id', ''),
                            'rank': doc.get('rank', 0),
                            'normalized_keyword': doc.get('normalized_keyword', 0),
                            'normalized_semantic': doc.get('normalized_semantic', 0)
                        }
                
                # Add keyword search results
                for doc in search_results['keyword_search_results']:
                    if doc['chunk_id'] not in all_docs:
                        all_docs[doc['chunk_id']] = {
                            'chunk_id': doc['chunk_id'],
                            'content': doc['content'],
                            'header': doc['header'],
                            'level': doc['level'],
                            'file_name': doc['file_name'],
                            'combined_score': doc['combined_score'],
                            'keywords': doc.get('keywords', []),
                            'summary_self': doc.get('summary_self', ''),
                            'summary_prev': doc.get('summary_prev', ''),
                            'summary_next': doc.get('summary_next', ''),
                            'header_summary_1': doc.get('header_summary_1', ''),
                            'header_summary_2': doc.get('header_summary_2', ''),
                            'prev_id': doc.get('prev_id', ''),
                            'next_id': doc.get('next_id', ''),
                            'rank': doc.get('rank', 0),
                            'normalized_keyword': doc.get('normalized_keyword', 0),
                            'normalized_semantic': doc.get('normalized_semantic', 0)
                        }
                
                # Sort by combined score and get top 5
                sorted_results = sorted(
                    all_docs.values(),
                    key=lambda x: x['combined_score'],
                    reverse=True
                )[:5]
                
                final_results = sorted_results
                
                print(f"\n🔄 Final Results After All Variations:")
                print(f"📊 Total unique documents: {len(all_docs)}\n")
                
                for i, result in enumerate(final_results, 1):
                    print(f"=== Result {i} ===")
                    print(f"ID: {result['chunk_id']}")
                    print(f"Combined Score: {result['combined_score']:.3f}")
                    print("---\n")

            # Save results to JSON file
            if debug_dir:
                # Create debug directory if it doesn't exist
                os.makedirs(debug_dir, exist_ok=True)
                logger.info(f"📂 Debug directory ensured: {debug_dir}")
                
                # Use subq_idx (1-based) for the filename
                results_file = os.path.join(debug_dir, f'enhanced_search_subq_{subq_idx}.json')
                print(f"\n💾 Saving results to: {results_file}")
                
                # Create complete test structure with all metadata
                test_structure = {
                    "current_variations": variations,  # Variations for current subquestion
                    "search_keywords": keywords,  # Keywords used for search
                    "results": final_results  # Results with all metadata
                }
                
                with open(results_file, 'w', encoding='utf-8') as f:
                    json.dump(test_structure, f, ensure_ascii=False, indent=2)
                print("✅ Results saved successfully")

            all_results.append({
                'question': subq,
                'results': final_results
            })

        return {
            'success': True,
            'results': all_results
        }

    except Exception as e:
        print(f"❌ Error in enhanced search: {str(e)}")
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e)
        } 