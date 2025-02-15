from db.queries import insert_question
from models.question import Question
from fastapi import HTTPException

def save_question(question_data: Question):
    """Handles the logic to validate and save a question into the database."""
    try:
        # Validación básica
        if not question_data.user_id or not question_data.question:
            raise ValueError("Both user_id and question are required")

        # Intentar guardar la pregunta
        result = insert_question(
            user_id=question_data.user_id,
            question=question_data.question
        )

        # Verificar si hubo error en la inserción
        if "error" in result:
            raise HTTPException(
                status_code=500,
                detail=f"Database error: {result['error']}"
            )

        return result

    except ValueError as ve:
        raise HTTPException(
            status_code=400,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )
