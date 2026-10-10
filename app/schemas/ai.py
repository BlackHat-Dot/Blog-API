from pydantic import BaseModel, Field


class ToneSuggestion(BaseModel):
    name: str = Field(..., description="Short punchy name of the tone")
    description: str = Field(..., description="Brief explanation of why this tone fits the topic")


class SuggestTonesRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500, description="Topic depiction")
    api_key: str | None = None


class SuggestTonesResponse(BaseModel):
    topic: str
    tones: list[ToneSuggestion]
    model_used: str | None = Field(None, description="The Gemini model that fulfilled the request")


class GeneratePostRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500, description="Topic depiction")
    tone: str = Field(..., min_length=2, max_length=100, description="Selected tone")
    existing_categories: list[str] = Field(default_factory=list, max_length=30)
    api_key: str | None = None


class GeneratedPostResponse(BaseModel):
    title: str = Field(..., min_length=5, max_length=55)
    summary: str = Field(..., min_length=10, max_length=110)
    body: str = Field(..., min_length=50, max_length=100000)
    category: str | None = Field(None, max_length=50)
    tags: list[str] = Field(default_factory=list, max_length=15)
    model_used: str | None = Field(None, description="The Gemini model that fulfilled the request")
