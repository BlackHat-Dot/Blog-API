from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    openapi_url=f"{settings.api_v1_str}/openapi.json",
    docs_url=f"{settings.api_v1_str}/docs",
    redoc_url=f"{settings.api_v1_str}/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_str)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.isdir(frontend_dir):
    # Mount css, js subdirectories
    css_dir = os.path.join(frontend_dir, "css")
    js_dir = os.path.join(frontend_dir, "js")
    if os.path.isdir(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.isdir(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")

    @app.get("/config.js", include_in_schema=False)
    def serve_config():
        return FileResponse(os.path.join(frontend_dir, "config.js"))

    @app.get("/styles.css", include_in_schema=False)
    def serve_styles():
        return FileResponse(os.path.join(frontend_dir, "styles.css"))

    @app.get("/app", tags=["Frontend"])
    @app.get("/app/{path:path}", tags=["Frontend"])
    def serve_index(path: str = ""):
        return FileResponse(os.path.join(frontend_dir, "index.html"))

@app.get("/", tags=["Health"])
def health_check(request: Request):
    accept = request.headers.get("accept", "")
    if "text/html" in accept and os.path.isdir(frontend_dir):
        return FileResponse(os.path.join(frontend_dir, "index.html"))
    return {"status": "ok", "app": settings.app_name}

@app.get("/api/health", tags=["Health"])
def api_health_check():
    return {"status": "ok", "app": settings.app_name}