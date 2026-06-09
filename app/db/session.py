from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(str(settings.database_url), future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True, class_=Session)


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
