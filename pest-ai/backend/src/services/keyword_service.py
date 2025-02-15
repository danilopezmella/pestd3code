import logging
from utils.csv_loader import load_keywords
import re
import os

# Configure logging
logger = logging.getLogger(__name__)

# Try to load keywords, but handle missing file gracefully
try:
    logger.info("Loading keywords from CSV file...")
    keywords_path = os.path.join(os.path.dirname(__file__), "..", "data", "keywords.csv")
    KEYWORDS = load_keywords(keywords_path)
    logger.info(f"Loaded {len(KEYWORDS)} keywords")
except FileNotFoundError:
    logger.warning("Keywords file not found. Using empty keywords list.")
    KEYWORDS = []
except Exception as e:
    logger.error(f"Error loading keywords: {str(e)}")
    KEYWORDS = []

def detect_keywords(question: str):
    """Detects keywords in the question using a hierarchical approach.
    
    1. First looks for complete keywords
    2. Only looks for subkeywords if no complete keywords are found
    3. Never decomposes a keyword that was already found
    """
    logger.debug(f"Detecting keywords in question: {question}")
    
    if not KEYWORDS:
        logger.debug("No keywords available for detection")
        return []
        
    question_lower = question.lower()
    logger.debug(f"Lowercased question: {question_lower}")
    
    # Sort keywords by length (descending) to prioritize longer/more specific keywords
    sorted_keywords = sorted(KEYWORDS, key=len, reverse=True)
    
    # First pass: look for complete keywords
    found_keywords = []
    matched_positions = set()  # Track positions of matched keywords
    
    for kw in sorted_keywords:
        kw_lower = kw.lower()
        # Find all occurrences of the keyword
        for match in re.finditer(r'\b' + re.escape(kw_lower) + r'\b', question_lower):
            start, end = match.span()
            # Check if this position overlaps with any existing match
            if not any(start < p[1] and end > p[0] for p in matched_positions):
                found_keywords.append(kw)
                matched_positions.add((start, end))
                logger.debug(f"Found complete keyword: {kw}")
    
    # If no complete keywords found, try subkeywords
    if not found_keywords:
        logger.debug("No complete keywords found, looking for subkeywords")
        # Split potential compound keywords
        words = re.findall(r'\b\w+\b', question_lower)
        for word in words:
            for kw in sorted_keywords:
                kw_lower = kw.lower()
                if word == kw_lower and kw not in found_keywords:
                    found_keywords.append(kw)
                    logger.debug(f"Found subkeyword: {kw}")
    
    logger.info(f"Found {len(found_keywords)} keywords: {found_keywords}")
    return found_keywords
