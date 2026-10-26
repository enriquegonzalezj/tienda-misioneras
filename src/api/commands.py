"""
Comandos de terminal propios del proyecto.
Se ejecutan con: pipenv run flask <nombre-del-comando>
"""
import click
from sqlalchemy import select

from api.models import User, db
from api.passwords import ADMIN_MIN_LENGTH, hash_password, password_problem


def setup_commands(app):

    @app.cli.command("create-admin")
    @click.option("--email", prompt="Correo de la administradora")
    @click.option("--first-name", prompt="Nombre(s)")
    @click.option("--last-name", prompt="Apellidos")
    def create_admin(email, first_name, last_name):
        """Crea una cuenta de administradora (tarea 1.5).

        Es la única forma de crear administradoras: el registro público
        siempre crea clientas. La contraseña se pide al ejecutarlo, sin
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
        # a una clienta en administradora sería un riesgo.
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
        click.echo(f"Administradora creada: {email} (id {admin.id}).")
