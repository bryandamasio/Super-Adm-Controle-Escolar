const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // As tabelas do sistema estão no schema privado `app`, não no schema padrão `public`.
    options: '-c search_path=app,public,extensions',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    // Keep the per-instance pool small on Vercel serverless functions.
    max: Number(process.env.DB_CONNECTION_LIMIT || (process.env.VERCEL ? 1 : 5)),
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000
});

function prepararSql(sql) {
    let indice = 0;
    return sql.replace(/\?/g, () => `$${++indice}`);
}

function erroCompativel(erro) {
    if (erro?.code === '23505') erro.code = 'ER_DUP_ENTRY';
    return erro;
}

async function executar(cliente, sql, params = []) {
    const comando = String(sql).trim().split(/\s+/)[0].toUpperCase();
    let consulta = prepararSql(sql);
    if (comando === 'INSERT' && !/\bRETURNING\b/i.test(consulta)) consulta += ' RETURNING id';
    try {
        const resultado = await cliente.query(consulta, params);
        if (['SELECT', 'WITH'].includes(comando)) return [resultado.rows];
        return [{
            affectedRows: resultado.rowCount,
            insertId: resultado.rows?.[0]?.id || null
        }];
    } catch (erro) {
        throw erroCompativel(erro);
    }
}

async function getConnection() {
    const cliente = await pool.connect();
    return {
        execute: (sql, params) => executar(cliente, sql, params),
        query: (sql, params) => executar(cliente, sql, params),
        beginTransaction: () => cliente.query('BEGIN'),
        commit: () => cliente.query('COMMIT'),
        rollback: () => cliente.query('ROLLBACK'),
        release: () => cliente.release()
    };
}

module.exports = {
    execute: (sql, params) => executar(pool, sql, params),
    query: (sql, params) => executar(pool, sql, params),
    getConnection,
    end: () => pool.end()
};
