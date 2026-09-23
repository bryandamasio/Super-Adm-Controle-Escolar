(function () {
    "use strict";

    // O Dashboard já possui o menu integrado.
    if (document.querySelector(".sidebar")) return;

    const isArquivos = /\/arquivos\//i.test(window.location.pathname);
    const base = isArquivos ? "../" : "";

    const menu = [
        { href: "dashboard.html", icon: "&#x1F3E0;", label: "Início", files: ["dashboard.html"] },
        { href: "alunos.html", icon: "&#x1F468;&#x200D;&#x1F393;", label: "Alunos", files: ["alunos.html"] },
        { href: "professores.html", icon: "&#x1F468;&#x200D;&#x1F3EB;", label: "Professores", files: ["professores.html", "professor.html"] },
        { href: "turmas.html", icon: "&#x1F3EB;", label: "Turmas", files: ["turmas.html"] },
        { href: "presenca.html", icon: "&#x1F4F1;", label: "Registrar presença", files: ["presenca.html"] }
    ];

    const controle = [
        { href: "ocorrencias.html", icon: "&#x26A0;&#xFE0F;", label: "Ocorrências", files: ["ocorrencias.html"] },
        { href: "relatorios.html", icon: "&#x1F4CA;", label: "Relatórios", files: ["relatorios.html"] },
        { href: "relatorios.html", icon: "&#x1F4CB;", label: "Histórico", files: ["relatorios.html"] }
    ];

    function itemHtml(item) {
        const current = window.location.pathname.split("/").pop().toLowerCase();

        // Apenas a página inicial mantém o destaque azul.
        // Nas páginas internas o menu permanece neutro.
        const active =
            item.href === "dashboard.html" &&
            current === "dashboard.html"
                ? " active"
                : "";
        return '<a href="' + base + item.href + '" class="global-menu-link' + active + '">' +
            '<span class="menu-icon">' + item.icon + '</span>' +
            '<span>' + item.label + '</span>' +
            '</a>';
    }

    const sidebar = document.createElement("aside");
    sidebar.className = "global-sidebar";
    sidebar.setAttribute("aria-label", "Menu principal");

    sidebar.innerHTML =
        '<div class="global-brand">' +
            '<img src="' + base + 'img/logo-escola.jpg" alt="Logo PEI - E.E Nello Lorenzon">' +
            '<div class="global-brand-text">' +
                '<strong>Controle Escolar</strong>' +
                '<span>Sistema de Presença</span>' +
            '</div>' +
        '</div>' +

        '<div class="global-menu-title">Principal</div>' +
        '<nav class="global-menu">' +
            menu.map(itemHtml).join("") +
            '<div class="global-menu-title">Controle</div>' +
            controle.map(itemHtml).join("") +
        '</nav>' +

        '<div class="global-sidebar-bottom">' +
            '<div class="global-school-status">' +
                '<span class="global-status-dot"></span>' +
                '<span>Sistema online</span>' +
            '</div>' +
        '</div>';

    document.body.classList.add("with-global-sidebar");
    document.body.insertBefore(sidebar, document.body.firstChild);
})();