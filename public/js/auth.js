function tokenAtual() {
    return localStorage.getItem('token');
}

function cabecalhosAutenticados() {
    const token = tokenAtual();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function exigirAutenticacao() {
    const resposta = await fetch('/api/auth/me', { headers: cabecalhosAutenticados() });
    if (!resposta.ok) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

function sair() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}
