"""descuento de envio por campana

Tarea 4.8 (campañas de descuento). Decisiones de Enrique del 13 nov:
- El envío lleva su propio descuento, aparte del de los productos: el
  interruptor applies_to_shipping (que aplicaba al envío el mismo porcentaje)
  se cambia por shipping_discount_percent, de 1 a 100 (100 = envío gratis;
  vacío = no descuenta). Así una campaña puede dar envío gratis y otra no.
- El porcentaje de los productos queda de 1 a 99: al 100 % el producto
  costaría 0 y order_items exige unit_price > 0 (el pedido daría error).
- Una campaña de toda la tienda tiene que descontar algo en toda la tienda:
  porcentaje o envío.

Escrita a mano: Alembic detecta la columna nueva y la quitada, pero no las
restricciones CHECK nuevas ni las cambiadas en una tabla que ya existe. Los
nombres van con op.f(), como en las automáticas, para que la convención de
nombres de models.py no les vuelva a poner el prefijo.

Todavía no hay campañas guardadas (ni en local ni en Render): quitar
applies_to_shipping no pierde datos.

Revision ID: b700dd08e63d
Revises: 80152fe2cd34
Create Date: 2026-11-13 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b700dd08e63d'
down_revision = '80152fe2cd34'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('campaigns', schema=None) as batch_op:
        batch_op.add_column(sa.Column('shipping_discount_percent', sa.Integer(), nullable=True))
        batch_op.drop_column('applies_to_shipping')
        batch_op.drop_constraint(op.f('ck_campaigns_discount_percent_range'), type_='check')
        batch_op.create_check_constraint(
            op.f('ck_campaigns_discount_percent_range'), 'discount_percent BETWEEN 1 AND 99'
        )
        batch_op.create_check_constraint(
            op.f('ck_campaigns_shipping_discount_percent_range'),
            'shipping_discount_percent BETWEEN 1 AND 100',
        )
        batch_op.create_check_constraint(
            op.f('ck_campaigns_store_needs_discount'),
            "scope = 'selected' OR discount_percent IS NOT NULL OR shipping_discount_percent IS NOT NULL",
        )


def downgrade():
    # Al volver atrás, el interruptor queda encendido en las campañas que
    # descontaban el envío (con el porcentaje de los productos, como antes).
    with op.batch_alter_table('campaigns', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_campaigns_store_needs_discount'), type_='check')
        batch_op.drop_constraint(op.f('ck_campaigns_shipping_discount_percent_range'), type_='check')
        batch_op.drop_constraint(op.f('ck_campaigns_discount_percent_range'), type_='check')
        batch_op.create_check_constraint(
            op.f('ck_campaigns_discount_percent_range'), 'discount_percent BETWEEN 1 AND 100'
        )
        batch_op.add_column(sa.Column(
            'applies_to_shipping', sa.Boolean(), server_default=sa.text('false'), nullable=False
        ))
    op.execute("UPDATE campaigns SET applies_to_shipping = true WHERE shipping_discount_percent IS NOT NULL")
    with op.batch_alter_table('campaigns', schema=None) as batch_op:
        batch_op.drop_column('shipping_discount_percent')
