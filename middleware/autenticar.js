const jwt = require('jsonwebtoken');

module.exports = function autenticar(req, res, next) {
    const cabecalho = req.headers.authorization || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

    if (!token) {
        return res.status(401).json({ erro: 'Autenticação necessária.' });
    }

    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }
};

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

module.exports.permitirPerfis = function permitirPerfis(...perfis) {
    return (req, res, next) => {
        if (!perfis.includes(req.usuario?.perfil)) {
            return res.status(403).json({ erro: 'Você não tem permissão para esta operação.' });
        }
        next();
    };
};

// Resolve a escola usada pela operação.
// Usuários comuns usam a escola do próprio cadastro.
// SUPER_ADMIN pode escolher uma escola pelo header X-Escola-Id.
module.exports.escolaContexto = function escolaContexto({ obrigatoria = true, somenteAtiva = true } = {}) {
    return async (req, res, next) => {
        try {
            const superAdmin = req.usuario?.perfil === 'SUPER_ADMIN';
            const informada = Number(req.headers['x-escola-id'] || 0);
            const escolaId = superAdmin ? informada : Number(req.usuario?.escola_id || 0);

            if (!escolaId) {
                if (obrigatoria) {
                    return res.status(400).json({ erro: 'Selecione uma escola para continuar.' });
                }
                req.escolaId = null;
                return next();
            }

            const [escolas] = await require('../config/database').execute(
                `SELECT id, nome, ativa, valor_mensal, vencimento_dia
                 FROM escolas
                 WHERE id = ?
                 LIMIT 1`,
                [escolaId]
            );

            const escola = escolas[0];

            if (!escola) {
                return res.status(404).json({ erro: 'Escola não encontrada.' });
            }

            if (somenteAtiva && !escola.ativa && !superAdmin) {
                return res.status(403).json({ erro: 'A escola está desativada. Procure o administrador do sistema.' });
            }

            req.escolaId = escola.id;
            req.escola = escola;
            next();
        } catch (erro) {
            console.error('❌ Erro ao resolver escola:', erro);
            res.status(500).json({ erro: 'Não foi possível validar a escola.' });
        }
    };
};
