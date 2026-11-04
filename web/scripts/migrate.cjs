const mysql =
  require('mysql2/promise');

const fs =
  require('node:fs');

const path =
  require('node:path');

const config =
  require('../config/env');


(async () => {

  if (
    config.db.database !==
    'restaurante_lab'
  ) {
    throw Error(
      'Sólo se migra restaurante_lab'
    );
  }


  const conn =
    await mysql.createConnection({
      ...config.db,
      multipleStatements: true,
    });


  let lockAcquired = false;


  try {

    const [[row]] =
      await conn.query(
        'SELECT GET_LOCK(?,10) AS locked',
        [
          'ops_lab_schema',
        ],
      );


    if (
      row.locked !== 1
    ) {
      throw Error(
        'Migración en curso'
      );
    }

    lockAcquired = true;


    await conn.query(`
      CREATE TABLE IF NOT EXISTS
        schema_migrations (
          version VARCHAR(80)
            NOT NULL,

          applied_at TIMESTAMP
            NULL
            DEFAULT CURRENT_TIMESTAMP,

          PRIMARY KEY (version)
        )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_general_ci
    `);


    const migrationsDir =
      path.join(
        __dirname,
        '../database',
      );


    const migrations =
      fs
        .readdirSync(
          migrationsDir,
        )
        .filter(
          (name) =>
            /^\d{3}_.+\.sql$/.test(
              name,
            ) &&
            name !==
              '001_initial.sql',
        )
        .sort();


    const [rows] =
      await conn.query(
        `SELECT version
         FROM schema_migrations`,
      );


    const applied =
      new Set(
        rows.map(
          (item) =>
            String(
              item.version,
            ),
        ),
      );


    for (
      const migration of migrations
    ) {

      const version =
        path.basename(
          migration,
          '.sql',
        );


      if (
        applied.has(
          version,
        )
      ) {
        console.log(
          'Migración ya aplicada:',
          migration,
        );

        continue;
      }


      const sql =
        fs.readFileSync(
          path.join(
            migrationsDir,
            migration,
          ),
          'utf8',
        );


      console.log(
        'Aplicando migración:',
        migration,
      );


      await conn.query(
        sql,
      );


      await conn.query(
        `INSERT INTO
           schema_migrations (
             version
           )
         VALUES (?)`,
        [
          version,
        ],
      );


      console.log(
        'Migración aplicada:',
        migration,
      );
    }


    console.log(
      'Base de datos actualizada correctamente'
    );

  } finally {

    if (
      lockAcquired
    ) {
      await conn.query(
        "SELECT RELEASE_LOCK('ops_lab_schema')",
      );
    }

    await conn.end();
  }

})().catch(
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
