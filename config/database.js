const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    timezone: process.env.DB_TIMEZONE || '-03:00',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0
});

async function testarConexao() {
    try {
        const conexao = await pool.getConnection();
        await conexao.query('SELECT 1');
        console.log('✅ MySQL conectado com sucesso!');
        conexao.release();
    } catch (erro) {
        console.error('❌ Erro ao conectar no MySQL:', erro.message);
        console.error('   Verifique o arquivo .env e se o MySQL está iniciado.');
    }
}

if (process.env.NODE_ENV !== 'test') {
    testarConexao();
}

module.exports = pool;
