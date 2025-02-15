import os
import logging
from pydantic_ai import Agent
from dotenv import load_dotenv
from pydantic import BaseModel
from src.services.keyword_service import detect_keywords

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")  # Ensure the API key is set

class QuestionProcessingResult(BaseModel):
    number_of_subquestions: int
    improved_sub_questions: list[str]
    variations: list[list[str]]
    keywords_found: list[list[str]]

# Define Pydantic AI agent
question_processing_agent = Agent(
    "openai:gpt-4",
    result_type=QuestionProcessingResult,
    system_prompt=(
       "You are an AI assistant that processes user questions. "
        "Follow these steps EXACTLY for EVERY question:"
        "1. First, identify if there are multiple sub-questions and split them."
        "2. For EACH question or sub-question, you MUST:"
        "   a. Improve its clarity while keeping the original meaning"
        "   b. Generate EXACTLY 5 distinct variations that ask the same thing differently"
        "3. Never return fewer than 5 variations per question"
        "4. Treat single questions and sub-questions exactly the same way"
        "5. Do NOT assume any domain knowledge or context"
        "6. Only fix grammar and wording, keep the original meaning intact"
        "7. IMPORTANT: Preserve technical terms exactly as they appear (e.g. NUMLAM, ICOR, etc)"
        "\nExample format:"
        "Single question: 'what is X?' ->"
        "variations: ["
        "  'What is the meaning of X?',"
        "  'Could you explain what X is?',"
        "  'What does X refer to?',"
        "  'Can you describe what X is?',"
        "  'Please explain what X means'"
        "]"
    )
)

async def process_question(question: str):
    """Processes a user question by improving clarity, splitting sub-questions if needed, and generating variations."""
    try:
        logger.info(f"Processing question: {question}")
        
        # Call the AI model with retries
        max_retries = 2
        for attempt in range(max_retries):
            try:
                logger.debug(f"Attempt {attempt + 1} to process question")
                result = await question_processing_agent.run(question)
                
                # Log the raw result
                logger.debug(f"Raw AI result: {result.data}")
                
                # Ensure a consistent output structure with variations
                improved_sub_questions = result.data.improved_sub_questions or [question]
                logger.info(f"Improved sub-questions: {improved_sub_questions}")
                
                # Make sure we have variations for each sub-question
                if not result.data.variations or any(len(v) < 5 for v in result.data.variations):
                    logger.warning("Missing or insufficient variations, generating basic ones")
                    if attempt < max_retries - 1:
                        continue
                    
                    # If still no variations, generate basic ones
                    variations = []
                    for q in improved_sub_questions:
                        basic_variations = [
                            q,  # Original
                            f"Could you explain {q.lower().strip('?')}?",  # Polite form
                            f"What is the meaning of {q.lower().strip('?')}?",  # Definition form
                            f"Please describe {q.lower().strip('?')}.",  # Request form
                            f"I would like to understand {q.lower().strip('?')}."  # Statement form
                        ]
                        variations.append(basic_variations)
                else:
                    variations = result.data.variations
                
                logger.debug(f"Generated variations: {variations}")

                # Log before keyword detection
                logger.info("Starting keyword detection for each sub-question")
                keywords_found = []
                for i, sub in enumerate(improved_sub_questions):
                    logger.debug(f"Detecting keywords for sub-question {i+1}: {sub}")
                    sub_keywords = detect_keywords(sub)
                    logger.debug(f"Keywords found for sub-question {i+1}: {sub_keywords}")
                    keywords_found.append(sub_keywords)

                # Prepare final response
                response = {
                    "number_of_subquestions": len(improved_sub_questions),
                    **{
                        f"subquestion{i+1}": improved_sub_questions[i] for i in range(len(improved_sub_questions))
                    },
                    **{
                        f"variations_subquestion{i+1}": variations[i][:5] for i in range(len(improved_sub_questions))
                    },
                    **{
                        f"keywords_found_subquestion{i+1}": keywords_found[i] for i in range(len(improved_sub_questions))
                    }
                }
                
                logger.info(f"Final response: {response}")
                return response

            except Exception as e:
                logger.error(f"Attempt {attempt + 1} failed: {str(e)}", exc_info=True)
                if attempt == max_retries - 1:
                    raise

    except Exception as e:
        logger.error(f"Error processing question: {str(e)}", exc_info=True)
        # Return a graceful fallback response
        fallback = {
            "number_of_subquestions": 1,
            "subquestion1": question,
            "variations_subquestion1": [
                question,  # Original
                f"Could you explain {question.lower().strip('?')}?",
                f"What is the meaning of {question.lower().strip('?')}?",
                f"Please describe {question.lower().strip('?')}.",
                f"I would like to understand {question.lower().strip('?')}."
            ],
            "keywords_found_subquestion1": detect_keywords(question),
            "error": str(e)  # Include error message for debugging
        }
        logger.info(f"Returning fallback response: {fallback}")
        return fallback
