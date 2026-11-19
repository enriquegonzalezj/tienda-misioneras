"""
Comandos de terminal propios del proyecto.
Se ejecutan con: pipenv run flask <nombre-del-comando>
"""
import re
from datetime import datetime, timezone

import click
from sqlalchemy import select
from sqlalchemy.engine import make_url

from api.models import Order, User, db
from api.order_payments import set_paid
from api.passwords import ADMIN_MIN_LENGTH, hash_password, password_problem
from api.reservations import release_expired_reservations
from api.sample_data import load_sample_data, load_sample_shipping

# Bases en las que se permiten los comandos de prueba: solo la del propio equipo.
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

# Folio como sale en la tienda (MHP-000123) o solo el número (123).
FOLIO_PATTERN = re.compile(r"^(?:MHP-)?0*([0-9]{1,9})$", re.IGNORECASE)
STATUS_NAMES = {
    "pending": "pendiente de pago",
    "paid": "pagado",
    "shipped": "enviado",
    "delivered": "entregado",
    "cancelled": "cancelado",
}


def setup_commands(app):

    @app.cli.command("create-admin")
    @click.option("--email", prompt="Correo de la cuenta de administración")
    @click.option("--first-name", prompt="Nombre(s)")
    @click.option("--last-name", prompt="Apellidos")
    def create_admin(email, first_name, last_name):
        """Crea una cuenta de administración (tarea 1.5).

        Es la única forma de crear cuentas con rol admin: el registro público
        siempre crea cuentas de cliente. La contraseña se pide al ejecutarlo, sin
        mostrarla en pantalla, para que no quede en el historial de PowerShell.
        """
        email = email.strip().lower()
        first_name = first_name.strip()
        last_name = last_name.strip()

        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise click.ClickException("El correo no parece válido.")
        if not first_name or not last_name:
            raise click.ClickException("Nombre(s) y Apellidos son obligatorios.")
        if len(first_name) > 80 or len(last_name) > 80:
            raise click.ClickException("Nombre(s) y Apellidos admiten hasta 80 caracteres.")

        # Si el correo ya existe no se toca la cuenta: convertir en silencio
        # una cuenta de cliente en una de administración sería un riesgo.
        if db.session.scalar(select(User).where(User.email == email)):
            raise click.ClickException(f"Ya existe una cuenta con el correo {email}. No se cambió nada.")

        # Se repite hasta que la contraseña cumpla las reglas y las dos coincidan.
        while True:
            password = click.prompt(
                f"Contraseña (mínimo {ADMIN_MIN_LENGTH} caracteres; no se ve al escribir)",
                hide_input=True,
            )
            problem = password_problem(password, ADMIN_MIN_LENGTH, email=email)
            if problem:
                click.echo(problem)
                continue
            if click.prompt("Repite la contraseña", hide_input=True) != password:
                click.echo("Las contraseñas no coinciden. Vuelve a escribirla.")
                continue
            break

        admin = User(
            email=email,
            password_hash=hash_password(password),
            role="admin",
            first_name=first_name,
            last_name=last_name,
            is_active=True,
        )
        db.session.add(admin)
        db.session.commit()
        click.echo(f"Cuenta de administración creada: {email} (id {admin.id}).")

    def require_local():
        """Los comandos de prueba solo funcionan en local: FLASK_DEBUG=1 y la base
        en este equipo. Así nunca tocan la base de Render."""
        host = make_url(app.config["SQLALCHEMY_DATABASE_URI"]).host
        if not app.debug or host not in LOCAL_HOSTS:
            raise click.ClickException(
                "Este comando solo funciona en local (FLASK_DEBUG=1 y base en localhost). "
                "No se cambió nada."
            )

    @app.cli.command("seed-sample")
    def seed_sample():
        """Carga categorías y productos de ejemplo, sin fotos (tarea 3.2), y dos
        paqueterías de ejemplo con tarifas provisionales (tarea 4.5).

        Solo para desarrollar en local: se niega a ejecutarse si FLASK_DEBUG no
        es 1 o si la base no está en este equipo. Así nunca llegan productos
        inventados a la base de Render. Si ya existen, no los duplica.
        """
        require_local()

        categories, products, skipped = load_sample_data()
        click.echo(f"Categorías creadas: {categories}. Productos creados: {products}.")
        if skipped:
            click.echo(f"Ya existían {skipped} productos con el mismo slug: no se tocaron.")
        shipping = load_sample_shipping()
        click.echo(f"Paqueterías de ejemplo creadas: {shipping}.")

    @app.cli.command("mark-paid")
    @click.argument("folio")
    def mark_paid(folio):
        """Marca como pagado un pedido pendiente, para probar en local sin pasar
        por Mercado Pago (por ejemplo, el panel de pedidos).

        Solo en local, como seed-sample. Uso: flask mark-paid MHP-000123 (o 123).
        Solo acepta un pedido pendiente con la reserva vigente: las unidades ya
        están apartadas, así que pasa a pagado sin tocar existencias. Usa
        set_paid(), lo mismo que el webhook de Mercado Pago (tarea 4.6), pero
        sin datos de pago (mp_payment_id queda vacío).
        """
        require_local()

        match = FOLIO_PATTERN.match(folio.strip())
        if not match:
            raise click.ClickException("Escribe el folio como MHP-000123 o solo el número.")
        order_id = int(match.group(1))

        # Primero se cancelan las reservas vencidas, como en la tienda: así un
        # pedido vencido sale como cancelado y no se puede marcar.
        release_expired_reservations()

        order = db.session.scalar(select(Order).where(Order.id == order_id).with_for_update())
        if order is None:
            raise click.ClickException(f"No existe el pedido MHP-{order_id:06d}.")
        if order.status != "pending":
            reason = f" ({order.cancel_reason})" if order.cancel_reason else ""
            db.session.rollback()
            raise click.ClickException(
                f"El pedido MHP-{order.id:06d} está {STATUS_NAMES[order.status]}{reason}. "
                "Solo se marca un pedido pendiente de pago."
            )

        set_paid(order, datetime.now(timezone.utc))
        db.session.commit()
        click.echo(f"Pedido MHP-{order.id:06d} marcado como pagado (solo para pruebas en local).")
