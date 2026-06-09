from fastapi import APIRouter

from app.api.v1 import auth, posts, comments, users

api_router = APIRouter()
api_router.include_router(auth.router, tags=["Authentication"])
api_router.include_router(users.router, tags=["Users"])
api_router.include_router(posts.router, tags=["Posts"])
api_router.include_router(comments.router, tags=["Comments"])
