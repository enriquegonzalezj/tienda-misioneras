"""guia y fechas de envio del pedido

Tarea 5.5 (pedidos en el panel). Decisiones de Enrique del 14 nov:
- La congregación marca un pedido pagado como enviado y después como
  entregado. Cada paso guarda su fecha (shipped_at, delivered_at).
- El número de guía es opcional (tracking_number, hasta 60 caracteres). Si se
  escribe, la clienta lo ve en /pedido/<token>.
- Se puede volver un paso atrás por un error: se borra la fecha de ese paso.

Restricciones CHECK nuevas, para que ningún estado quede sin su fecha:
- pagado, enviado o entregado exige paid_at;
- enviado o entregado exige shipped_at;
- entregado exige delivered_at;
- la guía, si existe, no puede ser un texto en blanco (sin guía = NULL).

Escrita a mano: Alembic detecta las tres columnas, pero no las restricciones
CHECK nuevas en una tabla que ya existe. Los nombres van con op.f(), como en
b700dd08e63d, para que la convención de nombres de models.py no les vuelva a
poner el prefijo.

Todavía no hay pedidos pagados (Mercado Pago llega en la 4.6), ni en local ni
en Render: las restricciones nuevas no chocan con datos guardados.

Revision ID: 7a9d3a13141c
Revises: b700dd08e63d
Create Date: 2026-11-14 19:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7a9d3a13141c'
down_revision = 'b700dd08e63d'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tracking_number', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('shipped_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_check_constraint(
            op.f('ck_orders_paid_needs_date'),
            "status NOT IN ('paid', 'shipped', 'delivered') OR paid_at IS NOT NULL",
        )
        batch_op.create_check_constraint(
            op.f('ck_orders_shipped_needs_date'),
            "status NOT IN ('shipped', 'delivered') OR shipped_at IS NOT NULL",
        )
        batch_op.create_check_constraint(
            op.f('ck_orders_delivered_needs_date'),
            "status <> 'delivered' OR delivered_at IS NOT NULL",
        )
        batch_op.create_check_constraint(
            op.f('ck_orders_tracking_number_not_blank'),
            "btrim(tracking_number) <> ''",
        )


def downgrade():
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_orders_tracking_number_not_blank'), type_='check')
        batch_op.drop_constraint(op.f('ck_orders_delivered_needs_date'), type_='check')
        batch_op.drop_constraint(op.f('ck_orders_shipped_needs_date'), type_='check')
        batch_op.drop_constraint(op.f('ck_orders_paid_needs_date'), type_='check')
        batch_op.drop_column('delivered_at')
        batch_op.drop_column('shipped_at')
        batch_op.drop_column('tracking_number')
