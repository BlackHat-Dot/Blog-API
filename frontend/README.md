# Longhand

A reading-first frontend for the Blog API. Plain HTML, CSS and JavaScript: no build step.

## Run it

1. Start the API: `uvicorn app.main:app --reload` (default `http://localhost:8000`).
2. Check `config.js`: `apiBase` must point at your API's `/api/v1`.
3. Serve this folder with any static server, e.g. `python -m http.server 5500`, and open `http://localhost:5500`.
   Opening `index.html` directly also works. CORS is already open in `main.py`.

To serve it from the FastAPI app itself, add
`app.mount("/", StaticFiles(directory="frontend", html=True), name="web")` after the routers
and set `apiBase` to `"/api/v1"`.

## What's covered

Feed with search, category, topic and most-liked views; post pages with Markdown, likes, saves,
threaded comments and follow; author profiles with drafts; a Markdown editor with preview,
tags, new categories and local autosave; sign in and registration.

## Where the API shapes the UI

- Bookmarks listing (`GET /bookmarks`, `/posts/bookmarks`, `/users/me/bookmarks`) enables server-synced Saved posts across all devices.
- `PostResponse` includes dynamic `is_liked` and `is_bookmarked` flags for the authenticated user, keeping like and save buttons active after page refresh.
- `CommentRead` includes `author.username` and `author_username`, so comments show author names instead of generic fallbacks.
- Authentication token is persisted in `localStorage` (`longhand.token`), preserving the user session across browser reloads.
