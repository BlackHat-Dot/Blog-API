from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user, get_optional_current_user
from app.crud.user import get_user_by_username
from app.crud.interaction import get_follow, follow_author, unfollow_author
from app.db.session import get_session
from app.models import Follow, Post, User
from app.schemas.user import Profile, UserRead, UserUpdate

router = APIRouter(prefix="")


@router.get("/users/me", response_model=UserRead)
def read_current_user(current_user=Depends(get_current_user)):
    return current_user


@router.put("/users/me", response_model=UserRead)
def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if user_update.username is not None:
        new_username = user_update.username.strip()
        if not new_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username cannot be empty",
            )
        # Check if username is already taken by another user
        if new_username != current_user.username:
            existing = get_user_by_username(session, new_username)
            if existing and existing.id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username is already taken",
                )
            current_user.username = new_username

    if user_update.bio is not None:
        current_user.bio = user_update.bio.strip() or None

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.get("/profiles/{username}", response_model=Profile)
def read_profile(
    username: str,
    session: Session = Depends(get_session),
    viewer: User | None = Depends(get_optional_current_user),
):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Author not found")

    post_count = session.scalar(select(func.count()).select_from(Post).where(Post.author_id == user.id)) or 0
    follower_count = session.scalar(select(func.count()).select_from(Follow).where(Follow.followed_id == user.id)) or 0
    following_count = session.scalar(select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)) or 0

    is_following = False
    if viewer and viewer.id != user.id:
        is_following = bool(get_follow(session, viewer.id, user.id))

    return Profile(
        username=user.username,
        bio=user.bio,
        post_count=post_count,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
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
