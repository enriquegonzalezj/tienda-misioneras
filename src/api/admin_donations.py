"""
Donativos en el panel de administración (tarea 4.9).

  GET /api/admin/donations   lista, 25 por página, más recientes primero

Mismo patrón que Pedidos (admin_orders.py): filtros por estado con su número
(all por defecto, paid, pending), buscador por folio (DON-000123 o 123), nombre
o correo, y offset. Sin pantalla de detalle: cada donativo cabe en su renglón.
Arriba, lo recibido en total (suma de los pagados, antes de la comisión).

Aquí sí salen el nombre y el correo de quien dona: solo con sesión de
administración (@admin_required). Nunca el access_token ni datos de pago
salvo la comisión (mp_fee), que la congregación necesita para saber lo que
de verdad le llega.
"""
import re

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_, select

from api.admin_products import _like_pattern, _money
from api.auth import admin_required
from api.donations import _folio, donation_flags
from api.models import Donation, db
from api.utils import APIException

admin_donations = Blueprint("admin_donations", __name__)

PAGE_SIZE = 25  # como Pedidos
MAX_OFFSET = 100_000
SEARCH_MAX = 100

# Filtro de la lista -> estado guardado (None = todos). "cancelled" existe en
# la base, pero hoy nada cancela un donativo: no tiene filtro propio.
FILTERS = {"all": None, "paid": "paid", "pending": "pending"}
FOLIO_PATTERN = re.compile(r"^(?:DON-?)?0*([0-9]{1,9})$", re.IGNORECASE)


def _iso(value):
    return value.isoformat() if value else None


def _summary(donation):
    return {
        "id": donation.id,
        "folio": _folio(donation),
        "status": donation.status,
        **donation_flags(donation),
        "created_at": _iso(donation.created_at),
        "paid_at": _iso(donation.paid_at),
        "amount": _money(donation.amount),
        "fee": _money(donation.mp_fee) if donation.mp_fee is not None else None,
        "donor_name": donation.donor_name,
        "email": donation.email,
        "has_account": donation.user_id is not None,
    }


def _offset():
    raw = request.args.get("offset")
    if raw is None or raw == "":
        return 0
    if not raw.isdigit() or int(raw) > MAX_OFFSET:
        raise APIException("El parámetro offset no es válido.", status_code=400)
    return int(raw)


@admin_donations.route("/donations", methods=["GET"])
@admin_required
def list_donations():
    """Lista de donativos. Filtros opcionales: status (all, paid, pending),
    q (folio, nombre o correo) y offset."""
    conditions = []
    status_filter = request.args.get("status") or "all"
    if status_filter not in FILTERS:
        raise APIException("El estado pedido no es válido.", status_code=400)
    if FILTERS[status_filter] is not None:
        conditions.append(Donation.status == FILTERS[status_filter])

    search = (request.args.get("q") or "").strip()
    if len(search) > SEARCH_MAX:
        raise APIException("La búsqueda es demasiado larga.", status_code=400)
    if search:
        pattern = _like_pattern(search)
        matches = [
            Donation.donor_name.ilike(pattern, escape="\\"),
            Donation.email.ilike(pattern, escape="\\"),
        ]
        folio = FOLIO_PATTERN.match(search)
        if folio:
            matches.append(Donation.id == int(folio.group(1)))
        conditions.append(or_(*matches))

    offset = _offset()
    total = db.session.scalar(select(func.count()).select_from(Donation).where(*conditions))
    items = db.session.scalars(
        select(Donation)
        .where(*conditions)
        .order_by(Donation.created_at.desc(), Donation.id.desc())
        .limit(PAGE_SIZE)
        .offset(offset)
    ).all()

    by_status = dict(db.session.execute(select(Donation.status, func.count()).group_by(Donation.status)).all())
    counts = {
        name: (sum(by_status.values()) if status is None else by_status.get(status, 0))
        for name, status in FILTERS.items()
    }
    received = db.session.scalar(
        select(func.coalesce(func.sum(Donation.amount), 0)).where(Donation.status == "paid")
    )
    return jsonify({
        "total": total,
        "limit": PAGE_SIZE,
        "offset": offset,
        "counts": counts,
        "paid_total": _money(received),
        "items": [_summary(donation) for donation in items],
    })
