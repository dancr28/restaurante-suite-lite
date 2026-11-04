


-- 1. Usuarios y Personal (Dann Admin y roles)
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) NULL,
    password VARCHAR(255) NULL,
    rol ENUM('admin', 'mesero', 'repartidor', 'cocina', 'empleado') NOT NULL DEFAULT 'mesero',
    pin VARCHAR(255) NOT NULL UNIQUE,
    huella_id INT NULL UNIQUE,
    telefono VARCHAR(50) DEFAULT NULL,
    puesto VARCHAR(50) DEFAULT 'Piso',
    sueldo_base DECIMAL(10,2) DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- 2. Asistencias, Tareas y Anuncios
CREATE TABLE IF NOT EXISTS asistencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    hora_entrada TIME NULL,
    hora_salida TIME NULL,
    estado_puntualidad VARCHAR(50) DEFAULT 'a_tiempo',
    pase_salida_autorizado BOOLEAN DEFAULT FALSE,
    tareas_completadas BOOLEAN DEFAULT FALSE,
    lat_entrada DECIMAL(10, 8) NULL,
    lng_entrada DECIMAL(11, 8) NULL,
    distancia_entrada_metros FLOAT NULL,
    UNIQUE KEY uq_asistencia (usuario_id, fecha),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tareas_empleados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    completada BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS anuncios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    mensaje TEXT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anuncios_leidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    anuncio_id INT NOT NULL,
    usuario_id INT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_anuncio_usuario (anuncio_id, usuario_id),
    FOREIGN KEY (anuncio_id) REFERENCES anuncios(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    sueldo_base DECIMAL(10,2) DEFAULT 0.00,
    propinas DECIMAL(10,2) DEFAULT 0.00,
    bonos DECIMAL(10,2) DEFAULT 0.00,
    deducciones DECIMAL(10,2) DEFAULT 0.00,
    total_pagado DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 3. Turnos de Caja y Movimientos
CREATE TABLE IF NOT EXISTS turnos_caja (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_apertura_id INT NULL,
    usuario_apertura_nombre VARCHAR(100) DEFAULT 'Cajero',
    usuario_cierre_id INT NULL,
    usuario_cierre_nombre VARCHAR(100) DEFAULT 'Cajero',
    monto_inicial DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    monto_final_real DECIMAL(10,2) DEFAULT NULL,
    monto_final_esperado DECIMAL(10,2) DEFAULT NULL,
    diferencia_descuadre DECIMAL(10,2) DEFAULT NULL,
    ventas_efectivo DECIMAL(10,2) DEFAULT 0.00,
    ventas_tarjeta DECIMAL(10,2) DEFAULT 0.00,
    ventas_transferencia DECIMAL(10,2) DEFAULT 0.00,
    total_pay_in DECIMAL(10,2) DEFAULT 0.00,
    total_pay_out DECIMAL(10,2) DEFAULT 0.00,
    total_propinas DECIMAL(10,2) DEFAULT 0.00,
    notas_apertura TEXT NULL,
    notas_cierre TEXT NULL,
    fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre DATETIME NULL,
    estado ENUM('abierto', 'cerrado') NOT NULL DEFAULT 'abierto',
    unica_caja_abierta INT AS (CASE WHEN estado='abierto' THEN 1 ELSE NULL END) PERSISTENT,
    UNIQUE KEY uq_caja_abierta(unica_caja_abierta)
);

CREATE TABLE IF NOT EXISTS movimientos_caja (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turno_id INT NOT NULL,
    usuario_nombre VARCHAR(100) DEFAULT 'Cajero',
    tipo ENUM('pay_in', 'pay_out') NOT NULL,
    monto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    motivo VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (turno_id) REFERENCES turnos_caja(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_tip_pool (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pool_date DATE NOT NULL UNIQUE,
    total_tips DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    waiters_percentage DECIMAL(5,2) DEFAULT 70.00,
    kitchen_percentage DECIMAL(5,2) DEFAULT 20.00,
    delivery_percentage DECIMAL(5,2) DEFAULT 10.00,
    shift_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_tip_distribution (
    id INT AUTO_INCREMENT PRIMARY KEY,
    daily_tip_pool_id INT NOT NULL,
    employee_id INT NOT NULL,
    shift_date DATE NOT NULL,
    hours_worked DECIMAL(5,2) NOT NULL,
    penalty_factor DECIMAL(5,2) DEFAULT 1.00,
    tip_amount_earned DECIMAL(10,2) NOT NULL,
    UNIQUE KEY (daily_tip_pool_id, employee_id, shift_date),
    FOREIGN KEY (daily_tip_pool_id) REFERENCES daily_tip_pool(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 4. Clientes y Secuencia de Turnos
CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL UNIQUE,
    direccion TEXT NOT NULL,
    referencias TEXT NULL
);

CREATE TABLE IF NOT EXISTS secuencia_turnos_dia (
    fecha DATE PRIMARY KEY,
    ultimo_turno INT NOT NULL DEFAULT 0
);

-- 5. Catálogo, Modificadores, Insumos y Recetas
CREATE TABLE IF NOT EXISTS categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#1E88E5',
    orden INT DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    categoria_id INT NULL,
    precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    costo DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sku VARCHAR(50) NULL,
    codigo_barras VARCHAR(100) NULL,
    modalidad_venta ENUM('unidad', 'peso') NOT NULL DEFAULT 'unidad',
    disponible_venta BOOLEAN DEFAULT TRUE,
    es_compuesto BOOLEAN DEFAULT FALSE,
    seguimiento_stock BOOLEAN DEFAULT FALSE,
    stock_actual DECIMAL(10,3) DEFAULT 0.000,
    stock_minimo DECIMAL(10,3) DEFAULT 0.000,
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS variantes_producto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    costo DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sku VARCHAR(50) NULL,
    stock_actual DECIMAL(10,3) DEFAULT 0.000,
    disponible BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS modificador_grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    obligatorio BOOLEAN DEFAULT FALSE,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS modificador_opciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    precio_extra DECIMAL(10,2) DEFAULT 0.00,
    disponible BOOLEAN DEFAULT TRUE,
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (grupo_id) REFERENCES modificador_grupos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS producto_modificador_grupos (
    producto_id INT NOT NULL,
    grupo_id INT NOT NULL,
    PRIMARY KEY (producto_id, grupo_id),
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (grupo_id) REFERENCES modificador_grupos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS insumos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    unidad_medida VARCHAR(20) DEFAULT 'pz',
    costo_unitario DECIMAL(10,2) DEFAULT 0.00,
    stock_actual DECIMAL(10,3) DEFAULT 0.000,
    merma_porcentaje DECIMAL(5,2) DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS recetas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT NOT NULL,
    insumo_id INT NOT NULL,
    cantidad DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    factor_merma DECIMAL(5,2) DEFAULT 0.00,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS descuentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo ENUM('porcentaje', 'monto') DEFAULT 'porcentaje',
    valor DECIMAL(10,2) DEFAULT 0.00,
    requiere_pin_admin BOOLEAN DEFAULT FALSE,
    activo BOOLEAN DEFAULT TRUE
);

-- 6. Mesas (Distribución 5, 5, 4)
CREATE TABLE IF NOT EXISTS mesas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    numero VARCHAR(20) NOT NULL,
    fila INT NOT NULL DEFAULT 1,
    posicion INT NOT NULL DEFAULT 1,
    estado ENUM('libre', 'ocupada', 'cuenta_pedida') DEFAULT 'libre'
);


INSERT IGNORE INTO mesas (id, numero, fila, posicion) VALUES 
(1, 'Mesa 1', 1, 1), (2, 'Mesa 2', 1, 2), (3, 'Mesa 3', 1, 3), (4, 'Mesa 4', 1, 4), (5, 'Mesa 5', 1, 5),
(6, 'Mesa 6', 2, 1), (7, 'Mesa 7', 2, 2), (8, 'Mesa 8', 2, 3), (9, 'Mesa 9', 2, 4), (10, 'Mesa 10', 2, 5),
(11, 'Mesa 11', 3, 1), (12, 'Mesa 12', 3, 2), (13, 'Mesa 13', 3, 3), (14, 'Mesa 14', 3, 4);

-- 7. Pedidos y Comandas
CREATE TABLE IF NOT EXISTS pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mesa_numero VARCHAR(50) NOT NULL,
    mesero VARCHAR(100) DEFAULT 'Mesero',
    mesero_secundario VARCHAR(100) NULL,
    numero_turno INT NULL,
    fecha_pago DATETIME NULL,
    propina DECIMAL(10,2) DEFAULT 0,
    pago_efectivo DECIMAL(10,2) DEFAULT 0,
    pago_tarjeta DECIMAL(10,2) DEFAULT 0,
    pago_transferencia DECIMAL(10,2) DEFAULT 0,
    motivo_reembolso TEXT NULL,
    usuario_reembolso_nombre VARCHAR(100) NULL,
    fecha_reembolso DATETIME NULL,
    monto_reembolsado DECIMAL(10,2) DEFAULT 0,
    mesa_abierta VARCHAR(50) AS (CASE WHEN estado IN ('abierto','pendiente') THEN mesa_numero ELSE NULL END) PERSISTENT,
    UNIQUE KEY uq_mesa_abierta(mesa_abierta),
    INDEX ix_pedidos_fecha(fecha_pago),
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    estado ENUM('abierto', 'pendiente', 'pagado', 'cancelado', 'reembolsado') DEFAULT 'abierto',
    tipo_servicio ENUM('comedor', 'para_llevar', 'delivery') DEFAULT 'comedor',
    estado_despacho ENUM('en_preparacion', 'en_camino', 'entregado') DEFAULT 'en_preparacion',
    cliente_nombre VARCHAR(100) NULL,
    cliente_telefono VARCHAR(50) NULL,
    direccion_entrega TEXT NULL,
    referencias_entrega TEXT NULL,
    metodo_pago VARCHAR(50) NULL,
    paga_con DECIMAL(10,2) DEFAULT 0.00,
    cambio DECIMAL(10,2) DEFAULT 0.00,
    turno_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (turno_id) REFERENCES turnos_caja(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pedido_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    producto_id INT NULL,
    nombre VARCHAR(150) NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    precio_unitario DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    modificadores TEXT NULL,
    notas TEXT NULL,
    numero_plato INT DEFAULT 1,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
);

-- 8. Configuración
CREATE TABLE IF NOT EXISTS configuracion (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL
);

INSERT INTO configuracion (clave, valor) VALUES 
('nombre_negocio', 'Restaurante LAB'),
('telefono', '')
ON DUPLICATE KEY UPDATE clave=VALUES(clave);



CREATE TABLE IF NOT EXISTS gastos_contabilidad (
 id INT AUTO_INCREMENT PRIMARY KEY, fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 categoria VARCHAR(80) NOT NULL, proveedor VARCHAR(255) NOT NULL, concepto TEXT NOT NULL,
 monto DECIMAL(10,2) NOT NULL, metodo_pago VARCHAR(50) NOT NULL,
 creado_por VARCHAR(100), origen VARCHAR(50), turno_id INT NULL, INDEX ix_gastos_fecha(fecha)
);

CREATE TABLE IF NOT EXISTS pedido_stock(pedido_id INT NOT NULL,tipo ENUM('insumo','producto') NOT NULL,recurso_id INT NOT NULL,cantidad DECIMAL(12,3) NOT NULL,PRIMARY KEY(pedido_id,tipo,recurso_id),FOREIGN KEY(pedido_id) REFERENCES pedidos(id));
