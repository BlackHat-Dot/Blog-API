from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Comment, Post
from app.schemas.comment import CommentCreate


from sqlalchemy.orm import selectinload

def create_comment(session: Session, post_id: int, author_id: int, comment_data: CommentCreate) -> Comment:
    if not session.get(Post, post_id):
        raise ValueError("Post not found")
    if comment_data.parent_id is not None:
        parent_comment = session.get(Comment, comment_data.parent_id)
        if not parent_comment:
            raise ValueError("Parent comment not found")
        if parent_comment.post_id != post_id:
            raise ValueError("Parent comment belongs to a different post")
    comment = Comment(
        body=comment_data.body,
        post_id=post_id,
        author_id=author_id,
        parent_id=comment_data.parent_id,
    )
    session.add(comment)
    session.commit()
    statement = select(Comment).options(selectinload(Comment.author)).where(Comment.id == comment.id)
    return session.scalar(statement)


def list_comments(session: Session, post_id: int, limit: int = 20, offset: int = 0) -> list[Comment]:
    statement = (
        select(Comment)
        .options(selectinload(Comment.author))
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    return session.scalars(statement).all()
