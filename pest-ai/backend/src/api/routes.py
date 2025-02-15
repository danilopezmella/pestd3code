from fastapi import APIRouter, Query, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from services.question_service import save_question
from models.question import Question
from services.paraphrase_service_nokw import process_question
from services.search_service import SearchService
from services.search_service_single import SearchServiceSingle
from services.keyword_service import detect_keywords
#from services.enhanced_search_service import enhanced_search
from services.response_service import ResponseService
from typing import Optional, Literal
import asyncio
import json
import os
import logging

router = APIRouter(prefix="/api")
search_service = SearchService()
search_service_single = SearchServiceSingle()
response_service = ResponseService()

# Simple in-memory counter (will reset on server restart)
connection_counter = 0

# Status storage (in memory for now - could be moved to Redis/DB later)
_status_store = {}

logger = logging.getLogger(__name__)

async def store_status(question_id: str, status: dict):
    """Store the current status for a question."""
    _status_store[question_id] = status

async def get_status(question_id: str):
    """Get the current status for a question."""
    return _status_store.get(question_id, {
        "status": "not_found",
        "current_step": "Question not found",
        "progress": 0
    })

@router.post("/ask")
async def ask_question(
    question: Question, 
    alpha: Optional[float] = None,
    search_method: Optional[Literal["hybrid", "semantic", "keyword", "hybrid_filtered"]] = "hybrid"
):
    """Processes a multi-question query by treating each sub-question independently.
    
    Args:
        question: The question object containing user_id and question text
        alpha: Optional weight for keyword scores (0 to 1).
               alpha = 0.0: 100% semantic, 0% keyword
               alpha = 0.3: 30% keyword, 70% semantic
               alpha = 0.5: 50% keyword, 50% semantic (default)
               alpha = 0.7: 70% keyword, 30% semantic
               alpha = 1.0: 100% keyword, 0% semantic
        search_method: Search method to use:
               hybrid: Regular hybrid search (default)
               semantic: Only semantic search
               keyword: Only keyword search
               hybrid_filtered: Hybrid search with keyword pre-filtering
    """
    
    # Step 1: Process the question
    parsed_question = await process_question(question.question)

    # Step 2: Save the original question to the database
    response = save_question(question)

    # Create query info for debug files
    query_info = {
        'search_method': search_method,
        'alpha': alpha if alpha is not None else search_service.default_alpha,
        'number_of_subquestions': parsed_question["number_of_subquestions"]
    }
    for i in range(parsed_question["number_of_subquestions"]):
        sub_key = f"subquestion{i+1}"
        var_key = f"variations_subquestion{i+1}"
        if sub_key in parsed_question:
            query_info[sub_key] = parsed_question[sub_key]
        if var_key in parsed_question:
            query_info[var_key] = parsed_question[var_key]

    # Step 3: Perform search based on selected method
    if search_method == "semantic":
        search_results = {}
        for i in range(parsed_question["number_of_subquestions"]):
            sub_question_key = f"subquestion{i+1}"
            variations_key = f"variations_subquestion{i+1}"
            if sub_question_key in parsed_question and variations_key in parsed_question:
                results = search_service.semantic_search(
                    [parsed_question[sub_question_key]] + parsed_question[variations_key],
                    limit=5
                )
                search_results[f"semantic_search_results_{sub_question_key}"] = results
                search_results[f"keyword_search_results_{sub_question_key}"] = []
    
    elif search_method == "keyword":
        search_results = {}
        for i in range(parsed_question["number_of_subquestions"]):
            sub_question_key = f"subquestion{i+1}"
            variations_key = f"variations_subquestion{i+1}"
            if sub_question_key in parsed_question and variations_key in parsed_question:
                results = search_service.keyword_search(
                    [parsed_question[sub_question_key]] + parsed_question[variations_key],
                    limit=5
                )
                search_results[f"semantic_search_results_{sub_question_key}"] = []
                search_results[f"keyword_search_results_{sub_question_key}"] = results
    
    elif search_method == "hybrid_filtered":
        search_results = search_service.hybrid_search_with_keywords(parsed_question, alpha=alpha)
    
    else:  # default hybrid
        search_results = search_service.hybrid_search(parsed_question, alpha=alpha)

    # Create debug files with query info
    search_service.debug_service.create_search_debug_file(search_results, query_info)
    
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
    search_service.debug_service.create_variations_debug_file(variations_info)
    
    # Create metrics debug
    metrics_info = {
        'totals': {
            'total_docs': sum(len(results) for results in search_results.values() if isinstance(results, list)),
            'primary_docs': sum(sum(1 for doc in results if doc.get('is_from_primary', False)) 
                              for results in search_results.values() if isinstance(results, list)),
            'variation_docs': sum(sum(1 for doc in results if not doc.get('is_from_primary', False))
                                for results in search_results.values() if isinstance(results, list))
        }
    }
    search_service.debug_service.create_metrics_debug_file(metrics_info)

    # Step 4: Return flat but organized response
    return {
        # Metadata section
        "status": response["status"],
        "question_id": response["question_id"],
        "user_id": response["user_id"],
        "question": response["question"],
        "alpha_used": alpha if alpha is not None else search_service.default_alpha,
        "search_method": search_method,
        
        # Question processing section
        "number_of_subquestions": parsed_question["number_of_subquestions"],
        **{
            f"subquestion{i+1}": parsed_question[f"subquestion{i+1}"] 
            for i in range(parsed_question["number_of_subquestions"])
        },
        **{
            f"variations_subquestion{i+1}": parsed_question[f"variations_subquestion{i+1}"]
            for i in range(parsed_question["number_of_subquestions"])
        },
        **{
            f"keywords_found_subquestion{i+1}": parsed_question[f"keywords_found_subquestion{i+1}"]
            for i in range(parsed_question["number_of_subquestions"])
        },
        
        # Search results section - with truncated content for readability
        **{
            f"semantic_search_results_subquestion{i+1}": [
                {
                    "content": result["content"][:600] + "..." if len(result.get("content", "")) > 200 else result.get("content", ""),
                    "header": result.get("header", ""),
                    "similarity": result.get("similarity", 0),
                    "chunk_id": result.get("chunk_id", "")
                }
                for result in search_results.get(f"semantic_search_results_subquestion{i+1}", [])
            ]
            for i in range(parsed_question["number_of_subquestions"])
        },
        **{
            f"keyword_search_results_subquestion{i+1}": [
                {
                    "content": result["content"][:600] + "..." if len(result.get("content", "")) > 200 else result.get("content", ""),
                    "header": result.get("header", ""),
                    "rank": result.get("rank", 0),
                    "chunk_id": result.get("chunk_id", "")
                }
                for result in search_results.get(f"keyword_search_results_subquestion{i+1}", [])
            ]
            for i in range(parsed_question["number_of_subquestions"])
        }
    }

@router.post("/ask_single")
async def ask_single_question(
    background_tasks: BackgroundTasks,
    question: Question, 
    alpha: Optional[float] = Query(None, description="Weight for keyword scores (0 to 1)"),
    search_method: Optional[Literal["hybrid", "hybrid_filtered", "auto"]] = Query("auto", description="Search method to use")
):
    """Process a single question and return search results."""
    
    # Step 1: Store question and get response object
    response = save_question(question)
    
    # Create initial status
    status = {
        "status": "processing",
        "current_step": "Improving question...",
        "progress": 0,
        "question_id": response["question_id"]
    }
    
    # Store initial status
    await store_status(response["question_id"], status)
    
    try:
        # Step 2: Detect keywords
        print("\n🔑 Detecting keywords...")
        status["current_step"] = "Detecting keywords..."
        status["progress"] = 20
        await store_status(response["question_id"], status)
        await asyncio.sleep(1)  # Delay para que se vea el estado
        
        detected_keywords = detect_keywords(question.question)
        print(f"\n🔑 Detected keywords: {detected_keywords}")
        
        # Step 3: Select search method
        status["current_step"] = "Selecting search method..."
        status["progress"] = 40
        await store_status(response["question_id"], status)
        await asyncio.sleep(0.5)  # Delay para que se vea el estado
        
        actual_search_method = search_method
        if search_method == "auto":
            actual_search_method = "hybrid_filtered" if detected_keywords else "hybrid"
            print(f"\n🔄 Auto-selected search method: {actual_search_method}")

        # Step 4: Perform search based on selected method
        status["current_step"] = "Searching in database..."
        status["progress"] = 60
        await store_status(response["question_id"], status)
        
        if actual_search_method == "hybrid_filtered":
            if not detected_keywords:
                print("\n⚠️  Warning: No keywords detected for hybrid_filtered search, falling back to regular hybrid")
                search_results = search_service_single.hybrid_search(
                    question=question.question,
                    alpha=alpha
                )
            else:
                print(f"\n🔍 Performing hybrid filtered search with keywords: {detected_keywords}")
                search_results = search_service_single.hybrid_search_with_keywords(
                    question=question.question,
                    keywords=detected_keywords,
                    alpha=alpha,
                    variations=[question.question]  # Use the original question as the only variation
                )
        else:  # hybrid
            search_results = search_service_single.hybrid_search(
                question=question.question,
                alpha=alpha
            )

        # Print JSON debug
        print("\n📊 Search Results JSON:")
        print(json.dumps(search_results, indent=2))
        
        # Save detailed results JSON
        debug_dir = "debug"
        os.makedirs(debug_dir, exist_ok=True)
        
        # Format results in the same structure as enhanced_search
        detailed_results = {
            "current_variations": [question.question],  # Only original question as variation
            "search_keywords": detected_keywords,
            "results": [
                {
                    "chunk_id": doc.get('chunk_id'),
                    "content": doc.get('content'),
                    "header": doc.get('header'),
                    "level": doc.get('level'),
                    "file_name": doc.get('file_name'),
                    "combined_score": doc.get('combined_score', 0),
                    "keywords": doc.get('keywords', []),
                    "summary_self": doc.get('summary_self', ''),
                    "summary_prev": doc.get('summary_prev', ''),
                    "summary_next": doc.get('summary_next', ''),
                    "header_summary_1": doc.get('header_summary_1', ''),
                    "header_summary_2": doc.get('header_summary_2', ''),
                    "prev_id": doc.get('prev_id', ''),
                    "next_id": doc.get('next_id', ''),
                    "rank": doc.get('rank', 0),
                    "normalized_keyword": doc.get('normalized_keyword', 0),
                    "normalized_semantic": doc.get('normalized_semantic', 0)
                }
                for doc in search_results.get('semantic_search_results', [])[:5]  # Top 5 results
            ]
        }
        
        results_file = os.path.join(debug_dir, 'enhanced_search_subq_1.json')
        print(f"\n💾 Saving detailed results to: {results_file}")
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(detailed_results, f, ensure_ascii=False, indent=2)
        print("✅ Detailed results saved successfully")
        
        # Create metrics debug
        metrics_info = {
            'totals': {
                'total_docs': len(search_results.get("semantic_search_results", [])),
                'unique_docs': len(set(doc.get('chunk_id') for doc in search_results.get("semantic_search_results", [])))
            }
        }
        search_service_single.debug_service.create_metrics_debug_file(metrics_info)

        # Now update status to processing results
        status["current_step"] = "Processing results..."
        status["progress"] = 80
        await store_status(response["question_id"], status)

        # Generate response using response service
        print("\n🤖 Generating response...")
        bot_response = await response_service.generate_response(
            search_results=search_results.get('semantic_search_results', []),
            question=question.question
        )
        print("\n✨ Generated response:", bot_response)

        # Step 6: Update final status
        status["status"] = "completed"
        status["current_step"] = "Done"
        status["progress"] = 100
        await store_status(response["question_id"], status)

        # Step 7: Return organized response
        return {
            # Metadata section
            "status": response["status"],
            "question_id": response["question_id"],
            "user_id": response["user_id"],
            "question": response["question"],
            "alpha_used": alpha if alpha is not None else search_service_single.default_alpha,
            "search_method": actual_search_method,
            "requested_method": search_method,
            "keywords_found": detected_keywords if detected_keywords else [],
            
            # Results section
            "results": search_results,
            
            # Response section
            "response": bot_response
        }
        
    except Exception as e:
        # Update status on error
        status["status"] = "error"
        status["current_step"] = f"Error: {str(e)}"
        status["progress"] = 0
        await store_status(response["question_id"], status)
        raise


@router.post("/ask_single/stream")
async def ask_single_question_stream(
    question: Question, 
    alpha: Optional[float] = Query(None, description="Weight for keyword scores (0 to 1)"),
    search_method: Optional[Literal["hybrid", "hybrid_filtered", "auto"]] = Query("auto", description="Search method to use")
):
    """Process a single question and stream the response."""

    # Step 1: Save the question
    response = save_question(question)

    # Step 2: Create initial status
    status = {
        "status": "processing",
        "current_step": "Improving question...",
        "progress": 0,
        "question_id": response["question_id"]
    }

    await store_status(response["question_id"], status)

    async def generate():
        try:
            # Step 3: Detect keywords (🔴 Removing debug messages from stream)
            detected_keywords = detect_keywords(question.question)

            # Select search method
            if search_method == "auto":
                actual_search_method = "hybrid_filtered" if detected_keywords else "hybrid"
            else:
                actual_search_method = search_method

            # Step 4: Perform search
            if actual_search_method == "hybrid_filtered":
                if not detected_keywords:
                    search_results = search_service_single.hybrid_search(
                        question=question.question,
                        alpha=alpha
                    )
                else:
                    search_results = search_service_single.hybrid_search_with_keywords(
                        question=question.question,
                        keywords=detected_keywords,
                        alpha=alpha,
                        variations=[question.question]
                    )
            else:  # Hybrid
                search_results = search_service_single.hybrid_search(
                    question=question.question,
                    alpha=alpha
                )

            # Step 5: Generate response in streaming mode with OpenAI
            async for chunk in response_service.generate_streaming_response(
                search_results=search_results.get("semantic_search_results", []),
                question=question.question
            ):
                yield chunk  # 🔥 Only return the LLM-generated response

            # Step 6: Update final status
            status["status"] = "completed"
            status["current_step"] = "Done"
            status["progress"] = 100
            await store_status(response["question_id"], status)

        except Exception as e:
            status["status"] = "error"
            status["current_step"] = f"Error: {str(e)}"
            status["progress"] = 0
            await store_status(response["question_id"], status)
            yield f"\n❌ Error: {str(e)}\n"

    return StreamingResponse(generate(), media_type="text/event-stream")



@router.get("/health")
async def health_check():
    """
    Health check endpoint to verify API is running and frontend can connect
    """
    global connection_counter
    connection_counter += 1
    
    return {
        "status": "ok", 
        "message": "Backend API is running",
        "checks": connection_counter
    }

@router.post("/search/enhanced")
async def enhanced_search_endpoint(question: dict):
    """Process a question using enhanced search capabilities"""
    try:
        # Process the question and generate search results
        debug_dir = "debug"  # Directorio relativo al directorio actual
        results = await enhanced_search(
            question=question["question"],
            debug_dir=debug_dir
        )
        return {"success": True, "results": results}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/response/generate")
async def generate_response(data: dict):
    """Generate a response based on search results"""
    try:
        # Get the search results from the request
        search_results = data.get("results", {})
        if not search_results or not isinstance(search_results, dict):
            raise ValueError("Invalid search results format")

        # Los resultados vienen en search_results["results"][0]["results"]
        results = search_results["results"][0]["results"]
        question = search_results["results"][0]["question"]

        # Generate response using the response service
        response = await response_service.generate_response(
            search_results=results,
            question=question
        )
        
        return {
            "success": True,
            "response": response
        }
    except Exception as e:
        print(f"❌ Error generating response: {str(e)}")
        return {"success": False, "error": str(e)}

# Add new endpoint to get status
@router.get("/status/{question_id}")
async def get_question_status(question_id: str):
    """Get the current status of a question being processed."""
    return await get_status(question_id)

@router.post("/ask_multi")
async def ask_multi_question(
    background_tasks: BackgroundTasks,
    question: Question,
    alpha: Optional[float] = Query(None, description="Weight for keyword scores (0 to 1)")
):
    """Process a question that might contain multiple sub-questions."""
    
    logger.info(f"\n📝 Processing multi-question: {question.question}")
    
    # Step 1: Store question and get response object
    response = save_question(question)
    
    # Create initial status
    status = {
        "status": "processing",
        "current_step": "Processing multi-question...",
        "progress": 0,
        "question_id": response["question_id"]
    }
    
    await store_status(response["question_id"], status)
    
    try:
        # Update status for question processing
        status["progress"] = 25
        status["current_step"] = "Processing questions..."
        await store_status(response["question_id"], status)
        
        # Process question to get subquestions
        parsed_question = await process_question(question.question)
        logger.info(f"\n🔍 Parsed into {parsed_question['number_of_subquestions']} subquestions")
        
        # Update status for search
        status["progress"] = 50
        status["current_step"] = "Searching for answers..."
        await store_status(response["question_id"], status)
        
        # Perform search for each subquestion
        search_results = {}
        for i in range(parsed_question["number_of_subquestions"]):
            sub_question_key = f"subquestion{i+1}"
            variations_key = f"variations_subquestion{i+1}"
            
            if sub_question_key in parsed_question and variations_key in parsed_question:
                # Get the subquestion and its variations
                current_question = parsed_question[sub_question_key]
                variations = parsed_question[variations_key]
                
                logger.info(f"\n🔍 Searching for: {current_question}")
                
                # Perform hybrid search with all variations
                results = search_service_single.hybrid_search(
                    question=current_question,
                    alpha=alpha
                )
                
                search_results[f"results_{sub_question_key}"] = results
        
        # Update status for completion
        status["progress"] = 100
        status["current_step"] = "Completed"
        status["status"] = "completed"
        await store_status(response["question_id"], status)
        
        # Return results
        result = {
            "question_id": response["question_id"],
            "original_question": question.question,
            "status": "completed",
            "parsed_result": parsed_question,
            "search_results": search_results,
            "alpha": alpha
        }
        
        logger.info("\n✅ Multi-question processing completed")
        return result
        
    except Exception as e:
        logger.error(f"\n❌ Error processing multi-question: {str(e)}")
        logger.exception(e)
        status["status"] = "error"
        status["error"] = str(e)
        await store_status(response["question_id"], status)
        raise HTTPException(status_code=500, detail=str(e))
