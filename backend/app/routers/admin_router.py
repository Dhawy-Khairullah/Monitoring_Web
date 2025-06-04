from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from .. import models, schemas, auth
from datetime import timedelta, datetime
from pytz import timezone
from io import BytesIO
import pytz
import pandas as pd

router = APIRouter(prefix="/admin", tags=["Admin"])

WIB = timezone("Asia/Jakarta")
OVERDUE_LIMIT_HOURS = 2

def format_timedelta(duration: timedelta) -> str:
    total_seconds = int(duration.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes = remainder // 60
    return f"lewat {hours} jam {minutes} menit"

@router.post("/orders", response_model=schemas.OrderOut)
def create_order(order: schemas.OrderCreate, db: Session = Depends(auth.get_db), user=Depends(auth.get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, detail="Admin only")
    
    ref = db.query(models.ReferenceData).filter(models.ReferenceData.tid == order.tid).first()
    
    if not ref:
        raise HTTPException(404, detail=f"TID {order.tid} not found in reference data")
    
    new_order = models.Order(
        title=order.title,
        description=order.description,
        user_id=order.user_id,
        reference_id=ref.id
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    return new_order

@router.get("/orders", response_model=list[schemas.OrderOut])
def get_all_orders(db: Session = Depends(auth.get_db), user=Depends(auth.get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, detail="Admin only")

    now_wib = datetime.now(WIB)
    overdue_limit = timedelta(hours=OVERDUE_LIMIT_HOURS)
    orders = db.query(models.Order).all()
    result = []

    for o in orders:
        username = o.user.username if o.user else None
        overdue_duration = None
        reference_data = {
            "id": o.reference_data.id,
            "tid": o.reference_data.tid,
            "kc_supervisi": o.reference_data.kc_supervisi,
            "pengelola": o.reference_data.pengelola,
            "lokasi": o.reference_data.lokasi,
        } if o.reference_data else None

        # Update overdue state if needed (only if not completed)
        if not o.completed_at and o.state != models.OrderState.overdue:
            deadline = o.created_at + overdue_limit
            if o.created_at.tzinfo is None:
                deadline = WIB.localize(o.created_at) + overdue_limit
            if now_wib > deadline:
                o.state = models.OrderState.overdue
                db.add(o)
                db.commit()
                db.refresh(o)

        if o.completed_at:
            time_to_complete = o.completed_at - o.created_at
            if time_to_complete > overdue_limit:
                overdue_time = time_to_complete - overdue_limit
                overdue_duration = format_timedelta(overdue_time)

        order_dict = {
            "id": o.id,
            "title": o.title,
            "description": o.description,
            "state": o.state.value,
            "created_at": o.created_at,
            "completed_at": o.completed_at,
            "image_url": o.image_url,
            "user_id": o.user_id,
            "username": username,
            "overdue_duration": overdue_duration,
            "reference_id": o.reference_id,
            "reference_data": reference_data,
            
        }
        result.append(order_dict)

    return result

@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(auth.get_db), user=Depends(auth.get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, detail="Admin only")
    return db.query(models.User).filter(models.User.role == "user").all()

@router.get("/reference", response_model=list[schemas.ReferenceDataOut])
def list_reference(db: Session = Depends(auth.get_db), user=Depends(auth.get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, detail="Admin only")
    return db.query(models.ReferenceData).all()

@router.delete("/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(auth.get_db), user=Depends(auth.get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, detail="Admin only")
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(404, detail="Order not found")
    db.delete(order)
    db.commit()
    return {"detail": "Order deleted"}

@router.post("/orders/bulk-upload")
def bulk_create_orders(file: UploadFile = File(...), db: Session = Depends(auth.get_db), user=Depends(auth.get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, detail="Admin only")

    contents = file.file.read()
    try:
        df = pd.read_excel(BytesIO(contents), engine='openpyxl')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading Excel file: {e}")

    required_columns = {"TID", "Pengelola", "Status", "Est. Tgl. Problem"}
    if not required_columns.issubset(df.columns):
        raise HTTPException(status_code=400, detail=f"Missing columns. Required: {required_columns}")

    WIB = pytz.timezone("Asia/Jakarta")
    created_orders = []

    for _, row in df.iterrows():
        tid = str(row["TID"]).strip()
        pengelola = str(row["Pengelola"]).replace(" ", "").upper()  # normalize
        title = str(row["Status"]).strip()
        created_at = row["Est. Tgl. Problem"]

        if isinstance(created_at, str):
            try:
                created_at = datetime.strptime(created_at, "%d/%m/%Y %H:%M")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid date format for row with TID {tid}")

        created_at = WIB.localize(created_at)

        reference = db.query(models.ReferenceData).filter(models.ReferenceData.tid == tid).first()
        if not reference:
            continue  # Skip if no reference data found

        matched_user = db.query(models.User).filter(models.User.username == pengelola).first()
        if not matched_user:
            continue  # Skip if no user found

        new_order = models.Order(
            title=title,
            description="",
            user_id=matched_user.id,
            reference_id=reference.id,
            created_at=created_at
        )
        db.add(new_order)
        created_orders.append(new_order)

    db.commit()
    return {"detail": f"{len(created_orders)} orders created successfully."}