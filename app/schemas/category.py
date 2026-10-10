from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=15)
    slug: str | None = Field(None, max_length=30)


class CategoryRead(BaseModel):
    id: int
    name: str
    slug: str

    model_config = ConfigDict(from_attributes=True)
