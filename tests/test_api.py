import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["SECRET_KEY"] = "super-secret-key-for-testing-at-least-32-chars-long"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.db.base import Base
from app.db.session import get_session
from app.main import app

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def session():
    connection = test_engine.connect()
    transaction = connection.begin()
    db = TestingSessionLocal(bind=connection)

    yield db

    db.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(session):
    def override_get_session():
        yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_health_check(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_auth_and_user_flows(client):
    # Register user 1
    reg_res = client.post(
        "/api/v1/auth/register",
        json={"email": "author1@gmail.com", "username": "author1", "password": "Password123!"},
    )
    assert reg_res.status_code == 201
    user1 = reg_res.json()
    assert user1["username"] == "author1"
    assert "password_hash" not in user1

    # Register duplicate email
    dup_res = client.post(
        "/api/v1/auth/register",
        json={"email": "author1@gmail.com", "username": "author2", "password": "Password123!"},
    )
    assert dup_res.status_code == 400

    # Test rejection of non-gmail and invalid Gmail username compilation rules:
    # 1. Non-gmail domain
    # 2. Too short (< 6 chars)
    # 3. Too long (> 30 chars)
    # 4. Leading / trailing period
    # 5. Consecutive periods
    # 6. Disallowed characters (underscores, hyphens, plus)
    for bad_email in [
        "author1@example.com",
        "user@yahoo.com",
        "abc@gmail.com",
        "a" * 31 + "@gmail.com",
        ".leading@gmail.com",
        "trailing.@gmail.com",
        "double..dot@gmail.com",
        "user_name@gmail.com",
        "user-name@gmail.com",
        "user+tag@gmail.com",
    ]:
        bad_res = client.post(
            "/api/v1/auth/register",
            json={"email": bad_email, "username": "baduser", "password": "Password123!"},
        )
        assert bad_res.status_code == 422, f"Expected 422 for bad email: {bad_email}"
        assert "Fix email" in bad_res.text or "Value error" in bad_res.text

    # Register duplicate username
    dup_user = client.post(
        "/api/v1/auth/register",
        json={"email": "other.author@gmail.com", "username": "author1", "password": "Password123!"},
    )
    assert dup_user.status_code == 400

    # Login
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "author1@gmail.com", "password": "Password123!"},
    )
    assert login_res.status_code == 200
    token1 = login_res.json()["access_token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # /users/me
    me_res = client.get("/api/v1/users/me", headers=headers1)
    assert me_res.status_code == 200
    assert me_res.json()["username"] == "author1"

    # Register user 2
    client.post(
        "/api/v1/auth/register",
        json={"email": "reader123@gmail.com", "username": "reader", "password": "Password123!"},
    )
    login_res2 = client.post(
        "/api/v1/auth/login",
        json={"email": "reader123@gmail.com", "password": "Password123!"},
    )
    token2 = login_res2.json()["access_token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    # Follow author1 by reader
    follow_res = client.post("/api/v1/profiles/author1/follow", headers=headers2)
    assert follow_res.status_code == 204

    # Cannot follow self
    follow_self = client.post("/api/v1/profiles/author1/follow", headers=headers1)
    assert follow_self.status_code == 400

    # Profile view as reader (should show is_following=True)
    prof_res = client.get("/api/v1/profiles/author1", headers=headers2)
    assert prof_res.status_code == 200
    data = prof_res.json()
    assert data["is_following"] is True
    assert data["follower_count"] == 1

    # Profile view anonymous
    prof_anon = client.get("/api/v1/profiles/author1")
    assert prof_anon.status_code == 200
    assert prof_anon.json()["is_following"] is False

    # Unfollow
    unfollow_res = client.delete("/api/v1/profiles/author1/follow", headers=headers2)
    assert unfollow_res.status_code == 204


def test_post_and_comment_lifecycle(client):
    # Setup author
    client.post(
        "/api/v1/auth/register",
        json={"email": "blogger@gmail.com", "username": "blogger", "password": "Password123!"},
    )
    token = client.post(
        "/api/v1/auth/login",
        json={"email": "blogger@gmail.com", "password": "Password123!"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create category
    cat_res = client.post(
        "/api/v1/categories",
        json={"name": "Technology"},
        headers=headers,
    )
    assert cat_res.status_code == 201
    cat_id = cat_res.json()["id"]

    # Duplicate category rejection
    cat_dup = client.post("/api/v1/categories", json={"name": "Technology"}, headers=headers)
    assert cat_dup.status_code == 400

    # Create post
    post_res = client.post(
        "/api/v1/posts",
        json={
            "title": "Mastering FastAPI and SQLAlchemy 2.0",
            "summary": "A deep dive tutorial",
            "body": "This is a detailed technical guide with well more than twenty characters of meaningful content.",
            "category_id": cat_id,
            "tags": ["python", "fastapi"],
            "state": "published",
        },
        headers=headers,
    )
    assert post_res.status_code == 201
    post_data = post_res.json()
    post_id = post_data["id"]
    assert post_data["author"]["username"] == "blogger"
    assert post_data["category"]["name"] == "Technology"
    assert len(post_data["tags"]) == 2
    assert post_data["read_time"] >= 1

    # Read post
    get_res = client.get(f"/api/v1/posts/{post_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Mastering FastAPI and SQLAlchemy 2.0"

    # Search & filters
    search_res = client.get("/api/v1/posts?search=Mastering&tag=python")
    assert search_res.status_code == 200
    assert search_res.json()["total"] == 1
    assert len(search_res.json()["items"]) == 1

    # Like post
    like_res = client.post(f"/api/v1/posts/{post_id}/like", headers=headers)
    assert like_res.status_code == 201

    # Popular posts
    pop_res = client.get("/api/v1/posts/popular")
    assert pop_res.status_code == 200
    assert pop_res.json()["total"] == 1
    assert pop_res.json()["items"][0]["like_count"] == 1

    # Unlike post
    unlike_res = client.delete(f"/api/v1/posts/{post_id}/like", headers=headers)
    assert unlike_res.status_code == 204

    # Add root comment
    comm_res = client.post(
        f"/api/v1/posts/{post_id}/comments",
        json={"body": "Great article!"},
        headers=headers,
    )
    assert comm_res.status_code == 201
    parent_comment_id = comm_res.json()["id"]

    # Add reply comment
    reply_res = client.post(
        f"/api/v1/posts/{post_id}/comments",
        json={"body": "Thanks for reading!", "parent_id": parent_comment_id},
        headers=headers,
    )
    assert reply_res.status_code == 201
    assert reply_res.json()["parent_id"] == parent_comment_id

    # List comments
    comments_res = client.get(f"/api/v1/posts/{post_id}/comments")
    assert comments_res.status_code == 200
    assert len(comments_res.json()) == 2
