from pydantic import BaseModel, ConfigDict


class CategoryCreate(BaseModel):
    name: str
    slug: str


class CategoryRead(BaseModel):
    id: int
    name: str
    slug: str

    model_config = ConfigDict(from_attributes=True)
