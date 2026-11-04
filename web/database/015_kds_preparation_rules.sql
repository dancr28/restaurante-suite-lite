/*
 * ============================================================
 * RESTAURANT SUITE
 * KDS · GRUPOS MULTIPLES + REGLAS DE PREPARACION
 * ============================================================
 *
 * Objetivos:
 *
 * 1. Una pantalla KDS puede escuchar varios grupos.
 * 2. Conservar compatibilidad con preparation_group_id.
 * 3. Crear reglas configurables por:
 *      - producto
 *      - categoria
 *      - grupo
 * 4. Permitir:
 *      - detail
 *      - simplify
 *      - group
 *      - transform
 *      - omit
 *
 * No modifica todavía el comportamiento del KDS.
 * Sólo crea la estructura de configuración.
 * ============================================================
 */


/*
 * ------------------------------------------------------------
 * GRUPOS ASIGNADOS A CADA PANTALLA
 * ------------------------------------------------------------
 */

CREATE TABLE IF NOT EXISTS kds_screen_groups (
    screen_id VARCHAR(64) NOT NULL,
    group_id VARCHAR(64) NOT NULL,

    created_at TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (
        screen_id,
        group_id
    ),

    INDEX ix_kds_screen_groups_group (
        group_id
    ),

    CONSTRAINT fk_kds_screen_groups_screen
        FOREIGN KEY (screen_id)
        REFERENCES kds_screens(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_kds_screen_groups_group
        FOREIGN KEY (group_id)
        REFERENCES preparation_groups(id)
        ON DELETE CASCADE
);


/*
 * Copiar automáticamente la configuración anterior.
 *
 * Si una pantalla tenía:
 *
 * preparation_group_id = 'plancha'
 *
 * ahora quedará también:
 *
 * kds_screen_groups:
 *   pantalla -> plancha
 *
 * De esta forma no se pierde la configuración actual.
 */

INSERT IGNORE INTO kds_screen_groups(
    screen_id,
    group_id
)
SELECT
    ks.id,
    ks.preparation_group_id
FROM kds_screens ks
INNER JOIN preparation_groups pg
    ON pg.id = ks.preparation_group_id
WHERE
    ks.preparation_group_id IS NOT NULL
    AND ks.preparation_group_id <> '';


/*
 * ------------------------------------------------------------
 * REGLAS DE PREPARACION
 * ------------------------------------------------------------
 */

CREATE TABLE IF NOT EXISTS kds_preparation_rules (
    id BIGINT
        NOT NULL
        AUTO_INCREMENT,

    nombre VARCHAR(120)
        NOT NULL,

    activo BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    prioridad INT
        NOT NULL
        DEFAULT 100,


    /*
     * --------------------------------------------------------
     * ORIGEN
     * --------------------------------------------------------
     *
     * product  = producto especifico
     * category = categoria
     * group    = grupo de preparacion original
     */

    source_type ENUM(
        'product',
        'category',
        'group'
    )
        NOT NULL,

    /*
     * Para producto/categoria se guarda el ID como texto.
     * Para grupo se guarda preparation_groups.id.
     *
     * La validacion real se realizará desde backend.
     */

    source_id VARCHAR(64)
        NOT NULL,


    /*
     * --------------------------------------------------------
     * DESTINO
     * --------------------------------------------------------
     *
     * Grupo/pantalla de preparación que recibirá el resultado.
     */

    target_group_id VARCHAR(64)
        NOT NULL,


    /*
     * --------------------------------------------------------
     * MODO
     * --------------------------------------------------------
     *
     * detail
     *   Comportamiento normal.
     *
     * simplify
     *   Producto sin información innecesaria.
     *
     * group
     *   Varias líneas se convierten en una sola preparación.
     *
     * transform
     *   Genera una preparación distinta.
     *
     * omit
     *   No mostrar en ese destino.
     */

    mode ENUM(
        'detail',
        'simplify',
        'group',
        'transform',
        'omit'
    )
        NOT NULL
        DEFAULT 'detail',


    /*
     * Clave interna para agrupación.
     *
     * Ejemplos:
     *
     * pellizcada-base
     * tortilla-birria
     * tortilla-menudo
     */

    output_key VARCHAR(100)
        NULL,


    /*
     * Texto mostrado en KDS.
     *
     * Ejemplos:
     *
     * PELLIZCADAS
     * TORTILLAS PARA BIRRIA
     */

    output_label VARCHAR(160)
        NULL,


    /*
     * Plantilla opcional.
     *
     * Ejemplo:
     *
     * TORTILLAS PARA {cantidad} ORDENES DE {producto}
     */

    output_template VARCHAR(255)
        NULL,


    /*
     * --------------------------------------------------------
     * CALCULO DE CANTIDAD
     * --------------------------------------------------------
     *
     * item_quantity
     *   usa cantidad del articulo
     *
     * sum
     *   suma todas las coincidencias
     *
     * multiply
     *   cantidad articulo * quantity_value
     *
     * fixed
     *   usa quantity_value
     */

    quantity_mode ENUM(
        'item_quantity',
        'sum',
        'multiply',
        'fixed'
    )
        NOT NULL
        DEFAULT 'item_quantity',

    quantity_value DECIMAL(10,3)
        NULL,


    /*
     * --------------------------------------------------------
     * INFORMACION VISIBLE
     * --------------------------------------------------------
     */

    show_variant BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    show_modifiers BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    show_notes BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    show_course BOOLEAN
        NOT NULL
        DEFAULT TRUE,


    /*
     * Para reglas transformadas/derivadas.
     *
     * Si TRUE:
     * no se muestra el producto original en ese destino.
     */

    hide_original BOOLEAN
        NOT NULL
        DEFAULT FALSE,


    created_at TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,


    PRIMARY KEY (id),

    INDEX ix_kds_rules_source (
        source_type,
        source_id,
        activo,
        prioridad
    ),

    INDEX ix_kds_rules_target (
        target_group_id,
        activo,
        prioridad
    ),

    CONSTRAINT fk_kds_rules_target_group
        FOREIGN KEY (target_group_id)
        REFERENCES preparation_groups(id)
        ON DELETE CASCADE
);


/*
 * ------------------------------------------------------------
 * EVITAR REGLAS DUPLICADAS IDENTICAS
 * ------------------------------------------------------------
 */

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_kds_rule_source_target_mode_key
ON kds_preparation_rules(
    source_type,
    source_id,
    target_group_id,
    mode,
    output_key
);


/*
 * ------------------------------------------------------------
 * REGISTRO DE MIGRACION
 * ------------------------------------------------------------
 */

INSERT IGNORE INTO schema_migrations(version)
VALUES ('015_kds_preparation_rules');
