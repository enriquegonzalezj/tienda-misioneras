"""direccion con quien recibe opcional

Tarea 4.4 (cuentas de cliente). En la dirección guardada, quién recibe pasa a
ser opcional, como en /pago: vacío = recibe la titular de la cuenta.
- addresses.phone se renombra a recipient_phone (es el teléfono de quien recibe).
- recipient_name y recipient_phone admiten vacío.
- Nuevo CHECK: van los dos o ninguno.

Escrita a mano: Alembic no detecta renombres de columnas (los genera como borrar
y crear, y se perderían los datos) ni restricciones CHECK nuevas en tablas que
ya existen. Los nombres van con op.f(), como en las automáticas, para que la
convención de nombres de models.py no les vuelva a poner el prefijo.

Revision ID: 80152fe2cd34
Revises: 216f765213ff
Create Date: 2026-11-12 20:10:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '80152fe2cd34'
down_revision = '216f765213ff'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('addresses', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_addresses_phone_format'), type_='check')
        batch_op.alter_column('phone', new_column_name='recipient_phone', nullable=True)
        batch_op.alter_column('recipient_name', nullable=True)
        batch_op.create_check_constraint(
            op.f('ck_addresses_recipient_phone_format'), "recipient_phone ~ '^[0-9]{10}$'"
        )
        batch_op.create_check_constraint(
            op.f('ck_addresses_recipient_complete'), '(recipient_name IS NULL) = (recipient_phone IS NULL)'
        )


def downgrade():
    # Para volver atrás, las direcciones sin quien recibe no caben (las columnas
    # vuelven a ser obligatorias): se borran antes. Hoy no hay ninguna en Render.
    op.execute("DELETE FROM addresses WHERE recipient_name IS NULL OR recipient_phone IS NULL")
    with op.batch_alter_table('addresses', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_addresses_recipient_complete'), type_='check')
        batch_op.drop_constraint(op.f('ck_addresses_recipient_phone_format'), type_='check')
        batch_op.alter_column('recipient_name', nullable=False)
        batch_op.alter_column('recipient_phone', new_column_name='phone', nullable=False)
        batch_op.create_check_constraint(op.f('ck_addresses_phone_format'), "phone ~ '^[0-9]{10}$'")
