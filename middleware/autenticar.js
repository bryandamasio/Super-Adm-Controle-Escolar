const jwt = require('jsonwebtoken');
const pool = require('../config/database');

async function autenticar(req, res, next) {
    const cabecalho = req.headers.authorization || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

    if (!token) {
        return res.status(401).json({ erro: 'Autenticação necessária.' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const [[usuario]] = await pool.execute(
            `SELECT id, nome, email, tipo, escola_id
             FROM usuarios
             WHERE id = ? AND ativo = 1
             LIMIT 1`,
            [payload.id]
        );

        if (!usuario) {
            return res.status(401).json({ erro: 'Usuário inativo ou não encontrado.' });
        }

        req.usuario = {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.tipo,
            escola_id: usuario.escola_id ? Number(usuario.escola_id) : null
        };
        return next();
    } catch (erro) {
        if (erro?.code && erro.code.startsWith('ER_')) return next(erro);
        return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }
}

module.exports = autenticar;

module.exports.apenasAdmin = function apenasAdmin(req, res, next) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.usuario?.perfil)) {
        return res.status(403).json({ erro: 'Apenas administradores podem realizar esta operação.' });
    }
    next();
};

module.exports.apenasSuperAdmin = function apenasSuperAdmin(req, res, next) {
    if (req.usuario?.perfil !== 'SUPER_ADMIN') {
        return res.status(403).json({ erro: 'Acesso exclusivo do Super Admin.' });
    }
    next();
};

module.exports.filtroEscola = function filtroEscola(req, alias = '') {
    if (req.usuario?.perfil === 'SUPER_ADMIN') return { sql: '', params: [] };
    const coluna = alias ? `${alias}.escola_id` : 'escola_id';
    return { sql: ` AND ${coluna} = ?`, params: [req.usuario.escola_id] };
};
