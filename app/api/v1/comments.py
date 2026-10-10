from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.crud.comment import create_comment, list_comments
from app.crud.post import get_post
from app.db.session import get_session
from app.schemas.comment import CommentCreate, CommentRead

router = APIRouter(prefix="")


@router.post("/posts/{post_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def post_comment(
    post_id: int,
    comment_input: CommentCreate,
    current_user=Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not get_post(session, post_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    try:
        return create_comment(session, post_id, current_user.id, comment_input)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/posts/{post_id}/comments", response_model=list[CommentRead])
def get_comments(
    post_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    if not get_post(session, post_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return list_comments(session, post_id, limit, offset)
