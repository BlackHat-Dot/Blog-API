from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: int
    email: EmailStr
    username: str
    bio: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Profile(BaseModel):
    username: str
    bio: str | None = None
    post_count: int
    follower_count: int
    following_count: int
    is_following: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
