from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Bookmark, Follow, Like, Post, User


def get_follow(session: Session, follower_id: int, followed_id: int) -> Follow | None:
    return session.scalar(
        select(Follow).where(Follow.follower_id == follower_id, Follow.followed_id == followed_id)
    )


def follow_author(session: Session, follower_id: int, followed_id: int) -> Follow:
    if follower_id == followed_id:
        raise ValueError("You cannot follow yourself")
    follow = get_follow(session, follower_id, followed_id)
    if follow:
        return follow
    follow = Follow(follower_id=follower_id, followed_id=followed_id)
    session.add(follow)
    session.commit()
    session.refresh(follow)
    return follow


def unfollow_author(session: Session, follower_id: int, followed_id: int) -> bool:
    follow = get_follow(session, follower_id, followed_id)
    if not follow:
        return False
    session.delete(follow)
    session.commit()
    return True


def like_post(session: Session, user_id: int, post_id: int) -> Like:
    existing = session.scalar(select(Like).where(Like.user_id == user_id, Like.post_id == post_id))
    if existing:
        return existing
    like = Like(user_id=user_id, post_id=post_id)
    session.add(like)
    session.commit()
    session.refresh(like)
    return like


def unlike_post(session: Session, user_id: int, post_id: int) -> bool:
    existing = session.scalar(select(Like).where(Like.user_id == user_id, Like.post_id == post_id))
    if not existing:
        return False
    session.delete(existing)
    session.commit()
    return True


def bookmark_post(session: Session, user_id: int, post_id: int) -> Bookmark:
    existing = session.scalar(select(Bookmark).where(Bookmark.user_id == user_id, Bookmark.post_id == post_id))
    if existing:
        return existing
    bookmark = Bookmark(user_id=user_id, post_id=post_id)
    session.add(bookmark)
    session.commit()
    session.refresh(bookmark)
    return bookmark


def remove_bookmark(session: Session, user_id: int, post_id: int) -> bool:
    existing = session.scalar(select(Bookmark).where(Bookmark.user_id == user_id, Bookmark.post_id == post_id))
    if not existing:
        return False
    session.delete(existing)
    session.commit()
    return True


def list_user_bookmarks(
    session: Session,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Post], int]:
    total = session.scalar(
        select(func.count(Bookmark.id)).where(Bookmark.user_id == user_id)
    ) or 0

    statement = (
        select(Post)
        .join(Bookmark, Bookmark.post_id == Post.id)
        .where(Bookmark.user_id == user_id)
        .order_by(Bookmark.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    posts = session.scalars(statement).all()
    return posts, total
