from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user, get_optional_current_user
from app.core.utils import slugify
from app.crud.interaction import (
    bookmark_post,
    like_post,
    list_user_bookmarks,
    remove_bookmark,
    unlike_post,
)
from app.crud.post import create_post, get_category, get_or_create_tags, get_post, get_post_by_slug, get_popular_posts, list_posts, update_post
from app.db.session import get_session
from app.models import Category, Tag, User
from app.schemas.category import CategoryCreate, CategoryRead
from app.schemas.post import PaginatedPosts, PostCreate, PostResponse, PostUpdate

router = APIRouter(prefix="")


def _build_post_response(
    post,
    like_count: int | None = None,
    bookmark_count: int | None = None,
    viewer: User | None = None,
    is_liked: bool | None = None,
    is_bookmarked: bool | None = None,
) -> PostResponse:
    if is_liked is None:
        is_liked = any(l.user_id == viewer.id for l in post.likes) if viewer else False
    if is_bookmarked is None:
        is_bookmarked = any(b.user_id == viewer.id for b in post.bookmarks) if viewer else False

    return PostResponse(
        id=post.id,
        title=post.title,
        summary=post.summary,
        body=post.body,
        slug=post.slug,
        state=post.state,
        word_count=post.word_count,
        read_time=post.read_time,
        author={"username": post.author.username, "bio": post.author.bio},
        category=CategoryRead.model_validate(post.category) if post.category else None,
        tags=[tag.name for tag in post.tags],
        like_count=like_count if like_count is not None else len(post.likes),
        bookmark_count=bookmark_count if bookmark_count is not None else len(post.bookmarks),
        comment_count=len(post.comments),
        created_at=post.created_at,
        updated_at=post.updated_at,
        is_liked=is_liked,
        is_bookmarked=is_bookmarked,
    )


@router.get("/posts", response_model=PaginatedPosts)
def read_posts(
    search: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    author: str | None = None,
    state: str = Query("published", pattern=r"^(draft|published)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    viewer: User | None = Depends(get_optional_current_user),
    session: Session = Depends(get_session),
):
    posts, total = list_posts(session, search, category, tag, author, state, limit, offset)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_build_post_response(post, viewer=viewer) for post in posts],
    }


@router.get("/posts/popular", response_model=PaginatedPosts)
def read_popular_posts(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    viewer: User | None = Depends(get_optional_current_user),
    session: Session = Depends(get_session),
):
    rows, total = get_popular_posts(session, limit, offset)
    items = [_build_post_response(post, like_count=like_count, viewer=viewer) for post, like_count in rows]
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/bookmarks", response_model=PaginatedPosts)
@router.get("/posts/bookmarks", response_model=PaginatedPosts)
@router.get("/users/me/bookmarks", response_model=PaginatedPosts)
def read_user_bookmarks(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    posts, total = list_user_bookmarks(session, current_user.id, limit, offset)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            _build_post_response(post, viewer=current_user, is_bookmarked=True)
            for post in posts
        ],
    }


@router.get("/posts/{post_id}", response_model=PostResponse)
def read_post(
    post_id: int,
    viewer: User | None = Depends(get_optional_current_user),
    session: Session = Depends(get_session),
):
    post = get_post(session, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return _build_post_response(post, viewer=viewer)


@router.post("/posts", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
def create_new_post(post_input: PostCreate, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    if post_input.category_id is not None and not get_category(session, post_input.category_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    post = create_post(session, current_user.id, post_input)
    return _build_post_response(post, viewer=current_user)


@router.put("/posts/{post_id}", response_model=PostResponse)
def edit_post(post_id: int, post_update: PostUpdate, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    post = get_post(session, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this post")
    if post_update.category_id is not None and post_update.category_id and not get_category(session, post_update.category_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    updated = update_post(session, post, post_update)
    return _build_post_response(updated, viewer=current_user)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: int, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    post = get_post(session, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this post")
    session.delete(post)
    session.commit()
    return None


@router.post("/posts/{post_id}/like", status_code=status.HTTP_201_CREATED)
def like_post_endpoint(post_id: int, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    post = get_post(session, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    like_post(session, current_user.id, post_id)
    return {"detail": "Post liked"}


@router.delete("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def unlike_post_endpoint(post_id: int, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    if not get_post(session, post_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if not unlike_post(session, current_user.id, post_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Like not found")
    return None


@router.post("/posts/{post_id}/bookmark", status_code=status.HTTP_201_CREATED)
def bookmark_post_endpoint(post_id: int, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    post = get_post(session, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    bookmark_post(session, current_user.id, post_id)
    return {"detail": "Post bookmarked"}


@router.delete("/posts/{post_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
def remove_bookmark_endpoint(post_id: int, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    if not get_post(session, post_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if not remove_bookmark(session, current_user.id, post_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bookmark not found")
    return None


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(session: Session = Depends(get_session)):
    return session.scalars(select(Category).order_by(Category.name)).all()


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(category_input: CategoryCreate, current_user=Depends(get_current_user), session: Session = Depends(get_session)):
    slug = category_input.slug or slugify(category_input.name)
    existing_name = session.scalar(select(Category).where(Category.name == category_input.name))
    if existing_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category name already exists")
    existing_slug = session.scalar(select(Category).where(Category.slug == slug))
    if existing_slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category slug already exists")
    category = Category(name=category_input.name, slug=slug)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.get("/tags", response_model=list[str])
def list_tags(session: Session = Depends(get_session)):
    return [tag.name for tag in session.scalars(select(Tag).order_by(Tag.name)).all()]
