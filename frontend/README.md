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

- The API doesn't say whether the current user liked or saved a post, so this browser remembers it.
  The Saved page is therefore per browser.
- Comments carry only `author_id`, so other people show as "Member 12". Adding `username` to
  `CommentRead` makes the names appear with no frontend change.
- A post's category can't be cleared through `PUT /posts/{id}`, so the editor doesn't offer
  "No category" once a post has one.
- `GET /posts?state=draft` is public, so drafts are not private. Consider restricting it to the author.
