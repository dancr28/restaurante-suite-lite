CREATE TABLE IF NOT EXISTS preparation_group_categories (
    group_id VARCHAR(64) NOT NULL,
    categoria_id INT NOT NULL,

    PRIMARY KEY (group_id, categoria_id),

    CONSTRAINT fk_pgc_group
        FOREIGN KEY (group_id)
        REFERENCES preparation_groups(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_pgc_category
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(id)
        ON DELETE CASCADE
);

INSERT IGNORE INTO schema_migrations(version)
VALUES ('004_kds_groups');