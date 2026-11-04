CREATE TABLE IF NOT EXISTS preparation_groups (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_preparation_groups (
    producto_id INT NOT NULL PRIMARY KEY,
    group_id VARCHAR(64) NOT NULL,

    CONSTRAINT fk_product_preparation_product
        FOREIGN KEY (producto_id)
        REFERENCES productos(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_product_preparation_group
        FOREIGN KEY (group_id)
        REFERENCES preparation_groups(id)
        ON DELETE RESTRICT
);

ALTER TABLE pedido_items
    ADD COLUMN IF NOT EXISTS kds_line_id VARCHAR(64) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_items_kds_line
    ON pedido_items(kds_line_id);

CREATE TABLE IF NOT EXISTS kds_screens (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,

    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 8080,

    secret_ciphertext TEXT NOT NULL,

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    verified_station_id VARCHAR(64) NULL,
    protocol_version INT NULL,

    last_health_at DATETIME NULL,
    last_health_ok BOOLEAN NOT NULL DEFAULT FALSE,
    last_pending_events INT NULL,

    last_send_at DATETIME NULL,
    last_error VARCHAR(500) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kds_delivery_jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    screen_id VARCHAR(64) NOT NULL,
    pedido_id INT NULL,

    order_id VARCHAR(128) NOT NULL,
    revision BIGINT NOT NULL,
    message_id VARCHAR(128) NOT NULL,

    payload LONGTEXT NOT NULL,

    status ENUM(
        'queued',
        'sending',
        'sent',
        'filtered',
        'duplicate',
        'stale',
        'failed',
        'blocked'
    ) NOT NULL DEFAULT 'queued',

    attempts INT NOT NULL DEFAULT 0,
    next_attempt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    result VARCHAR(40) NULL,
    last_error VARCHAR(500) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,

    UNIQUE KEY uq_kds_delivery_message (screen_id, message_id),

    INDEX ix_kds_delivery_queue (status, next_attempt),
    INDEX ix_kds_delivery_pedido (pedido_id),

    CONSTRAINT fk_kds_delivery_screen
        FOREIGN KEY (screen_id)
        REFERENCES kds_screens(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_kds_delivery_pedido
        FOREIGN KEY (pedido_id)
        REFERENCES pedidos(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS kds_processed_events (
    screen_id VARCHAR(64) NOT NULL,
    event_id VARCHAR(128) NOT NULL,

    sequence_number BIGINT NOT NULL,

    event_type VARCHAR(40) NOT NULL,
    order_id VARCHAR(128) NOT NULL,
    revision BIGINT NOT NULL,

    resolution VARCHAR(60) NOT NULL,

    payload LONGTEXT NOT NULL,

    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (screen_id, event_id),

    INDEX ix_kds_event_sequence (screen_id, sequence_number),

    CONSTRAINT fk_kds_events_screen
        FOREIGN KEY (screen_id)
        REFERENCES kds_screens(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kds_item_station_state (
    screen_id VARCHAR(64) NOT NULL,
    pedido_id INT NOT NULL,
    kds_line_id VARCHAR(64) NOT NULL,

    revision BIGINT NOT NULL,

    ready BOOLEAN NOT NULL DEFAULT FALSE,
    dispatched BOOLEAN NOT NULL DEFAULT FALSE,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (
        screen_id,
        pedido_id,
        kds_line_id
    ),

    INDEX ix_kds_item_pedido (pedido_id),

    CONSTRAINT fk_kds_state_screen
        FOREIGN KEY (screen_id)
        REFERENCES kds_screens(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_kds_state_pedido
        FOREIGN KEY (pedido_id)
        REFERENCES pedidos(id)
        ON DELETE CASCADE
);

INSERT IGNORE INTO schema_migrations(version)
VALUES ('003_kds');