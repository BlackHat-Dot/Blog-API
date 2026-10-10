from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.utils import calculate_read_time, calculate_word_count, slugify
from app.models import Category, Like, Post, PostTag, Tag, User
from app.schemas.post import PostCreate, PostUpdate


def _normalize_tag_name(value: str) -> str:
    return value.strip().lower()


def _generate_unique_slug(session: Session, title: str, exclude_post_id: int | None = None) -> str:
    base_slug = slugify(title)
    slug = base_slug
    index = 1
    while True:
        existing = session.scalar(select(Post).where(Post.slug == slug))
        if existing is None or (exclude_post_id and existing.id == exclude_post_id):
            break
        index += 1
        slug = f"{base_slug}-{index}"
    return slug


def get_category(session: Session, category_id: int) -> Category | None:
    return session.get(Category, category_id)


def get_or_create_tags(session: Session, names: list[str]) -> list[Tag]:
    tags: list[Tag] = []
    for name in {name.strip().lower() for name in names if name.strip()}:
        existing = session.scalar(select(Tag).where(Tag.name == name))
        if existing:
            tags.append(existing)
            continue
        slug = slugify(name)
        if session.scalar(select(Tag).where(Tag.slug == slug)):
            slug = f"{slug}-{len(name)}"
        tag = Tag(name=name, slug=slug)
        session.add(tag)
        session.flush()
        tags.append(tag)
    return tags


def create_post(session: Session, author_id: int, post_data: PostCreate) -> Post:
    slug = _generate_unique_slug(session, post_data.title)
    word_count = calculate_word_count(post_data.body)
    read_time = calculate_read_time(post_data.body)
    post = Post(
        title=post_data.title,
        summary=post_data.summary,
        body=post_data.body,
        slug=slug,
        state=post_data.state,
        word_count=word_count,
        read_time=read_time,
        author_id=author_id,
        category_id=post_data.category_id,
    )
    post.tags = get_or_create_tags(session, post_data.tags)
    session.add(post)
    session.commit()
    return get_post(session, post.id)


def update_post(session: Session, post: Post, post_data: PostUpdate) -> Post:
    if post_data.title:
        post.title = post_data.title
        post.slug = _generate_unique_slug(session, post_data.title, exclude_post_id=post.id)
    if post_data.summary is not None:
        post.summary = post_data.summary
    if post_data.body is not None:
        post.body = post_data.body
        post.word_count = calculate_word_count(post.body)
        post.read_time = calculate_read_time(post.body)
    if post_data.state is not None:
        post.state = post_data.state
    if post_data.category_id is not None:
        post.category_id = post_data.category_id
    if post_data.tags is not None:
        post.tags = get_or_create_tags(session, post_data.tags)
    session.add(post)
    session.commit()
    return get_post(session, post.id)


from sqlalchemy.orm import selectinload

def get_post(session: Session, post_id: int) -> Post | None:
    statement = (
        select(Post)
        .options(
            selectinload(Post.author),
            selectinload(Post.category),
            selectinload(Post.tags),
            selectinload(Post.likes),
            selectinload(Post.bookmarks),
            selectinload(Post.comments),
        )
        .where(Post.id == post_id)
    )
    return session.scalar(statement)


def get_post_by_slug(session: Session, slug: str) -> Post | None:
    statement = (
        select(Post)
        .options(
            selectinload(Post.author),
            selectinload(Post.category),
            selectinload(Post.tags),
            selectinload(Post.likes),
            selectinload(Post.bookmarks),
            selectinload(Post.comments),
        )
        .where(Post.slug == slug)
    )
    return session.scalar(statement)


def list_posts(
    session: Session,
    search: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    author: str | None = None,
    state: str = "published",
    limit: int = 20,
    offset: int = 0,
):
    statement = (
        select(Post)
        .options(
            selectinload(Post.author),
            selectinload(Post.category),
            selectinload(Post.tags),
            selectinload(Post.likes),
            selectinload(Post.bookmarks),
            selectinload(Post.comments),
        )
        .order_by(Post.created_at.desc())
    )
    count_query = select(func.count(func.distinct(Post.id))).select_from(Post)

    if search:
        search_filter = (
            Post.title.ilike(f"%{search}%")
            | Post.summary.ilike(f"%{search}%")
            | Post.body.ilike(f"%{search}%")
        )
        statement = statement.where(search_filter)
        count_query = count_query.where(search_filter)

    if state:
        statement = statement.where(Post.state == state)
        count_query = count_query.where(Post.state == state)

    if category:
        statement = statement.join(Post.category).where(Category.slug == category)
        count_query = count_query.join(Post.category).where(Category.slug == category)

    if tag:
        statement = statement.join(Post.tags).where(Tag.slug == tag)
        count_query = count_query.join(Post.tags).where(Tag.slug == tag)

    if author:
        statement = statement.join(Post.author).where(User.username == author)
        count_query = count_query.join(Post.author).where(User.username == author)

    if category or tag or author:
        statement = statement.distinct()

    total = session.scalar(count_query) or 0
    posts = session.scalars(statement.limit(limit).offset(offset)).all()
    return posts, total


def get_popular_posts(session: Session, limit: int = 10, offset: int = 0):
    total = session.scalar(select(func.count(Post.id)).where(Post.state == "published")) or 0
    statement = (
        select(Post, func.count(Like.id).label("like_count"))
        .options(
            selectinload(Post.author),
            selectinload(Post.category),
            selectinload(Post.tags),
            selectinload(Post.likes),
            selectinload(Post.bookmarks),
            selectinload(Post.comments),
        )
        .outerjoin(Like, Like.post_id == Post.id)
        .where(Post.state == "published")
        .group_by(Post.id)
        .order_by(func.count(Like.id).desc(), Post.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = session.execute(statement).all()
    return rows, total
