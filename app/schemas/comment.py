from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1)


class CommentRead(BaseModel):
    id: int
    body: str
    author_id: int
    post_id: int
    parent_id: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
