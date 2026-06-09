from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.category import CategoryRead


class PostBase(BaseModel):
    title: str = Field(..., min_length=5)
    summary: str | None = None
    body: str = Field(..., min_length=20)
    category_id: int | None = None
    tags: list[str] = []
    state: str = Field("draft", pattern=r"^(draft|published)$")


class PostCreate(PostBase):
    pass


class PostUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    body: str | None = None
    category_id: int | None = None
    tags: list[str] | None = None
    state: str | None = Field(None, pattern=r"^(draft|published)$")


class PostAuthor(BaseModel):
    username: str
    bio: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PostResponse(BaseModel):
    id: int
    title: str
    summary: str | None = None
    body: str
    slug: str
    state: str
    word_count: int
    read_time: int
    author: PostAuthor
    category: CategoryRead | None = None
    tags: list[str] = []
    like_count: int = 0
    bookmark_count: int = 0
    comment_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedPosts(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PostResponse]
