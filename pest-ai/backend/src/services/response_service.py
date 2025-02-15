import logging
import json
import os
from typing import Dict, List, Any, Generator, Union
from openai import AsyncOpenAI
import google.generativeai as genai
from google.genai import types
import sys
from datetime import datetime
from typing import List, Dict
from loguru import logger
from config.prompts import (
    RESPONSE_SYSTEM_PROMPT, 
    RESPONSE_USER_PROMPT,
    SYNTHESIS_PROMPT_TEMPLATE,
    INTERMEDIATE_QUESTION_TEMPLATE
)
import asyncio


# Configure logging
#logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Read API key directly from environment
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
logger.info(f"Direct check - OPENAI_API_KEY exists: {bool(OPENAI_API_KEY)}")

class ResponseService:
    """Service for generating responses using OpenAI's API directly"""
    
    def __init__(self):
        """Initialize the response service"""
        self.model = "gpt-4-turbo-preview"  # Using GPT-4 Turbo for better responses
        self.openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        self.is_keyword_search = False
        

    def prepare_response_messages(self, query: str, context: str, keywords: List[str] = None) -> List[Dict[str, str]]:
        """Prepare messages for response generation"""
        # Format keywords section
        keywords_section = f"🔑 Keywords: {', '.join(keywords)}\n\n" if keywords else ""
        
        # Construct the user message
        user_message = RESPONSE_USER_PROMPT.format(
            query=query,
            keywords_section=keywords_section,
            context=context
        )
        
        return [
            {"role": "system", "content": RESPONSE_SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ]
    
    def get_llm_response(self, messages: List[Dict[str, str]], stream: bool = False) -> Union[Dict, Generator]:
        """Get LLM response using provided messages"""
        try:
            if stream:
                return self.stream_response(messages)
            
            response = self.openai_client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
                stream=False
            )
            return {
                "content": response.choices[0].message.content,
                "finish_reason": response.choices[0].finish_reason,
                "messages": messages
            }
        except Exception as e:
            logger.error(f"Error getting LLM response: {e}")
            return {"error": str(e)}
    
    def stream_response(self, messages: List[Dict[str, str]]) -> Dict:
        """Stream GPT-4 response and return both content and exact messages sent"""
        try:
            stream = self.openai_client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True
            )
            
            content = ""
           
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    content += chunk.choices[0].delta.content
                    print(chunk.choices[0].delta.content, end="", flush=True)
            print("\n\n✅ Response Complete!\n")
           
            
            return {
                'content': content,
                'messages': messages
            }
            
        except Exception as e:
            logger.error(f"Error streaming response: {e}")
            return {"error": str(e)}
  
    def format_results(self, results: List[Dict]) -> str:
        """Format results with essential metadata"""
        formatted = []
        for result in results[:5]:  # Top 5 only
            formatted.append(
                f"File: {result['file_name']}\n"
                f"Section: {result['header']}\n\n"
                f"Content:\n```\n{result['content']}\n```\n\n"
                f"Context:\n"
                f"- Previous: {result['summary_prev']}\n"
                f"- Next: {result['summary_next']}\n\n"
                f"Related Topics: {', '.join(result['keywords'])}\n"
            )
        return "\n---\n".join(formatted)

    def save_prompt_to_file(self, messages: List[Dict[str, str]], debug_dir: str, prefix: str) -> None:
        """Save the complete prompt and context to a markdown file with timestamp"""
        try:
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            
            content = []
            content.append(f"# {prefix.upper()} Prompt - {timestamp}\n")
            
            for msg in messages:
                content.append(f"## {msg['role'].upper()}")
                content.append("```")
                content.append(msg['content'])
                content.append("```\n")

            # Save to file with timestamp
            filename = os.path.join(debug_dir, f"{timestamp}_{prefix}_prompt.md")
            with open(filename, 'w', encoding='utf-8') as f:
                f.write("\n".join(content))
            print(f"Saved prompt to: {filename}")
        except Exception as e:
            logger.error(f"Error saving prompt to file: {e}")

    async def generate_response(self, search_results: List[Dict], question: str):
        """Generate a streaming response using OpenAI."""
        try:
            logger.info("🤖 Generating response for question: %s", question)

            # Formatear contexto
            context = self._format_context(search_results)
            print("\n📝 Formatted context:")
            print(context)

            # Crear mensajes
            messages = [
                {"role": "system", "content": RESPONSE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"}
            ]

            # Llamada a OpenAI con streaming activado
            response_stream = await self.openai_client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=2000,
                stream=True  
            )

            # Procesar la respuesta en streaming
            collected_text = ""
            async for chunk in response_stream:  
                if hasattr(chunk, "choices") and chunk.choices:
                    delta = chunk.choices[0].delta  
                    if hasattr(delta, "content") and delta.content:
                        collected_text += delta.content
                        print(delta.content, end="", flush=True) 

            print("\n✨ OpenAI response (streamed):")
            print(collected_text)

            # Guardar el prompt para depuración
            debug_dir = "debug"
            os.makedirs(debug_dir, exist_ok=True)
            self.save_prompt_to_file(messages, debug_dir, "response")

            return collected_text  # Devuelve la respuesta completa

        except Exception as e:
            logger.error("❌ Error generating response: %s", str(e))
            raise


    async def stream_response(self, search_results: List[Dict], question: str):
        """Generate a streaming response based on search results using OpenAI."""
        try:
            logger.info("🤖 Generating streaming response for question: %s", question)
            
            # Format context from results
            context = self._format_context(search_results)
            
            # Generate response using OpenAI with streaming
            messages = [
                {"role": "system", "content": RESPONSE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"}
            ]
            
            # Use OpenAI to generate response
            response = await self.openai_client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=8000,
                stream=True
            )
            
            # Process the streaming response
            async for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
            
            # Save prompt for debugging
            debug_dir = "debug"
            os.makedirs(debug_dir, exist_ok=True)
            self.save_prompt_to_file(messages, debug_dir, "response")
            
        except Exception as e:
            logger.error("❌ Error generating streaming response: %s", str(e))
            raise


    async def generate_streaming_response(self, search_results: List[Dict], question: str):
        """Generate a streaming response from OpenAI."""
        try:
            
                # Save debug info first
            debug_file = self.save_stream_debug(search_results, question)
            print(f"🔍 Debug info saved to: {debug_file}")
            
            messages = [
                {"role": "system", "content": RESPONSE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Context:\n{self._format_context(search_results)}\n\nQuestion: {question}\n\nAnswer:"}
            ]

            response_stream = await self.openai_client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=500,
                stream=True
            )

            async for chunk in response_stream:
                if hasattr(chunk, "choices") and chunk.choices:
                    delta = chunk.choices[0].delta
                    if hasattr(delta, "content") and delta.content:
                        yield delta.content  # 🔹 Enviar fragmento en el stream

        except Exception as e:
            yield f"\nError: {str(e)}"

    def _format_context(self, search_results: List[Dict]) -> str:
        """Send complete search results to LLM including all metadata"""
        return json.dumps(search_results, indent=2, ensure_ascii=False)
    
    def save_stream_debug(self, markdown_contents: str, question: str, debug_dir: str = "debug/stream") -> str:
        """Save debug information including raw markdown files and prompts"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        os.makedirs(debug_dir, exist_ok=True)
        
        content = []
        content.append(f"# Stream Debug - {timestamp}\n")
        
        # Raw question
        content.append("# Original Question")
        content.append("```")
        content.append(str(question))
        content.append("```\n")
        
        # Markdown content
        content.append("# Context Content")
        content.append("```markdown")
        content.append(markdown_contents)
        content.append("```\n")
        
        # System Prompt
        content.append("# System Prompt")
        content.append("```")
        content.append(RESPONSE_SYSTEM_PROMPT)
        content.append("```\n")

        # Full User Message
        content.append("# Full User Message")
        content.append("```")
        content.append(RESPONSE_USER_PROMPT.format(
            query=question,
            context=markdown_contents
        ))
        content.append("```\n")

        # Complete Messages Array
        content.append("# Complete Messages Array")
        content.append("```json")
        messages = [
            {"role": "system", "content": RESPONSE_SYSTEM_PROMPT},
            {"role": "user", "content": RESPONSE_USER_PROMPT.format(
                query=question,
                context=markdown_contents
            )}
        ]
        content.append(json.dumps(messages, indent=2, ensure_ascii=False))
        content.append("```")
        
        # Save to file
        filename = os.path.join(debug_dir, f"stream_debug_{timestamp}.md")
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("\n".join(content))
        
        print(f"\n📝 Raw stream debug saved to: {filename}")
        return filename

    async def generate_streaming_response_multi_rerank(self, markdown_files: List[str], question: str, subquestions: List[str]):
        """Generate a streaming response using markdown files as context."""
        try:
            
            #TODO: Remove this
            # Setup debug directory for raw LLM output
            # debug_dir = "debug/stream/llm_raw"
            # os.makedirs(debug_dir, exist_ok=True)
            # timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            # raw_output_file = os.path.join(debug_dir, f"llm_raw_{timestamp}.txt")
            
            # Lista para acumular respuestas
            all_responses = []
            all_contexts = []
            
            # # Initial separator
            # yield "\n\n"
            # yield "=" * 80 + "\n"
            # yield "🔍 Starting Multi-Question Analysis\n"
            # yield "=" * 80 + "\n\n"
            
            # Process each subquestion independently
            for idx, (md_file, subquestion) in enumerate(zip(markdown_files, subquestions), 1):
                print(f"\n🔍 Processing subquestion {idx} of {len(subquestions)}...")
                print(f"Subquestion: {subquestion}")
                
                # Add separator between responses
                if idx > 1:
                    yield "\n\n"
                    yield "=" * 80 + "\n"
                    yield f"Moving to Question {idx} of {len(subquestions)}\n"
                    yield "=" * 80 + "\n\n"
                
                # # Add subquestion header with visual elements
                # yield f"🔹 Question {idx}/{len(subquestions)}: {subquestion}\n"
                # yield "=" * 80 + "\n\n"
                
                # Read markdown file content
                if not os.path.exists(md_file):
                    print(f"❌ File does not exist: {md_file}")
                    continue
                    
                print(f"✅ Reading markdown file: {md_file}")
                with open(md_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    all_contexts.append(content)
                
                #TODO: Remove this    
                # Save debug info for this subquestion
                debug_dir = f"debug/stream/subq_{idx}"
                debug_file = self.save_stream_debug(
                    content, 
                    subquestion,
                    debug_dir=debug_dir
                )
                print(f"📝 Debug info saved to: {debug_file}")
                
                # Always use INTERMEDIATE_QUESTION_TEMPLATE for consistent detailed structure
                messages = [
                    {"role": "system", "content": RESPONSE_SYSTEM_PROMPT},
                    {"role": "user", "content": INTERMEDIATE_QUESTION_TEMPLATE.format(
                        question_number=idx,
                        total_questions=len(subquestions),
                        question=subquestion,
                        context=content
                    )}
                ]
                
                # Generate response for this subquestion
                print(f"🤖 Generating response for subquestion {idx}...")
                response_stream = await self.openai_client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=4000,
                    stream=True
                )
                
                # Stream response for this subquestion
                subq_content = []
                async for chunk in response_stream:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        subq_content.append(content)
                        yield content
                
                # Collect response for synthesis
                all_responses.append({
                    "question": subquestion,
                    "response": "".join(subq_content)
                })
                
                # # Delete the markdown file after we're done with it
                # try:
                #     os.remove(md_file)
                #     print(f"🗑️ Deleted markdown file: {md_file}")
                # except Exception as e:
                #     print(f"⚠️ Warning: Could not delete file {md_file}: {str(e)}")
                    
                # print(f"✅ Completed response for subquestion {idx}")
            
            # Add final synthesis if there are multiple questions
            if len(subquestions) > 1:
                # yield "\n\n"
                # yield "=" * 80 + "\n"
                # yield "🔄 Generating Final Synthesis\n"
                # yield "=" * 80 + "\n\n"
                
                # Prepare synthesis prompt
                synthesis_prompt = f"""
Based on all the previous responses and context, please provide a comprehensive synthesis that:

1. Identifies key relationships and connections between the topics discussed
2. Highlights common patterns or principles across all questions
3. Summarizes the main findings for each topic
4. Explains how these concepts work together in the system

Original Question: {question}

Previous Responses:
{json.dumps(all_responses, indent=2)}

All Available Context:
{json.dumps(all_contexts, indent=2)}

Please structure your synthesis as follows:

1. Key Relationships and Connections
2. Common Patterns and Principles
3. Summary of Main Findings
4. System Integration
5. Final Insights
"""
                
                # Generate synthesis
                synthesis_messages = [
                    {"role": "system", "content": RESPONSE_SYSTEM_PROMPT},
                    {"role": "user", "content": synthesis_prompt}
                ]
                
                print("🤖 Generating final synthesis...")
                synthesis_stream = await self.openai_client.chat.completions.create(
                    model=self.model,
                    messages=synthesis_messages,
                    temperature=0.3,
                    max_tokens=4000,
                    stream=True
                )
                
                # Stream synthesis response
                async for chunk in synthesis_stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            
                
        except Exception as e:
            logger.error(f"Error in generate_streaming_response_multi_rerank: {str(e)}", exc_info=True)
            yield f"\nError: {str(e)}"



    async def generate_streaming_response_multi_rerank_geminy(self, markdown_files: List[str], question: str, subquestions: List[str]):
        """Generate a streaming response using markdown files as context with Gemini."""
        try:
            # Initialize Gemini client
            client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
            
            # Lista para acumular respuestas
            all_responses = []
            all_contexts = []
            
            # Process each subquestion independently
            for idx, (md_file, subquestion) in enumerate(zip(markdown_files, subquestions), 1):
                print(f"\n🔍 Processing subquestion {idx} of {len(subquestions)}...")
                print(f"Subquestion: {subquestion}")
                
                # Add separator between responses
                if idx > 1:
                    yield "\n\n"
                    yield "=" * 80 + "\n"
                    yield f"Moving to Question {idx} of {len(subquestions)}\n"
                    yield "=" * 80 + "\n\n"
                
                # Read markdown file content
                if not os.path.exists(md_file):
                    print(f"❌ File does not exist: {md_file}")
                    continue
                    
                print(f"✅ Reading markdown file: {md_file}")
                with open(md_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    all_contexts.append(content)
                
                # Save debug info for this subquestion
                debug_dir = f"debug/stream/subq_{idx}"
                debug_file = self.save_stream_debug(
                    content, 
                    subquestion,
                    debug_dir=debug_dir
                )
                print(f"📝 Debug info saved to: {debug_file}")
                
                # Prepare prompt for Gemini
                prompt = INTERMEDIATE_QUESTION_TEMPLATE.format(
                    question_number=idx,
                    total_questions=len(subquestions),
                    question=subquestion,
                    context=content
                )
                
                # Generate response using Gemini with configuration
                print(f"🤖 Generating response for subquestion {idx} with Gemini...")
                try:
                    response = client.models.generate_content_stream(
                        model="gemini-2.0-flash",
                        contents=[prompt],
                        config=types.GenerateContentConfig(
                            max_output_tokens=4000,  # Similar to OpenAI's max_tokens
                            temperature=0.1  # Low temperature for more focused responses
                        )
                    )
                    
                    # Stream response for this subquestion
                    subq_content = []
                    for chunk in response:
                        if hasattr(chunk, "text"):
                            content = chunk.text
                            subq_content.append(content)
                            yield content
                    
                    # Collect response for synthesis
                    all_responses.append({
                        "question": subquestion,
                        "response": "".join(subq_content)
                    })
                    
                except Exception as e:
                    print(f"⚠️ Error generating Gemini response: {str(e)}")
                    yield f"\nError generating response: {str(e)}"
                    continue
                
                # Delete the markdown file after we're done with it
                try:
                    os.remove(md_file)
                    print(f"🗑️ Deleted markdown file: {md_file}")
                except Exception as e:
                    print(f"⚠️ Warning: Could not delete file {md_file}: {str(e)}")
                
                print(f"✅ Completed response for subquestion {idx}")
            
            # Add final synthesis if there are multiple questions
            if len(subquestions) > 1:
                # Prepare synthesis prompt
                synthesis_prompt = f"""
Based on all the previous responses and context, please provide a comprehensive synthesis that:

1. Identifies key relationships and connections between the topics discussed
2. Highlights common patterns or principles across all questions
3. Summarizes the main findings for each topic
4. Explains how these concepts work together in the system

Original Question: {question}

Previous Responses:
{json.dumps(all_responses, indent=2)}

All Available Context:
{json.dumps(all_contexts, indent=2)}

Please structure your synthesis as follows:

1. Key Relationships and Connections
2. Common Patterns and Principles
3. Summary of Main Findings
4. System Integration
5. Final Insights
"""
                
                print("🤖 Generating final synthesis with Gemini...")
                try:
                    synthesis_response = client.models.generate_content_stream(
                        model="gemini-2.0-flash",
                        contents=[synthesis_prompt],
                        config=types.GenerateContentConfig(
                            max_output_tokens=4000,
                            temperature=0.3  # Slightly higher temperature for synthesis
                        )
                    )
                    
                    # Stream synthesis response
                    for chunk in synthesis_response:
                        if hasattr(chunk, "text"):
                            yield chunk.text
                            
                except Exception as e:
                    print(f"⚠️ Error generating synthesis: {str(e)}")
                    yield f"\nError generating synthesis: {str(e)}"
                
        except Exception as e:
            logger.error(f"Error in generate_streaming_response_multi_rerank_geminy: {str(e)}", exc_info=True)
            yield f"\nError: {str(e)}"

    async def stream_gemini(self, message: str, context: str = None):
        """Stream the response from Gemini API character by character with delay.
        
        Args:
            message (str): The user's question
            context (str, optional): Additional context for the response
            
        Yields:
            str: Characters from the response with delay
        """
        try:
            # Configure Gemini
            genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-2.0-flash')
            
            # Prepare prompt with template
            prompt = INTERMEDIATE_QUESTION_TEMPLATE.format(
                question_number=1,
                total_questions=1,
                question=message,
                context=context or ""
            )
            
            # Generate streaming response with temperature 0.1
            response = model.generate_content(
                prompt, 
                stream=True,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,  # Reduced temperature for more focused responses
                    max_output_tokens=8000
                )
            )
            
            # Stream each chunk's text character by character
            for chunk in response:
                if chunk.text:
                    for char in chunk.text:
                        yield char
                        # Add a small delay between characters
                        await asyncio.sleep(0.00001)
                        
        except Exception as e:
            logger.error(f"Error in stream_gemini: {str(e)}", exc_info=True)
            yield f"\nError: {str(e)}"


