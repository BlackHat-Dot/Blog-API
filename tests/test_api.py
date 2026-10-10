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

    # Edit profile: update bio
    edit_bio_res = client.put("/api/v1/users/me", json={"bio": "Writer and explorer"}, headers=headers1)
    assert edit_bio_res.status_code == 200
    assert edit_bio_res.json()["bio"] == "Writer and explorer"

    # Edit profile: change username
    edit_user_res = client.put("/api/v1/users/me", json={"username": "author_prime"}, headers=headers1)
    assert edit_user_res.status_code == 200
    assert edit_user_res.json()["username"] == "author_prime"

    # Edit profile: change back to author1
    client.put("/api/v1/users/me", json={"username": "author1"}, headers=headers1)

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

    # Attempt to change reader's username to author1 (should fail with 400 - already taken)
    dup_edit_res = client.put("/api/v1/users/me", json={"username": "author1"}, headers=headers2)
    assert dup_edit_res.status_code == 400
    assert "already taken" in dup_edit_res.json()["detail"].lower()

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
    comments_data = comments_res.json()
    assert len(comments_data) == 2
    # Verify comments include author username and computed aliases
    assert comments_data[0]["author"] is not None
    assert comments_data[0]["author"]["username"] == "blogger"
    assert comments_data[0]["author_username"] == "blogger"
    assert comments_data[0]["username"] == "blogger"

    # Test is_liked and is_bookmarked dynamic status
    unauth_post = client.get(f"/api/v1/posts/{post_id}").json()
    assert unauth_post["is_liked"] is False
    assert unauth_post["is_bookmarked"] is False

    auth_post_initial = client.get(f"/api/v1/posts/{post_id}", headers=headers).json()
    assert auth_post_initial["is_liked"] is False
    assert auth_post_initial["is_bookmarked"] is False

    # Like and Bookmark
    client.post(f"/api/v1/posts/{post_id}/like", headers=headers)
    client.post(f"/api/v1/posts/{post_id}/bookmark", headers=headers)

    auth_post_after = client.get(f"/api/v1/posts/{post_id}", headers=headers).json()
    assert auth_post_after["is_liked"] is True
    assert auth_post_after["is_bookmarked"] is True

    # Check unauthenticated view still returns False
    unauth_after = client.get(f"/api/v1/posts/{post_id}").json()
    assert unauth_after["is_liked"] is False
    assert unauth_after["is_bookmarked"] is False

    # Check bookmarks listing endpoints
    unauth_bm = client.get("/api/v1/bookmarks")
    assert unauth_bm.status_code == 401

    bm_res = client.get("/api/v1/bookmarks", headers=headers)
    assert bm_res.status_code == 200
    bm_data = bm_res.json()
    assert bm_data["total"] == 1
    assert len(bm_data["items"]) == 1
    assert bm_data["items"][0]["id"] == post_id
    assert bm_data["items"][0]["is_bookmarked"] is True

    # Check /posts/bookmarks and /users/me/bookmarks aliases
    assert client.get("/api/v1/posts/bookmarks", headers=headers).status_code == 200
    assert client.get("/api/v1/users/me/bookmarks", headers=headers).status_code == 200

    # Unbookmark & Unlike
    del_bm = client.delete(f"/api/v1/posts/{post_id}/bookmark", headers=headers)
    assert del_bm.status_code == 204
    del_like = client.delete(f"/api/v1/posts/{post_id}/like", headers=headers)
    assert del_like.status_code == 204

    # Verify bookmarks empty and post flags reverted
    bm_res_after = client.get("/api/v1/bookmarks", headers=headers).json()
    assert bm_res_after["total"] == 0
    auth_post_clean = client.get(f"/api/v1/posts/{post_id}", headers=headers).json()
    assert auth_post_clean["is_liked"] is False
    assert auth_post_clean["is_bookmarked"] is False

    # Edit post as author
    edit_res = client.put(
        f"/api/v1/posts/{post_id}",
        json={"title": "Updated Title for FastAPI Guide", "summary": "An updated summary"},
        headers=headers,
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["title"] == "Updated Title for FastAPI Guide"
    assert edit_res.json()["summary"] == "An updated summary"

    # Register second user to test unauthorized edits and deletes
    client.post(
        "/api/v1/auth/register",
        json={"email": "stranger@gmail.com", "username": "stranger", "password": "Password123!"},
    )
    login_stranger = client.post(
        "/api/v1/auth/login",
        json={"email": "stranger@gmail.com", "password": "Password123!"},
    )
    stranger_headers = {"Authorization": f"Bearer {login_stranger.json()['access_token']}"}

    # Reject edit by non-author
    unauth_edit = client.put(
        f"/api/v1/posts/{post_id}",
        json={"title": "Hacked Title that should fail"},
        headers=stranger_headers,
    )
    assert unauth_edit.status_code == 403

    # Reject delete by non-author
    unauth_delete = client.delete(f"/api/v1/posts/{post_id}", headers=stranger_headers)
    assert unauth_delete.status_code == 403

    # Delete post as author
    del_post_res = client.delete(f"/api/v1/posts/{post_id}", headers=headers)
    assert del_post_res.status_code == 204

    # Verify post is deleted
    assert client.get(f"/api/v1/posts/{post_id}").status_code == 404


def test_ai_tones_and_post_generation(client):
    # Setup user
    client.post(
        "/api/v1/auth/register",
        json={"email": "aiwriter@gmail.com", "username": "aiwriter", "password": "Password123!"},
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "aiwriter@gmail.com", "password": "Password123!"},
    )
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Test suggest-tones without auth (401)
    unauth_tones = client.post("/api/v1/ai/suggest-tones", json={"prompt": "Why SQLite in production is awesome"})
    assert unauth_tones.status_code == 401

    # Test suggest-tones with auth (200)
    tones_res = client.post(
        "/api/v1/ai/suggest-tones",
        json={"prompt": "Why SQLite in production is awesome"},
        headers=headers,
    )
    assert tones_res.status_code == 200
    tones_data = tones_res.json()
    assert "tones" in tones_data
    assert len(tones_data["tones"]) >= 3
    selected_tone = tones_data["tones"][0]["name"]
    assert len(selected_tone) > 0
    assert "description" in tones_data["tones"][0]

    # Test generate-post without auth (401)
    unauth_gen = client.post(
        "/api/v1/ai/generate-post",
        json={"prompt": "Why SQLite in production is awesome", "tone": selected_tone},
    )
    assert unauth_gen.status_code == 401

    # Test generate-post with auth (200)
    gen_res = client.post(
        "/api/v1/ai/generate-post",
        json={
            "prompt": "Why SQLite in production is awesome",
            "tone": selected_tone,
            "existing_categories": ["Technology", "Architecture"],
        },
        headers=headers,
    )
    assert gen_res.status_code == 200
    gen_data = gen_res.json()
    assert "title" in gen_data and len(gen_data["title"]) >= 5
    assert "summary" in gen_data and len(gen_data["summary"]) >= 10
    assert "body" in gen_data and len(gen_data["body"]) >= 50
    assert "##" in gen_data["body"]  # Verify formatted markdown
    assert isinstance(gen_data["tags"], list)
    assert len(gen_data["tags"]) >= 1
    assert gen_data["category"] in ["Technology", "Architecture"]

    # --- Test Field Length Limits ---
    # 1. Topic > 500 chars -> 422
    long_topic = "A" * 501
    bad_topic = client.post("/api/v1/ai/suggest-tones", json={"prompt": long_topic}, headers=headers)
    assert bad_topic.status_code == 422

    # 2. Category > 50 chars -> 422
    long_cat = client.post("/api/v1/categories", json={"name": "C" * 51}, headers=headers)
    assert long_cat.status_code == 422

    # 3. Post Summary / Description > 1000 chars -> 422
    bad_sum = client.post(
        "/api/v1/posts",
        json={
            "title": "Valid Post Title Here",
            "summary": "S" * 1001,
            "body": "This is a valid body with sufficient characters for testing.",
        },
        headers=headers,
    )
    assert bad_sum.status_code == 422

    # 4. Post Body > 100,000 chars -> 422
    bad_body = client.post(
        "/api/v1/posts",
        json={
            "title": "Valid Post Title Here",
            "summary": "Valid summary",
            "body": "B" * 100001,
        },
        headers=headers,
    )
    assert bad_body.status_code == 422

    # 5. Tag length > 30 chars -> 422
    bad_tag_len = client.post(
        "/api/v1/posts",
        json={
            "title": "Valid Post Title Here",
            "body": "This is a valid body with sufficient characters for testing.",
            "tags": ["T" * 31],
        },
        headers=headers,
    )
    assert bad_tag_len.status_code == 422

    # 6. Tag count > 15 -> 422
    bad_tag_cnt = client.post(
        "/api/v1/posts",
        json={
            "title": "Valid Post Title Here",
            "body": "This is a valid body with sufficient characters for testing.",
            "tags": [f"tag{i}" for i in range(16)],
        },
        headers=headers,
    )
    assert bad_tag_cnt.status_code == 422
