from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.crud.user import authenticate_user, create_user, get_user_by_email, get_user_by_username
from app.db.session import get_session
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserLogin, UserRead

router = APIRouter(prefix="/auth")


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(user_create: UserCreate, session: Session = Depends(get_session)):
    if get_user_by_email(session, user_create.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered")
    if get_user_by_username(session, user_create.username):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is already taken")
    return create_user(session, user_create)


@router.post("/login", response_model=Token)
def login(user_login: UserLogin, session: Session = Depends(get_session)):
    user = authenticate_user(session, user_login.email, user_login.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access_token = create_access_token(subject=user.email)
    return {"access_token": access_token, "token_type": "bearer"}
