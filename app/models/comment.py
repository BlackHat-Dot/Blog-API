from __future__ import annotations

from datetime import datetime
from typing import Optional

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.post import Post
    from app.models.user import User

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    body: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id"),
        nullable=False,
    )

    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("comments.id"),
        nullable=True,
    )

    post: Mapped["Post"] = relationship(
        "Post",
        back_populates="comments",
    )

    author: Mapped["User"] = relationship(
        "User",
        back_populates="comments",
    )

    parent: Mapped[Optional["Comment"]] = relationship(
        "Comment",
        remote_side=lambda: [Comment.id],
        back_populates="replies",
    )

    replies: Mapped[list["Comment"]] = relationship(
        "Comment",
        back_populates="parent",
        cascade="all, delete-orphan",
    )