CREATE TABLE IF NOT EXISTS preparation_groups (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO preparation_groups(id, nombre, activo)
VALUES
    ('cocina', 'Cocina', TRUE),
    ('bebidas', 'Bebidas', TRUE),
    ('postres', 'Postres', TRUE);

ALTER TABLE kds_screens
    ADD COLUMN IF NOT EXISTS preparation_group_id VARCHAR(64) NULL;

INSERT IGNORE INTO schema_migrations(version)
VALUES ('005_kds_screen_groups');
