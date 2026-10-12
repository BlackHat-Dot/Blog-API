# Longhand API - https://blog-api-frontend-orcin.vercel.app

A production-ready blog backend built with FastAPI, PostgreSQL, SQLAlchemy 2.0, Alembic, and JWT authentication.

## Features

- User registration and login with JWT
- Create/read/update/delete blog posts
- Draft and published post states
- Categories and tags management
- Comment system
- Like and bookmark posts
- Follow authors
- Search posts by keyword
- Pagination on list endpoints
- Word count and read time calculation
- Popular posts endpoint
- Author profile with post count
- Edit profile.

## Tech stack

- FastAPI
- PostgreSQL
- SQLAlchemy 2.0
- Alembic
- python-jose
- bcrypt via passlib
- Pydantic v2

## Setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Update `.env`:

   ```env
   SECRET_KEY=your-secret-key
   DATABASE_URL=postgresql://user:password@localhost:5432/blog_api
   ```

3. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. Run database migrations:

   ```bash
   alembic upgrade head
   ```

5. Start the app:

   ```bash
   uvicorn app.main:app --reload
   ```

The API will be available at `http://127.0.0.1:8000/api/v1`.

## Deployment

This project includes a `Dockerfile` and `Procfile` for deployment to Railway, Heroku, or other container-based hosts.

### Railway

- Add `SECRET_KEY` and `DATABASE_URL` as environment variables.
- Set the start command to:

  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```

## Alembic

Use Alembic to manage migrations:

```bash
alembic revision --autogenerate -m "Add new migration"
alembic upgrade head
```

## API docs

- Swagger UI: `/api/v1/docs`
- ReDoc: `/api/v1/redoc`
