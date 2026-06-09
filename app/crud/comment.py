from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Comment, Post
from app.schemas.comment import CommentCreate


def create_comment(session: Session, post_id: int, author_id: int, comment_data: CommentCreate) -> Comment:
    if not session.get(Post, post_id):
        raise ValueError("Post not found")
    comment = Comment(
        body=comment_data.body,
        post_id=post_id,
        author_id=author_id,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment


def list_comments(session: Session, post_id: int, limit: int = 20, offset: int = 0) -> list[Comment]:
    statement = select(Comment).where(Comment.post_id == post_id).order_by(Comment.created_at.asc()).limit(limit).offset(offset)
    return session.scalars(statement).all()
