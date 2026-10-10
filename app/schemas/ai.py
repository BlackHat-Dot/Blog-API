from pydantic import BaseModel, Field


class ToneSuggestion(BaseModel):
    name: str = Field(..., description="Short punchy name of the tone")
    description: str = Field(..., description="Brief explanation of why this tone fits the topic")


class SuggestTonesRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=1000)
    api_key: str | None = None


class SuggestTonesResponse(BaseModel):
    topic: str
    tones: list[ToneSuggestion]


class GeneratePostRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=1500)
    tone: str = Field(..., min_length=2, max_length=200)
    existing_categories: list[str] = []
    api_key: str | None = None


class GeneratedPostResponse(BaseModel):
    title: str = Field(..., min_length=5)
    summary: str = Field(..., min_length=10)
    body: str = Field(..., min_length=50)
    category: str | None = None
    tags: list[str] = []
