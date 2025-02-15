import os
import logging
import asyncio
from pydantic_ai import Agent
from pydantic import BaseModel

# Configure logging
logger = logging.getLogger(__name__)

# Read API key directly from environment
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
logger.info(f"Direct check - OPENAI_API_KEY exists: {bool(OPENAI_API_KEY)}")

# Verify API key
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY environment variable is not set!")
    raise ValueError(
        "OPENAI_API_KEY environment variable is required. "
        "Please set it in your environment or .env file"
    )

class QuestionProcessingResult(BaseModel):
    number_of_subquestions: int
    improved_sub_questions: list[str]
    variations: list[list[str]]

# Define Pydantic AI agent
question_processing_agent = Agent(
    "openai:gpt-4-turbo",
    result_type=QuestionProcessingResult,
    system_prompt=(
        "You are an AI assistant that processes user questions. "
        "Follow these steps EXACTLY for EVERY question:"
        "1. First, identify if there are multiple sub-questions and split them."
        "2. For EACH question or sub-question:"
        "   a. Keep ALL non-common words EXACTLY as they appear in the original question"
        "   b. Do not add articles (a, an, the) to terms from the original question"
        "   c. Preserve the exact case and format of all terms"
        "   d. Generate variations only by modifying the question structure, not the terms"
        "3. Never return fewer than 5 variations per question"
        "4. Treat single questions and sub-questions exactly the same way"
        "5. Only modify common words (what, is, are, how, etc.)"
        "\nExample:"
        "Original: 'what is pest?' ->"
        "Correct variations: ["
        "  'what is pest?',"
        "  'explain what pest is',"
        "  'describe pest',"
        "  'tell me about pest',"
        "  'define pest'"
        "]"
        "\nIncorrect variations: ["
        "  'what is a pest?' (added article),"
        "  'what is PEST?' (changed case),"
        "  'what is the pest system?' (added words to term)"
        "]"
    )
)

async def process_question(question: str):
    """
    Process a user question by improving clarity, splitting sub-questions if necessary,
    and generating variations. Implements retries and timeout to prevent blocking.
    """
    max_retries = 2
    timeout_seconds = 60  # Maximum wait time for each call

    for attempt in range(max_retries):
        try:
            logger.info(f"Processing question: {question}")
            logger.debug(f"Attempt {attempt + 1} to process question")
            
            # Execute agent call with timeout to prevent hanging
            result = await asyncio.wait_for(
                question_processing_agent.run(question),
                timeout=timeout_seconds
            )
            
            # Log raw result
            logger.debug(f"Raw AI result: {result.data}")
            
            # Ensure consistent output structure
            improved_sub_questions = result.data.improved_sub_questions or [question]
            logger.info(f"Improved sub-questions: {improved_sub_questions}")
            
            # Validate variations for each sub-question
            if not result.data.variations or any(len(v) < 5 for v in result.data.variations):
                logger.warning("Missing or insufficient variations, attempting to retry...")
                if attempt < max_retries - 1:
                    continue  # Retry if not at max attempts
                
                # If after retries still no valid variations, generate basic ones
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

            # Prepare final response
            response = {
                "number_of_subquestions": len(improved_sub_questions),
                **{
                    f"subquestion{i+1}": improved_sub_questions[i] for i in range(len(improved_sub_questions))
                },
                **{
                    f"variations_subquestion{i+1}": variations[i][:5] for i in range(len(improved_sub_questions))
                }
            }
            
            logger.info(f"Final response: {response}")
            return response

        except asyncio.TimeoutError:
            logger.error(f"Attempt {attempt + 1} timed out after {timeout_seconds} seconds.", exc_info=True)
            if attempt == max_retries - 1:
                break  # If timeout on last attempt, proceed to fallback response
        except Exception as e:
            logger.error(f"Attempt {attempt + 1} failed: {str(e)}", exc_info=True)
            if attempt == max_retries - 1:
                break

    # Fallback response in case of error after retries
    fallback = {
        "number_of_subquestions": 1,
        "subquestion1": question,
        "variations_subquestion1": [
            question,  # Original
            f"Could you explain {question.lower().strip('?')}?",
            f"What is the meaning of {question.lower().strip('?')}?",
            f"Please describe {question.lower().strip('?')}.",
            f"I would like to understand {question.lower().strip('?')}."
        ]
    }
    logger.info(f"Returning fallback response: {fallback}")
    return fallback

# Example usage (if running in async environment)
if __name__ == "__main__":
    import asyncio

    async def main():
        sample_question = "What is the impact of climate change on polar bears?"
        result = await process_question(sample_question)
        print(result)

    asyncio.run(main())
