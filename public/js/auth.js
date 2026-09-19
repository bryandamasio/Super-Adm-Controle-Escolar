function tokenAtual() { return localStorage.getItem('token'); }

function usuarioAtual() {
    try { return JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { return null; }
}

function perfilAtual() { return usuarioAtual()?.perfil || ''; }
function ehSuperAdmin() { return perfilAtual() === 'SUPER_ADMIN'; }
function escolaSelecionadaId() { return Number(localStorage.getItem('escola_selecionada_id') || 0); }
function definirEscolaSelecionada(id, nome = '') {
    if (id) localStorage.setItem('escola_selecionada_id', String(id));
    else localStorage.removeItem('escola_selecionada_id');
    if (nome) localStorage.setItem('escola_selecionada_nome', nome);
}
function escolaSelecionadaNome() { return localStorage.getItem('escola_selecionada_nome') || usuarioAtual()?.escola_nome || ''; }

function cabecalhosAutenticados() {
    const token = tokenAtual();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (ehSuperAdmin() && escolaSelecionadaId()) headers['X-Escola-Id'] = String(escolaSelecionadaId());
    return headers;
}

async function exigirAutenticacao() {
    const resposta = await fetch('/api/auth/me', { headers: cabecalhosAutenticados() });
    if (!resposta.ok) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        window.location.href = 'login.html';
        return false;
    }
    const dados = await resposta.json().catch(() => null);
    if (dados?.usuario) localStorage.setItem('usuario', JSON.stringify(dados.usuario));
    return true;
}

function protegerPagina(perfisPermitidos = []) {
    return exigirAutenticacao().then(ok => {
        if (!ok) return false;
        if (perfisPermitidos.length && !perfisPermitidos.includes(perfilAtual())) {
            window.location.href = 'dashboard.html';
            return false;
        }
        return true;
    });
}

function aplicarTravaMenu() {
    const perfil = perfilAtual();
    document.querySelectorAll('[data-perfis]').forEach(el => {
        const permitidos = el.dataset.perfis.split(',').map(v => v.trim()).filter(Boolean);
        const autorizado = permitidos.length === 0 || permitidos.includes(perfil);
        el.hidden = !autorizado;
        el.setAttribute('aria-hidden', autorizado ? 'false' : 'true');
    });
}

function sair() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('escola_selecionada_id');
    localStorage.removeItem('escola_selecionada_nome');
    window.location.href = 'login.html';
}
