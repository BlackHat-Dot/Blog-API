##
## ${message}
##

from alembic import op
import sqlalchemy as sa


def upgrade():
% for op in upgrade_ops:
    ${op}
% endfor


def downgrade():
% for op in downgrade_ops:
    ${op}
% endfor
