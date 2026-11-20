"""orden de mercado pago en pedidos y donativos

Tarea 4.6, migración a la API de Orders de Mercado Pago (commit 119).
Decisión B de Enrique (19 nov): renombrar la columna en lugar de crear otra.

Con Orders, al pulsar "Pagar" se crea una orden de Mercado Pago (ORD...) en
lugar de una preferencia. La columna mp_preference_id pasa a llamarse
mp_order_id, en orders y en donations, con el mismo tipo (String(100)).

Escrita a mano: Alembic no detecta los renombres de columnas (los generaría
como borrar una columna y crear otra, y se perderían los datos).

Datos que ya hay: en Render ningún pedido ni donativo tiene preferencia (lo
desplegado es el commit 109, sin pagos). En local, el pedido MHP-000001 y el
donativo DON-000001 del plan B (20 nov) conservan su id de preferencia en
mp_order_id: siguen pagados, pero ese id no es de una orden, así que no se
pueden reembolsar desde el panel (son de prueba).

Revision ID: 93df31029044
Revises: 7a9d3a13141c
Create Date: 2026-11-20 18:30:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '93df31029044'
down_revision = '7a9d3a13141c'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('orders', 'mp_preference_id', new_column_name='mp_order_id')
    op.alter_column('donations', 'mp_preference_id', new_column_name='mp_order_id')


def downgrade():
    op.alter_column('donations', 'mp_order_id', new_column_name='mp_preference_id')
    op.alter_column('orders', 'mp_order_id', new_column_name='mp_preference_id')
