from fastapi import APIRouter

from app.api.v1 import ai, auth, comments, posts, users

api_router = APIRouter()
api_router.include_router(auth.router, tags=["Authentication"])
api_router.include_router(users.router, tags=["Users"])
api_router.include_router(posts.router, tags=["Posts"])
api_router.include_router(comments.router, tags=["Comments"])
api_router.include_router(ai.router, tags=["AI"])
