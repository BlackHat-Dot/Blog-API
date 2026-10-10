from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1)
    parent_id: int | None = None


class CommentAuthor(BaseModel):
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)


class CommentRead(BaseModel):
    id: int
    body: str
    author_id: int
    post_id: int
    parent_id: int | None = None
    created_at: datetime
    author: CommentAuthor | None = None

    @computed_field
    @property
    def author_username(self) -> str | None:
        return self.author.username if self.author else None

    @computed_field
    @property
    def username(self) -> str | None:
        return self.author.username if self.author else None

    model_config = ConfigDict(from_attributes=True)
