from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from .models import Order, OrderState

def check_and_flag_overdue_orders(db: Session):
    now = datetime.utcnow()
    overdue_limit = now - timedelta(hours=2)

    overdue_orders = db.query(Order).filter(
        Order.state == OrderState.pending,
        Order.created_at < overdue_limit
    ).all()

    for order in overdue_orders:
        order.state = OrderState.overdue

    db.commit()