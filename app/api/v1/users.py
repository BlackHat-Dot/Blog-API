from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.crud.user import get_user_by_username
from app.crud.interaction import get_follow, follow_author, unfollow_author
from app.db.session import get_session
from app.models import Follow, Post
from app.schemas.user import Profile, UserRead

router = APIRouter(prefix="")


@router.get("/users/me", response_model=UserRead)
def read_current_user(current_user=Depends(get_current_user)):
    return current_user


@router.get("/profiles/{username}", response_model=Profile)
def read_profile(username: str, session: Session = Depends(get_session)):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Author not found")

    post_count = session.scalar(select(func.count()).select_from(Post).where(Post.author_id == user.id)) or 0
    follower_count = session.scalar(select(func.count()).select_from(Follow).where(Follow.followed_id == user.id)) or 0
    following_count = session.scalar(select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)) or 0

    return Profile(
        username=user.username,
        bio=user.bio,
        post_count=post_count,
        follower_count=follower_count,
        following_count=following_count,
        is_following=False,
        created_at=user.created_at,
    )


@router.post("/profiles/{username}/follow", status_code=status.HTTP_204_NO_CONTENT)
def follow(username: str, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Author not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself")
    follow_author(session, current_user.id, user.id)
    return None


@router.delete("/profiles/{username}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow(username: str, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Author not found")
    if not unfollow_author(session, current_user.id, user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not following this author")
    return None
