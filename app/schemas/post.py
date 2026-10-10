from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.category import CategoryRead


class PostBase(BaseModel):
    title: str = Field(..., min_length=5, max_length=55)
    summary: str | None = Field(None, max_length=110)
    body: str = Field(..., min_length=20, max_length=100000)
    category_id: int | None = None
    tags: list[str] = Field(default_factory=list, max_length=15)
    state: str = Field("draft", pattern=r"^(draft|published)$")

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, tags_list: list[str]) -> list[str]:
        if tags_list:
            if len(tags_list) > 15:
                raise ValueError("A post can have at most 15 tags")
            for t in tags_list:
                if len(t.strip()) > 15:
                    raise ValueError(f"Tag '{t[:10]}...' exceeds the maximum length of 15 characters")
        return tags_list


class PostCreate(PostBase):
    pass


class PostUpdate(BaseModel):
    title: str | None = Field(None, min_length=5, max_length=55)
    summary: str | None = Field(None, max_length=110)
    body: str | None = Field(None, min_length=20, max_length=100000)
    category_id: int | None = None
    tags: list[str] | None = Field(None, max_length=15)
    state: str | None = Field(None, pattern=r"^(draft|published)$")

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, tags_list: list[str] | None) -> list[str] | None:
        if tags_list is not None:
            if len(tags_list) > 15:
                raise ValueError("A post can have at most 15 tags")
            for t in tags_list:
                if len(t.strip()) > 15:
                    raise ValueError(f"Tag '{t[:10]}...' exceeds the maximum length of 15 characters")
        return tags_list


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
    is_liked: bool = False
    is_bookmarked: bool = False

    model_config = ConfigDict(from_attributes=True)


class PaginatedPosts(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PostResponse]
