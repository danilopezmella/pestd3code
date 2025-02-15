from pydantic import BaseModel

class Question(BaseModel):
    user_id: str
    question: str
