from src.db.queries import insert_question
from src.models.question import Question

def save_question(question_data: Question):
    """Handles the logic to validate and save a question into the database."""
    return insert_question(question_data.user_id, question_data.question)
