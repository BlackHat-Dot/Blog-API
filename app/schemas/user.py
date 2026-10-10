from datetime import datetime

import re
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# Strict Google Gmail username and domain compilation rules:
# 1. Domain must strictly be @gmail.com
# 2. Local part (username before @gmail.com) must be between 6 and 30 characters
# 3. Only alphanumeric characters (a-z, 0-9) and periods (.) are allowed (no underscores, hyphens, plus signs, etc.)
# 4. Cannot begin or end with a period (.)
# 5. Cannot have consecutive periods (..)
GMAIL_USERNAME_ALLOWED_CHARS = re.compile(r"^[a-z0-9.]+$")


def validate_gmail_address(value: str) -> str:
    cleaned = value.strip().lower()
    if not cleaned.endswith("@gmail.com"):
        raise ValueError("Fix email: only @gmail.com addresses are allowed (e.g. yourname@gmail.com)")

    username = cleaned[:-10]
    if len(username) < 6 or len(username) > 30:
        raise ValueError("Fix email: Gmail username must be between 6 and 30 characters long")

    if not GMAIL_USERNAME_ALLOWED_CHARS.match(username):
        raise ValueError("Fix email: Gmail username can only contain letters (a-z), numbers (0-9), and periods (.)")

    if username.startswith(".") or username.endswith("."):
        raise ValueError("Fix email: Gmail username cannot begin or end with a period")

    if ".." in username:
        raise ValueError("Fix email: Gmail username cannot contain consecutive periods (..)")

    return cleaned


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)

    @field_validator("email", mode="before")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        return validate_gmail_address(str(v))


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        return validate_gmail_address(str(v))


class UserUpdate(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=50)
    bio: str | None = None


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
