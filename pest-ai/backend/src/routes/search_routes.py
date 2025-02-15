from typing import List, Optional
from fastapi import Request, HTTPException
from fastapi.routing import APIRouter
from pydantic import BaseModel
from services.paraphrase_service_nokw import process_question
from services.search_service_single import SearchServiceSingle
from services.keyword_service import detect_keywords
import logging
import json
from datetime import datetime
import os
import uuid
from fastapi import BackgroundTasks
from services.format_service import format_result_to_md
from fastapi.responses import StreamingResponse
from services.response_service import ResponseService

# Configure logging
logger = logging.getLogger(__name__)

class AskMultiRequest(BaseModel):
    """
    Request model for the multi-question search endpoint.
    
    Attributes:
        question (str): The original user question to be processed
        keywords (List[str]): List of keywords to filter the search
        variations (Optional[List[str]]): Optional list of question variations
        limit (Optional[int]): Maximum number of results to return per subquestion (default: 5)
        alpha (Optional[float]): Weight factor for combining keyword and semantic scores (default: 0.7)
    """
    question: str
    keywords: List[str]
    variations: Optional[List[str]] = []
    limit: Optional[int] = 5
    alpha: Optional[float] = 0.7

router = APIRouter()

# @router.post("/ask")
# async def ask(request: Request):
#     try:
#         body = await request.json()
#         question = body.get("question")
        
#         if not question:
#             logger.error("Request received without question")
#             raise HTTPException(status_code=400, detail="Question is required")
            
#         # 1. Process question and get variations
#         logger.info(f"\n🔍 Processing question: '{question}'")
#         improved_questions = await process_question(question)
        
#         main_question = improved_questions["subquestion1"]
#         variations = improved_questions["variations_subquestion1"]
#         keywords = detect_keywords(main_question)
        
#         logger.info(f"\n📝 Main question: {main_question}")
#         logger.info(f"🔑 Keywords detected: {keywords}")
#         logger.info(f"🔄 Generated {len(variations)} variations")
        
#         # 2. Process each variation independently
#         search_service = SearchServiceSingle()
#         all_results = []
        
#         for i, variation in enumerate(variations):
#             logger.info(f"\n🔍 Processing variation {i+1}: '{variation}'")
            
#             # Get results for this variation
#             variation_results = search_service.hybrid_search_with_keywords(
#                 question=variation,
#                 keywords=keywords,
#                 variations=[variation],
#                 limit=10,
#                 alpha=0.7
#             )
            
#             # Log raw results for debugging
#             logger.info(f"Received {len(variation_results)} results for variation {i+1}")
#             for idx, result in enumerate(variation_results):
#                 logger.info(f"Raw result {idx + 1}: {result[:100]}...")  # Log first 100 chars
            
#             # Add to all results
#             all_results.extend(variation_results)
        
#         logger.info(f"\n📊 Total results gathered: {len(all_results)}")
        
#         response = {
#             "original_question": question,
#             "processed_question": improved_questions,
#             "search_results": all_results,
#             "debug_info": {
#                 "variations_count": len(variations),
#                 "total_results": len(all_results)
#             }
#         }
        
#         return response
        
#     except Exception as e:
#         logger.error(f"Error processing search request: {str(e)}", exc_info=True)
#         raise HTTPException(status_code=500, detail=str(e))

# @router.post("/ask/reranked")
# async def ask_reranked(request: Request):
#     """
#     Enhanced search endpoint that performs question processing, search, and result reranking.
    
#     Internal Services Used:
#     1. process_question (@paraphrase_service_nokw.py):
#         - Improves question readability
#         - Generates question variations if use_variations=True
#         - Returns improved question and variations
    
#     2. detect_keywords (@keyword_service.py):
#         - Extracts relevant keywords from the question
#         - Used to improve search precision
#         - Returns list of keywords for filtering
    
#     3. SearchServiceSingle (@search_service_single.py):
#         - Performs hybrid search (semantic + keyword)
#         - Combines BM25 and embedding-based search
#         - Uses variations if provided
#         - Returns ranked search results
    
#     The endpoint:
#     1. Processes and optionally generates variations of the input question
#     2. Performs hybrid search (semantic + keyword) for the question and its variations
#     3. Reranks results based on content quality factors
#     4. Deduplicates and returns top results
#     5. Saves debug information for analysis
    
#     Request Body:
#     {
#         "question": str,           # The user's question
#         "use_variations": bool     # Whether to use question variations (default: True)
#     }
    
#     Question Variations:
#     - When use_variations=True (default):
#         * Generates 5 alternative phrasings of the original question
#         * Example variations for "what is pestmode":
#             - "What does pestmode refer to?"
#             - "Could you explain what pestmode is?"
#             - "Can you describe what pestmode is?"
#             - "What is meant by pestmode?"
#             - "Please clarify what pestmode is."
#         * All variations are used in search to improve result coverage
        
#     - When use_variations=False:
#         * Only uses the improved version of the original question
#         * No additional variations are generated
#         * Faster but might miss some relevant results
    
#     Reranking Process:
#     1. Content Length Factor:
#         - Very short content (<200 chars): 0.3x score
#         - Short content (<500 chars): 0.7x score
#         - Normal content (≥500 chars): 1.0x score
    
#     2. Deduplication:
#         - Removes duplicate chunks (same chunk_id)
#         - Keeps the version with highest reranked score
    
#     Returns:
#     {
#         "original_question": str,      # The user's original question
#         "processed_question": {        # Question processing results
#             "number_of_subquestions": int,
#             "subquestion1": str,
#             "variations_subquestion1": List[str]  # Only if use_variations=True
#         },
#         "raw_results_count": int,      # Number of results before deduplication
#         "unique_results_count": int,    # Number of results after deduplication
#         "search_results": {
#             "semantic_search_results": List[dict]  # Top 5 reranked results
#         },
#         "debug_settings": {
#             "use_variations": bool,     # Whether variations were used
#             "timestamp": str           # Processing timestamp
#         }
#     }
    
#     Debug Files Generated:
#     - pre_rerank_{timestamp}.json:  Results before reranking
#     - post_rerank_{timestamp}.json: Final reranked results
    
#     Example:
#         Request: POST /ask/reranked
#         {
#             "question": "what is pestmode",
#             "use_variations": true
#         }
#     """
#     try:
#         # Get use_variations flag from request
#         body = await request.json()
#         use_variations = body.get("use_variations", True)  # Default to True
        
#         # 1. Get complete results
#         raw_response = await ask(request)
#         raw_results = raw_response["search_results"]["semantic_search_results"]
        
#         # Save pre-rerank response for debugging
#         debug_dir = "backend/debug/rerank"
#         os.makedirs(debug_dir, exist_ok=True)
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
#         # Add debug information about variations
#         debug_info = {
#             "original_response": raw_response,
#             "debug_settings": {
#                 "use_variations": use_variations,
#                 "timestamp": timestamp
#             }
#         }
        
#         # Save pre-rerank results with additional info
#         pre_rerank_file = f"{debug_dir}/pre_rerank_{timestamp}.json"
#         with open(pre_rerank_file, "w", encoding="utf-8") as f:
#             json.dump(debug_info, f, indent=2, ensure_ascii=False)
#         logger.info(f"Pre-rerank debug info saved to: {pre_rerank_file}")

#         # 2. Apply reranking considering only content length
#         reranked_results = []
        
#         for result in raw_results:
#             content = result.get("content", "")
#             base_score = result.get("normalized_semantic", 0)
            
#             # Length factor
#             length_factor = 1.0
#             if len(content) < 200:  # Very short content
#                 length_factor = 0.3
#             elif len(content) < 500:  # Short content
#                 length_factor = 0.7
                
#             # Final score
#             final_score = base_score * length_factor
            
#             result["reranked_score"] = final_score
#             result["debug_factors"] = {
#                 "length": length_factor,
#                 "content_length": len(content),
#                 "base_score": base_score
#             }
#             reranked_results.append(result)
            
#         # 3. Deduplicate by chunk_id keeping highest score
#         seen_chunks = {}
#         for result in reranked_results:
#             chunk_id = result["chunk_id"]
#             if chunk_id not in seen_chunks or result["reranked_score"] > seen_chunks[chunk_id]["reranked_score"]:
#                 seen_chunks[chunk_id] = result
                
#         # 4. Sort by final score and take top 5
#         final_results = list(seen_chunks.values())
#         final_results.sort(key=lambda x: x["reranked_score"], reverse=True)
#         top_results = final_results[:5]
        
#         # Prepare final response including variation settings
#         final_response = {
#             "original_question": raw_response["original_question"],
#             "processed_question": raw_response["processed_question"],
#             "raw_results_count": len(raw_results),
#             "unique_results_count": len(final_results),
#             "search_results": {
#                 "semantic_search_results": top_results
#             },
#             "debug_settings": {
#                 "use_variations": use_variations,
#                 "timestamp": timestamp
#             }
#         }

#         # Save post-rerank response
#         post_rerank_file = f"{debug_dir}/post_rerank_{timestamp}.json"
#         with open(post_rerank_file, "w", encoding="utf-8") as f:
#             json.dump(final_response, f, indent=2, ensure_ascii=False)
#         logger.info(f"Post-rerank debug info saved to: {post_rerank_file}")
        
#         return final_response
        
#     except Exception as e:
#         logger.error(f"Error in reranking: {str(e)}", exc_info=True)
#         raise HTTPException(status_code=500, detail=str(e))

# @router.post("/ask/subquestions")
# async def ask_subquestions(request: Request):
#     """
#     Enhanced search endpoint that processes each subquestion independently.
    
#     For each subquestion:
#     1. Processes the subquestion (with optional variations)
#     2. Performs hybrid search
#     3. Applies reranking
#     4. Generates individual debug files
#     5. Returns top 5 results
    
#     Request Body:
#     {
#         "question": str,
#         "use_variations": bool     # Whether to use variations (default: True)
#     }
#     """
#     try:
#         # Get request parameters
#         body = await request.json()
#         question = body.get("question")
#         use_variations = body.get("use_variations", True)
        
#         if not question:
#             raise HTTPException(status_code=400, detail="Question is required")
            
#         # 1. Process question to get subquestions
#         logger.info(f"\n🔍 Processing question: '{question}'")
#         improved_questions = await process_question(question)
        
#         # 2. Process each subquestion independently
#         subquestions_results = []
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         debug_dir = "backend/debug/rerank"
#         os.makedirs(debug_dir, exist_ok=True)
        
#         for i in range(improved_questions["number_of_subquestions"]):
#             sub_question_key = f"subquestion{i+1}"
#             variations_key = f"variations_subquestion{i+1}"
            
#             if sub_question_key not in improved_questions:
#                 continue
                
#             main_question = improved_questions[sub_question_key]
#             variations = improved_questions[variations_key] if use_variations else []
#             keywords = detect_keywords(main_question)
            
#             logger.info(f"\n📝 Processing subquestion {i+1}: {main_question}")
            
#             # 3. Get search results for this subquestion
#             search_service = SearchServiceSingle()
#             search_results = search_service.hybrid_search_with_keywords(
#                 question=main_question,
#                 keywords=keywords,
#                 variations=variations,
#                 limit=10,
#                 alpha=0.7
#             )
            
#             # 4. Save pre-rerank results for this subquestion
#             pre_rerank_data = {
#                 "subquestion": main_question,
#                 "variations": variations,
#                 "keywords": keywords,
#                 "raw_results": search_results["semantic_search_results"]
#             }
            
#             pre_rerank_file = f"{debug_dir}/pre_rerank_subq_{i+1}_{timestamp}.json"
#             with open(pre_rerank_file, "w", encoding="utf-8") as f:
#                 json.dump(pre_rerank_data, f, indent=2, ensure_ascii=False)
            
#             # 5. Apply reranking to this subquestion's results
#             reranked_results = []
#             for result in search_results["semantic_search_results"]:
#                 # Get normalized scores (ya no deberían ser cero por las mejoras en hybrid_search_with_keywords_multi)
#                 semantic_score = result.get("normalized_semantic", 0)
#                 keyword_score = result.get("normalized_keyword", 0)
#                 combined_score = result.get("combined_score", 0)
                
#                 # Length factor
#                 content = result.get("content", "")
#                 length_factor = 1.0
#                 if len(content) < 200:
#                     length_factor = 0.3
#                 elif len(content) < 500:
#                     length_factor = 0.7
                
#                 # Calculate final score using combined score
#                 final_score = combined_score * length_factor
                
#                 result["reranked_score"] = final_score
#                 result["debug_factors"] = {
#                     "length_factor": length_factor,
#                     "content_length": len(content),
#                     "semantic_score": semantic_score,
#                     "keyword_score": keyword_score,
#                     "combined_score": combined_score,
#                     "final_score": final_score
#                 }
#                 reranked_results.append(result)
            
#             # 6. Deduplicate this subquestion's results
#             seen_chunks = {}
#             for result in reranked_results:
#                 chunk_id = result["chunk_id"]
#                 if chunk_id not in seen_chunks or result["reranked_score"] > seen_chunks[chunk_id]["reranked_score"]:
#                     seen_chunks[chunk_id] = result
            
#             # 7. Get top 5 for this subquestion
#             final_results = list(seen_chunks.values())
#             final_results.sort(key=lambda x: x["reranked_score"], reverse=True)
#             top_results = final_results[:5]
            
#             # 8. Save post-rerank results for this subquestion
#             post_rerank_data = {
#                 "subquestion": main_question,
#                 "variations": variations,
#                 "keywords": keywords,
#                 "top_results": top_results,
#                 "metrics": {
#                     "raw_results_count": len(search_results["semantic_search_results"]),
#                     "unique_results_count": len(final_results),
#                     "variations_count": len(variations)
#                 }
#             }
            
#             post_rerank_file = f"{debug_dir}/post_rerank_subq_{i+1}_{timestamp}.json"
#             with open(post_rerank_file, "w", encoding="utf-8") as f:
#                 json.dump(post_rerank_data, f, indent=2, ensure_ascii=False)
            
#             # 9. Store results for this subquestion
#             subquestions_results.append({
#                 "subquestion": main_question,
#                 "variations": variations,
#                 "keywords": keywords,
#                 "search_results": top_results,
#                 "metrics": post_rerank_data["metrics"]
#             })
        
#         # 10. Prepare final response with all subquestions
#         final_response = {
#             "original_question": question,
#             "number_of_subquestions": improved_questions["number_of_subquestions"],
#             "subquestions": subquestions_results,
#             "debug_info": {
#                 "use_variations": use_variations,
#                 "timestamp": timestamp
#             }
#         }
        
#         return final_response
        
#     except Exception as e:
#         logger.error(f"Error processing subquestions search request: {str(e)}", exc_info=True)
#         raise HTTPException(status_code=500, detail=str(e)) 
    
# @router.post("/ask/subquestions_multi")
# async def ask_subquestions_multi(request: Request):
#     """
#     Enhanced search endpoint that processes each subquestion and its variations independently.
#     Generates debug JSON files for each subquestion (pre and post rerank).
#     """
#     try:
#         body = await request.json()
#         question = body.get("question")
#         use_variations = body.get("use_variations", True)
#         request_id = str(uuid.uuid4())
        
#         if not question:
#             raise HTTPException(status_code=400, detail="Question is required")
            
#         # Setup debug directory with absolute path
#         current_dir = os.path.dirname(os.path.abspath(__file__))
#         debug_dir = os.path.join(current_dir, "..", "..", "debug", "rerank")
#         os.makedirs(debug_dir, exist_ok=True)
        
#         async def send_status(message: str):
#             """Placeholder for future WebSocket status updates"""
#             logger.info(f"Status Update [{request_id}]: {message}")
            
#         # 1. Process question to get subquestions
#         await send_status(f"Processing main question: '{question}'")
#         improved_questions = await process_question(question)
        
#         # 2. Process each subquestion independently
#         total_subquestions = improved_questions["number_of_subquestions"]
#         await send_status(f"Found {total_subquestions} subquestions to process")
        
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
#         for i in range(total_subquestions):
#             sub_question_key = f"subquestion{i+1}"
#             variations_key = f"variations_subquestion{i+1}"
            
#             if sub_question_key not in improved_questions:
#                 continue
                
#             main_question = improved_questions[sub_question_key]
#             variations = improved_questions[variations_key] if use_variations else []
#             keywords = detect_keywords(main_question)
            
#             await send_status(f"Processing subquestion {i+1}/{total_subquestions}: {main_question}")
            
#             # 3. Process variations
#             if variations:
#                 await send_status(f"Processing {len(variations)} variations for subquestion {i+1}")
            
#             # 4. Get search results using hybrid_search_with_keywords_multi
#             search_service = SearchServiceSingle()
#             await send_status(f"Performing hybrid search for subquestion {i+1}")
#             search_results = search_service.hybrid_search_with_keywords_multi(
#                 question=main_question,
#                 keywords=keywords,
#                 variations=variations,
#                 limit=10,
#                 alpha=0.7
#             )
            
#             # 5. Save pre-rerank results
#             pre_rerank_data = {
#                 "subquestion": main_question,
#                 "variations": variations,
#                 "keywords": keywords,
#                 "raw_results": search_results["semantic_search_results"]
#             }
            
#             pre_rerank_file = os.path.join(debug_dir, f"pre_rerank_multi_subq_{i+1}_{timestamp}.json")
#             with open(pre_rerank_file, "w", encoding="utf-8") as f:
#                 json.dump(pre_rerank_data, f, indent=2, ensure_ascii=False)
            
#             # 6. Apply reranking with improved scoring
#             await send_status(f"Reranking results for subquestion {i+1}")
#             reranked_results = []
#             for result in search_results["semantic_search_results"]:
#                 semantic_score = result.get("normalized_semantic", 0)
#                 keyword_score = result.get("normalized_keyword", 0)
#                 combined_score = result.get("combined_score", 0)
                
#                 content = result.get("content", "")
#                 length_factor = 1.0
#                 if len(content) < 200:
#                     length_factor = 0.3
#                 elif len(content) < 500:
#                     length_factor = 0.7
                
#                 final_score = combined_score * length_factor
                
#                 result["reranked_score"] = final_score
#                 result["debug_factors"] = {
#                     "length_factor": length_factor,
#                     "content_length": len(content),
#                     "semantic_score": semantic_score,
#                     "keyword_score": keyword_score,
#                     "combined_score": combined_score,
#                     "final_score": final_score
#                 }
#                 reranked_results.append(result)
            
#             # 7. Deduplicate
#             seen_chunks = {}
#             for result in reranked_results:
#                 chunk_id = result["chunk_id"]
#                 if chunk_id not in seen_chunks or result["reranked_score"] > seen_chunks[chunk_id]["reranked_score"]:
#                     seen_chunks[chunk_id] = result
            
#             # 8. Get top 5
#             final_results = list(seen_chunks.values())
#             final_results.sort(key=lambda x: x["reranked_score"], reverse=True)
#             top_results = final_results[:5]
            
#             # 9. Save post-rerank results
#             post_rerank_data = {
#                 "subquestion": main_question,
#                 "variations": variations,
#                 "keywords": keywords,
#                 "top_results": top_results,
#                 "metrics": {
#                     "raw_results_count": len(search_results["semantic_search_results"]),
#                     "unique_results_count": len(final_results),
#                     "variations_count": len(variations)
#                 }
#             }
            
#             post_rerank_file = os.path.join(debug_dir, f"post_rerank_multi_subq_{i+1}_{timestamp}.json")
#             with open(post_rerank_file, "w", encoding="utf-8") as f:
#                 json.dump(post_rerank_data, f, indent=2, ensure_ascii=False)
            
#             await send_status(f"Completed processing subquestion {i+1}/{total_subquestions}")
        
#         # 10. Return detailed response
#         return {
#             "request_id": request_id,
#             "status": "completed",
#             "timestamp": timestamp,
#             "search_summary": {
#                 "original_question": question,
#                 "total_subquestions": total_subquestions,
#                 "use_variations": use_variations,
#                 "subquestions_processed": [
#                     {
#                         "question": result["subquestion"],
#                         "variations_count": len(result["variations"]),
#                         "keywords": result["keywords"],
#                         "metrics": {
#                             "total_results": result["metrics"].get("raw_results_count", 0),
#                             "unique_results": result["metrics"].get("unique_results_count", 0),
#                             "variations_processed": result["metrics"].get("variations_count", 0),
#                             "variation_details": result["metrics"].get("variation_metrics", {}),
#                             "results_by_source": result["metrics"].get("documents_by_source", {})
#                         },
#                         "top_results": [
#                             {
#                                 "id": doc.get("chunk_id"),
#                                 "content": doc.get("content", "")[:200] + "...",  # First 200 chars
#                                 "scores": {
#                                     "final_score": doc.get("reranked_score", 0),
#                                     "semantic_score": doc["debug_factors"].get("semantic_score", 0),
#                                     "keyword_score": doc["debug_factors"].get("keyword_score", 0),
#                                     "combined_score": doc["debug_factors"].get("combined_score", 0),
#                                     "length_factor": doc["debug_factors"].get("length_factor", 0)
#                                 },
#                                 "found_in": doc.get("found_in", []),
#                                 "file_name": doc.get("file_name", ""),
#                                 "header": doc.get("header", "")
#                             }
#                             for doc in result["search_results"].get("semantic_search_results", [])[:5]  # Top 5 results
#                         ]
#                     }
#                     for result in subquestions_results
#                 ]
#             },
#             "debug_files": {
#                 "location": debug_dir,
#                 "final_results": os.path.join(debug_dir, f"final_results_{timestamp}.json")
#             }
#         }
        
#     except Exception as e:
#         error_msg = f"Error processing subquestions search request: {str(e)}"
#         logger.error(error_msg, exc_info=True)
#         await send_status(f"Error: {error_msg}")
#         raise HTTPException(status_code=500, detail=str(e))
    
# @router.post("/ask/subquestions_multi_rerank")
# async def ask_subquestions_multi_rerank(request: Request):
#     """
#     Enhanced search endpoint that processes each subquestion and its variations independently.
#     Uses the integrated reranking logic from SearchServiceSingle.
#     """
#     try:
#         body = await request.json()
#         question = body.get("question")
#         use_variations = body.get("use_variations", True)
#         request_id = str(uuid.uuid4())
        
#         if not question:
#             raise HTTPException(status_code=400, detail="Question is required")
            
#         # Setup debug directory with absolute path
#         current_dir = os.path.dirname(os.path.abspath(__file__))
#         debug_dir = os.path.join(current_dir, "..", "..", "debug", "rerank")
#         os.makedirs(debug_dir, exist_ok=True)
            
#         async def send_status(message: str):
#             """Placeholder for future WebSocket status updates"""
#             logger.info(f"Status Update [{request_id}]: {message}")
            
#         # 1. Process question to get subquestions
#         await send_status(f"Processing main question: '{question}'")
#         improved_questions = await process_question(question)
        
#         # 2. Process each subquestion independently
#         total_subquestions = improved_questions["number_of_subquestions"]
#         await send_status(f"Found {total_subquestions} subquestions to process")
        
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         subquestions_results = []
        
#         for i in range(total_subquestions):
#             sub_question_key = f"subquestion{i+1}"
#             variations_key = f"variations_subquestion{i+1}"
            
#             if sub_question_key not in improved_questions:
#                 continue
                
#             main_question = improved_questions[sub_question_key]
#             variations = improved_questions[variations_key] if use_variations else []
#             keywords = detect_keywords(main_question)
            
#             await send_status(f"Processing subquestion {i+1}/{total_subquestions}: {main_question}")
            
#             # Process variations if enabled
#             if variations:
#                 await send_status(f"Processing {len(variations)} variations for subquestion {i+1}")
            
#             # Use the new integrated search + rerank function
#             search_service = SearchServiceSingle()
#             await send_status(f"Performing hybrid search with reranking for subquestion {i+1}")
#             search_results = search_service.hybrid_search_with_keywords_multi_rerank(
#                 question=main_question,
#                 keywords=keywords,
#                 variations=variations,
#                 limit=10,
#                 alpha=0.7,
#                 subquestion_number=i+1,
#                 request_timestamp=timestamp
#             )
            
#             # Store results for this subquestion
#             subquestions_results.append({
#                 "subquestion": main_question,
#                 "variations": variations,
#                 "keywords": keywords,
#                 "search_results": search_results,
#                 "metrics": search_results.get("metrics", {})
#             })
            
#             await send_status(f"Completed processing subquestion {i+1}/{total_subquestions}")
        
#         # Save final combined results
#         final_results = {
#             "request_id": request_id,
#             "original_question": question,
#             "number_of_subquestions": total_subquestions,
#             "subquestions_results": subquestions_results,
#             "timestamp": timestamp,
#             "settings": {
#                 "use_variations": use_variations
#             }
#         }
        
#         final_results_file = os.path.join(debug_dir, f"final_results_{timestamp}.json")
#         with open(final_results_file, "w", encoding="utf-8") as f:
#             json.dump(final_results, f, indent=2, ensure_ascii=False)
        
#         # Return detailed response
#         return {
#             "request_id": request_id,
#             "status": "completed",
#             "timestamp": timestamp,
#             "search_summary": {
#                 "original_question": question,
#                 "total_subquestions": total_subquestions,
#                 "use_variations": use_variations,
#                 "subquestions_processed": [
#                     {
#                         "question": result["subquestion"],
#                         "variations_count": len(result["variations"]),
#                         "keywords": result["keywords"],
#                         "metrics": {
#                             "total_results": result["metrics"].get("raw_results_count", 0),
#                             "unique_results": result["metrics"].get("unique_results_count", 0),
#                             "variations_processed": result["metrics"].get("variations_count", 0),
#                             "variation_details": result["metrics"].get("variation_metrics", {}),
#                             "results_by_source": result["metrics"].get("documents_by_source", {})
#                         },
#                         "top_results": [
#                             {
#                                 "id": doc.get("chunk_id"),
#                                 "content": doc.get("content", "")[:200] + "...",  # First 200 chars
#                                 "scores": {
#                                     "final_score": doc.get("reranked_score", 0),
#                                     "semantic_score": doc["debug_factors"].get("semantic_score", 0),
#                                     "keyword_score": doc["debug_factors"].get("keyword_score", 0),
#                                     "combined_score": doc["debug_factors"].get("combined_score", 0),
#                                     "length_factor": doc["debug_factors"].get("length_factor", 0)
#                                 },
#                                 "found_in": doc.get("found_in", []),
#                                 "file_name": doc.get("file_name", ""),
#                                 "header": doc.get("header", "")
#                             }
#                             for doc in result["search_results"].get("semantic_search_results", [])[:5]  # Top 5 results
#                         ]
#                     }
#                     for result in subquestions_results
#                 ]
#             },
#             "debug_files": {
#                 "location": debug_dir,
#                 "final_results": final_results_file
#             }
#         }
        
#     except Exception as e:
#         error_msg = f"Error processing subquestions search request: {str(e)}"
#         logger.error(error_msg, exc_info=True)
#         await send_status(f"Error: {error_msg}")
#         raise HTTPException(status_code=500, detail=str(e))
    
    
# @router.post("/ask/subquestions_multi_rerank_stream")
# async def ask_subquestions_multi_rerank_stream(request: Request):
#     """Stream the response using markdown files generated by the search process."""
#     try:
#         # Get request parameters
#         body = await request.json()
#         question = body.get("question")
        
#         if not question:
#             raise HTTPException(status_code=400, detail="Question is required")
            
#         # Create request ID and timestamp
#         request_id = str(uuid.uuid4())
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
#         # Create initial status
#         status = {
#             "status": "processing",
#             "current_step": "Starting processing...",
#             "progress": 0,
#             "request_id": request_id,
#             "timestamp": timestamp
#         }

#         async def generate():
#             try:
#                 # Step 1: Process question into subquestions
#                 status["current_step"] = "Processing question into subquestions..."
#                 status["progress"] = 10
#                 yield f"data: {json.dumps(status)}\n\n"
                
#                 question_data = await process_question(question)
#                 print(f"Question data received: {json.dumps(question_data, indent=2)}")
                
#                 # Step 2: Process each subquestion
#                 status["current_step"] = "Processing subquestions..."
#                 num_subquestions = question_data.get('number_of_subquestions', 0)
#                 search_service = SearchServiceSingle()
                
#                 subquestions_results = []
#                 markdown_files = []  # Lista para guardar los archivos markdown generados
                
#                 for i in range(1, num_subquestions + 1):
#                     subq_key = f'subquestion{i}'
#                     var_key = f'variations_subquestion{i}'
                    
#                     if subq_key not in question_data:
#                         continue
                        
#                     status["progress"] = 10 + (i * 40 // num_subquestions)  # Ajustado para dejar espacio para la respuesta
#                     status["current_step"] = f"Processing subquestion {i} of {num_subquestions}..."
#                     yield f"data: {json.dumps(status)}\n\n"
                    
#                     # Get the subquestion and its variations
#                     current_question = question_data[subq_key]
#                     variations = question_data.get(var_key, [])
                    
#                     # Detect keywords for this subquestion
#                     try:
#                         keywords = detect_keywords(current_question)
#                         print(f"Detected keywords for subquestion {i}: {keywords}")
#                     except Exception as e:
#                         logger.error(f"Error detecting keywords: {str(e)}")
#                         keywords = []
                    
#                     # Perform search with keywords and reranking
#                     search_results = search_service.hybrid_search_with_keywords_multi_rerank(
#                         question=current_question,
#                         keywords=keywords,
#                         variations=variations,
#                         limit=5,
#                         alpha=0.7,
#                         subquestion_number=i,
#                         request_timestamp=timestamp
#                     )
                    
#                     # Add markdown file to list if it was generated
#                     if "markdown_file" in search_results:
#                         markdown_files.append(search_results["markdown_file"])
#                         print(f"\n📝 Added markdown file to list: {search_results['markdown_file']}")
                    
#                 # Step 3: Generate streaming response using markdown files
#                 status["current_step"] = "Generating response..."
#                 status["progress"] = 50
#                 yield f"data: {json.dumps(status)}\n\n"
                
#                 # Recolectar las subquestions
#                 subquestions = []
#                 for i in range(1, num_subquestions + 1):
#                     subq_key = f'subquestion{i}'
#                     if subq_key in question_data:
#                         subquestions.append(question_data[subq_key])
                
#                 response_service = ResponseService()
#                 async for chunk in response_service.generate_streaming_response_multi_rerank(
#                     markdown_files=markdown_files,
#                     question=question,
#                     subquestions=subquestions
#                 ):
#                     # Si es texto del LLM, enviarlo directamente
#                     yield f"data: {chunk}\n\n"
                
#                 # Final status
#                 status["status"] = "completed"
#                 status["current_step"] = "Done"
#                 status["progress"] = 100
#                 yield f"data: {json.dumps(status)}\n\n"

#             except Exception as e:
#                 logger.error(f"Error in generate function: {str(e)}", exc_info=True)
#                 status["status"] = "error"
#                 status["current_step"] = f"Error: {str(e)}"
#                 status["progress"] = 0
#                 yield f"data: {json.dumps({'error': str(e)})}\n\n"

#         return StreamingResponse(generate(), media_type="text/event-stream")
        
#     except Exception as e:
#         error_msg = f"Error processing streaming request: {str(e)}"
#         logger.error(error_msg, exc_info=True)
#         raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate_custom_response_stream")
async def generate_custom_response_stream(request: Request):
    """Genera una respuesta en streaming usando texto plano."""
    try:
        # Obtener parámetros de la petición
        body = await request.json()
        question = body.get("question")
        
        if not question:
            raise HTTPException(status_code=400, detail="Question is required")
            
        # Crear request ID y timestamp
        request_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        async def generate():
            try:
                # Paso 1: Procesar la pregunta
                question_data = await process_question(question)
                num_subquestions = question_data.get('number_of_subquestions', 0)
                search_service = SearchServiceSingle()
                
                # Procesar cada subpregunta
                markdown_files = []
                subquestions = []
                
                for i in range(1, num_subquestions + 1):
                    subq_key = f'subquestion{i}'
                    var_key = f'variations_subquestion{i}'
                    
                    if subq_key not in question_data:
                        continue
                        
                    # Obtener subpregunta y variaciones
                    current_question = question_data[subq_key]
                    variations = question_data.get(var_key, [])
                    subquestions.append(current_question)
                    
                    # Detectar keywords
                    try:
                        keywords = detect_keywords(current_question)
                        print(f"Detected keywords for subquestion {i}: {keywords}")
                    except Exception as e:
                        logger.error(f"Error detecting keywords: {str(e)}")
                        keywords = []
                    
                    # Búsqueda con keywords y reranking
                    search_results = search_service.hybrid_search_with_keywords_multi_rerank(
                        question=current_question,
                        keywords=keywords,
                        variations=variations,
                        limit=10,
                        alpha=0.5,
                        subquestion_number=i,
                        request_timestamp=timestamp
                    )
                    
                    # Agregar archivo markdown si fue generado
                    if "markdown_file" in search_results:
                        markdown_files.append(search_results["markdown_file"])
                
                # Generar respuesta usando los archivos markdown
                response_service = ResponseService()
                async for chunk in response_service.generate_streaming_response_multi_rerank_geminy(
                    markdown_files=markdown_files,
                    question=question,
                    subquestions=subquestions
                ):
                    yield chunk

            except Exception as e:
                logger.error(f"Error in generate function: {str(e)}", exc_info=True)
                yield f"Error: {str(e)}"

        return StreamingResponse(
            generate(),
            media_type="text/plain"  # Cambiado a text/plain
        )
        
    except Exception as e:
        error_msg = f"Error processing request: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)

@router.post("/generate_gemini_response_stream")
async def generate_gemini_response_stream(request: Request):
    """
    Endpoint para generar respuestas usando Gemini API con streaming.
    """
    try:
        # Obtener el cuerpo de la solicitud
        body = await request.json()
        question = body.get("question", "")
        
        if not question:
            raise HTTPException(status_code=400, detail="Question is required")
            
        logger.info(f"📝 Received question for Gemini streaming: {question}")
        
        # Crear instancia del servicio de respuesta
        response_service = ResponseService()
        
        async def generate():
            try:
                async for chunk in response_service.stream_gemini(question):
                    yield chunk
                    
            except Exception as e:
                logger.error(f"Error in generate function: {str(e)}", exc_info=True)
                yield f"Error: {str(e)}"
                
        return StreamingResponse(
            generate(),
            media_type="text/plain"
        )
        
    except Exception as e:
        error_msg = f"Error processing request: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)

@router.post("/search_gemini")
async def search_gemini(request: Request):
    """
    Endpoint para búsqueda avanzada usando Gemini API con variaciones de la pregunta.
    """
    try:
        # Obtener el cuerpo de la solicitud
        body = await request.json()
        question = body.get("question", "")
        
        if not question:
            raise HTTPException(status_code=400, detail="Question is required")
            
        logger.info(f"📝 Received search question: {question}")
        
        # Procesar la pregunta para obtener variaciones
        question_data = await process_question(question)
        main_question = question_data["subquestion1"]
        variations = question_data["variations_subquestion1"]
        
        # Procesar la pregunta para obtener keywords
        keywords = detect_keywords(main_question)
        logger.info(f"🔑 Detected keywords: {keywords}")
        logger.info(f"🔄 Generated variations: {variations}")
        
        # Realizar búsqueda avanzada usando SearchServiceSingle
        search_service = SearchServiceSingle()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        search_results = search_service.hybrid_search_with_keywords_multi_rerank(
            question=main_question,
            keywords=keywords,
            variations=variations,
            limit=10,
            alpha=0.5,
            request_timestamp=timestamp
        )
        
        # Usar el archivo markdown generado si existe
        context = None
        if "markdown_file" in search_results and os.path.exists(search_results["markdown_file"]):
            with open(search_results["markdown_file"], 'r', encoding='utf-8') as f:
                context = f.read()
        
        # Crear instancia del servicio de respuesta
        response_service = ResponseService()
        
        async def generate():
            try:
                async for chunk in response_service.stream_gemini(question, context):
                    yield chunk
                    
            except Exception as e:
                logger.error(f"Error in generate function: {str(e)}", exc_info=True)
                yield f"Error: {str(e)}"
                
        return StreamingResponse(
            generate(),
            media_type="text/plain"
        )
        
    except Exception as e:
        error_msg = f"Error processing request: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)
