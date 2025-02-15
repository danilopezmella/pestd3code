from db.connection import get_db_connection

def insert_question(user_id: str, question: str):
    """Inserts a question into the database and returns the result."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
        INSERT INTO questions (user_id, question, status, created_at)
        VALUES (%s, %s, 'pending', NOW()) RETURNING id;
        """
        cursor.execute(query, (user_id, question))
        question_id = cursor.fetchone()[0]  # Retrieve the inserted question ID
        
        conn.commit()
        cursor.close()
        conn.close()

        return {"status": "saved", "question_id": question_id, "user_id": user_id, "question": question}

    except Exception as e:
        return {"error": str(e)}
