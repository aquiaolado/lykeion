/* lagenda: conta pessoal e «Para ti».
   Os gostos funcionam sem conta (ficam neste aparelho); com conta passam a valer em todos os aparelhos.
   Sinais: gostos escolhidos (categorias, bairros, salas e artistas seguidos), eventos guardados e eventos abertos.
   Artistas (3/11/2026): «Seguir» na página do artista; com conta, avisamos por email quando tiver data perto (gostos.onde =
   distritos; sem distritos, todo o país), pelo conta/alertas.php. */
(function () {
  "use strict";
  const B = (window.LG && LG.base) || "/", AC = (window.LG && LG.ac != null) ? LG.ac : "academia/", API = B + "conta/api.php";
  const LY = !!(window.LG && LG.ly);  // em lykeion.pt (5/11/2026): página da conta só com o que é do Lykeion; a conta é a mesma da Lagenda
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ler = (k, v) => { try { return JSON.parse(localStorage.getItem(k)) || v; } catch (_) { return v; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"], SEM = ["dom","seg","ter","qua","qui","sex","sáb"];
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dt = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
  const hoje = iso(new Date());
  const BAIRROS = ["Ajuda","Alcântara","Alvalade","Areeiro","Arroios","Avenidas Novas","Beato","Belém","Benfica","Campo de Ourique","Campolide","Carnide","Estrela","Lumiar","Marvila","Misericórdia","Olivais","Parque das Nações","Penha de França","Santa Clara","Santa Maria Maior","Santo António","São Domingos de Benfica","São Vicente"];

  let conta = null, servidor = false, google = null;
  let gostos = Object.assign({ cats: [], bairros: [], salas: [], artistas: [], onde: [], avisos: true, livre: false }, ler("lagenda-gostos", {}));
  const post = (dados) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json", "X-Lagenda": "1" }, credentials: "same-origin", body: JSON.stringify(dados) })
    .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.erro || "Erro"); return j; }));

  // ---- convite de amigo: …/conta.html#amigo-CODIGO (fica guardado até entrar) ----
  const mc = /^#amigo-([A-Za-z0-9]{6,12})$/.exec(location.hash);
  if (mc) gravar("lagenda-convite", mc[1]);

  // ---- sinais vindos das páginas ----
  const art = document.querySelector("[data-ev-cat]");
  if (art) { // evento aberto: conta para o gosto
    const v = ler("lagenda-vistos", { cats: {}, salas: {} });
    const c = art.dataset.evCat, l = art.dataset.evLugar;
    if (c) v.cats[c] = (v.cats[c] || 0) + 1; if (l) v.salas[l] = (v.salas[l] || 0) + 1;
    gravar("lagenda-vistos", v);
  }

  function gravarGostos() {
    gravar("lagenda-gostos", gostos);
    if (conta) return post({ acao: "gostos", gostos, newsletter: conta.newsletter }).catch(() => {});
    return Promise.resolve();
  }

  // ---- seguir sala ----
  document.querySelectorAll("[data-seguir]").forEach(b => {
    const id = b.dataset.seguir, marca = () => { const on = gostos.salas.includes(id); b.setAttribute("aria-pressed", on); b.textContent = on ? "A seguir" : "Seguir esta sala"; };
    marca();
    b.addEventListener("click", () => { gostos.salas = gostos.salas.includes(id) ? gostos.salas.filter(x => x !== id) : gostos.salas.concat(id); marca(); gravarGostos(); });
  });

  // ---- seguir artista (páginas artistas/…) ----
  function seguirArtistas() {
    document.querySelectorAll("[data-seguir-artista]").forEach(b => {
      const id = b.dataset.seguirArtista, aviso = document.getElementById("avisoseguir");
      const marca = (mudou) => {
        const on = gostos.artistas.includes(id); b.setAttribute("aria-pressed", on); b.textContent = on ? "A seguir ✓" : "Seguir";
        if (!aviso) return;
        if (!on) { aviso.innerHTML = mudou ? "Deixaste de seguir." : ""; return; }
        const onde = (gostos.onde || []).length ? gostos.onde.join(", ") : "todo o país";
        aviso.innerHTML = !servidor ? "A seguir neste aparelho." :
          !conta ? `A seguir neste aparelho. <a href="${B}conta.html">Entra com o teu email</a> para receberes um aviso quando ${esc(b.dataset.nome)} tiver data perto de ti.` :
          gostos.avisos === false ? `A seguir. Os avisos por email estão desligados: <a href="${B}conta.html#artistas">ligar</a>.` :
          `A seguir. Avisamos-te por email quando houver data nova em ${esc(onde)}. <a href="${B}conta.html#artistas">Mudar</a>`;
      };
      marca(false);
      if (!b.dataset.ligado) { b.dataset.ligado = "1"; b.addEventListener("click", () => { gostos.artistas = gostos.artistas.includes(id) ? gostos.artistas.filter(x => x !== id) : gostos.artistas.concat(id); marca(true); gravarGostos(); }); }
    });
  }
  seguirArtistas();

  // ---- Lykeion (4/11/2026): seguir instituições e áreas (páginas academia/…); avisos e newsletter de segunda (conta/lykeion.php) ----
  // 8/11/2026: completa o objeto no próprio sítio (antes criava um novo a cada chamada, e quem guardava uma referência ficava a mexer numa cópia)
  const lyk = () => {
    const g = gostos.lyk = (gostos.lyk && typeof gostos.lyk === "object") ? gostos.lyk : {};
    ["inst", "areas", "listas", "series", "pesquisas", "ecos"].forEach(k => { if (!Array.isArray(g[k])) g[k] = []; });
    g.menos = (g.menos && typeof g.menos === "object") ? g.menos : {};
    ["tipos", "inst", "areas"].forEach(k => { if (!Array.isArray(g.menos[k])) g.menos[k] = []; });
    return g;
  };
  // «Mais disto / menos disto» (7/11/2026, ideia do Paulo): na página do evento, «+» segue a área ou a instituição e «−» esconde
  // o tipo, a instituição ou a área. Transparente: tudo fica em «O que vejo» (conta) e desfaz-se. Seguir e esconder excluem-se.
  function menosLykeion() {
    document.querySelectorAll("[data-menos-tipo],[data-menos-inst],[data-menos-area]").forEach(b => {
      const k = b.dataset.menosTipo ? "tipos" : b.dataset.menosInst ? "inst" : "areas", id = b.dataset.menosTipo || b.dataset.menosInst || b.dataset.menosArea;
      const aviso = document.getElementById("avisoseguir");
      b.setAttribute("aria-pressed", lyk().menos[k].includes(id));
      if (b.dataset.ligado) return;
      b.dataset.ligado = "1";
      b.addEventListener("click", () => {
        const g = lyk(), on = !g.menos[k].includes(id);
        g.menos[k] = on ? g.menos[k].concat(id) : g.menos[k].filter(x => x !== id);
        if (on && k !== "tipos") g[k] = g[k].filter(x => x !== id);  // esconder deixa de seguir
        gravarGostos(); seguirLykeion();
        if (aviso) aviso.innerHTML = on ? `Feito: «${esc(b.textContent.replace(/^[−+]\s*/, ""))}» deixa de aparecer na entrada, na agenda e nos emails. <a href="${B}conta.html#lykeion">O que vejo</a>` : "Volta a aparecer.";
        document.dispatchEvent(new CustomEvent("lykeion:gostos"));
      });
    });
  }
  function seguirLykeion() {
    menosLykeion();
    document.querySelectorAll("[data-seguir-inst],[data-seguir-area],[data-seguir-lista],[data-seguir-serie]").forEach(b => {
      const k = b.dataset.seguirInst ? "inst" : b.dataset.seguirLista ? "listas" : b.dataset.seguirSerie ? "series" : "areas", id = b.dataset.seguirInst || b.dataset.seguirLista || b.dataset.seguirSerie || b.dataset.seguirArea, aviso = document.getElementById("avisoseguir");
      const marca = (mudou) => {
        const on = lyk()[k].includes(id); b.setAttribute("aria-pressed", on);
        if (b.classList.contains("bt")) b.textContent = on ? "A seguir ✓" : "Seguir";  // as fichas de área (.ch) guardam o nome
        if (!aviso || (!mudou && !on)) return;
        aviso.innerHTML = !on ? "Deixou de seguir." : !servidor ? "A seguir neste aparelho." :
          !conta ? `A seguir neste aparelho. <a href="${B}conta.html#lykeion">Entre com o seu email</a> para receber um aviso quando houver eventos novos e, à segunda, a semana académica.` :
          `A seguir. Avisamos por email dos eventos novos e, à segunda, mandamos a semana académica. <a href="${B}conta.html#lykeion">Mudar</a>`;
      };
      marca(false);
      if (!b.dataset.ligado) { b.dataset.ligado = "1"; b.addEventListener("click", () => {
        const g = lyk(); g[k] = g[k].includes(id) ? g[k].filter(x => x !== id) : g[k].concat(id);
        if (g[k].includes(id) && g.menos[k]) g.menos[k] = g.menos[k].filter(x => x !== id);  // seguir deixa de esconder
        marca(true); gravarGostos(); menosLykeion(); document.dispatchEvent(new CustomEvent("lykeion:gostos")); }); }
    });
  }
  seguirLykeion();
  // «Avise-me» (7/11/2026): guardar uma pesquisa da entrada (texto e filtros); os eventos novos que lhe cabem chegam por email
  const chavePq = p => JSON.stringify(["q", "fa", "sub", "area", "inst", "dist"].map(k => p[k] || ""));
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-avise]"); if (!b) return;
    let p; try { p = JSON.parse(b.dataset.avise); } catch (_) { return; }
    const g = lyk(), k = chavePq(p), ja = g.pesquisas.some(x => chavePq(x) === k);
    g.pesquisas = ja ? g.pesquisas.filter(x => chavePq(x) !== k) : g.pesquisas.concat(p).slice(-20);
    gravarGostos(); document.dispatchEvent(new CustomEvent("lykeion:gostos"));
    b.setAttribute("aria-pressed", !ja); b.textContent = ja ? "Avise-me de eventos novos" : "Aviso ligado ✓";
    const r = document.getElementById("aaviso");
    if (r) r.innerHTML = ja ? "Aviso desligado." : !conta ? `Guardado neste aparelho. <a href="${B}conta.html#lykeion">Entre com o seu email</a> para receber os eventos novos desta pesquisa.` :
      `Feito: quando entrar um evento novo com esta pesquisa, avisamos por email. <a href="${B}conta.html#lykeion">As minhas pesquisas</a>`;
  });
  window.LG = Object.assign(window.LG || {}, { lykPesquisaGuardada: p => lyk().pesquisas.some(x => chavePq(x) === chavePq(p)) });
  // «O que sigo»: séries e pesquisas guardadas, com os nomes (do academia.json) e um × para desfazer
  function pintaSegue() {
    const cx = document.getElementById("lyksegue"); if (!cx) return;
    const g = lyk();
    if (!g.series.length && !g.pesquisas.length) { cx.innerHTML = '<p class="sub">Nenhuma série nem pesquisa guardada. Numa série de seminários, «+ Série» segue-a toda; numa pesquisa, «Avise-me» manda os eventos novos.</p>'; return; }
    const desenha = N => {
      const nPq = p => [p.q ? "«" + p.q + "»" : "", ...["fa", "sub", "area", "inst", "dist"].map(k => p[k] ? ((N[k] || {})[p[k]] || p[k]) : "")].filter(Boolean).join(" · ");
      cx.innerHTML = (g.series.length ? '<p class="sub">Séries de seminários:</p><p class="lin">' + g.series.map(x => `<button class="ch" type="button" data-tirar-segue="series|${esc(x)}" title="Deixar de seguir">${esc((N.series || {})[x] || x.split("~").pop().replace(/-/g, " "))} ×</button>`).join(" ") + "</p>" : "") +
        (g.pesquisas.length ? '<p class="sub">Pesquisas com aviso:</p><p class="lin">' + g.pesquisas.map((p, n) => `<button class="ch" type="button" data-tirar-segue="pesquisas|${n}" title="Desligar o aviso">${esc(nPq(p))} ×</button>`).join(" ") + "</p>" : "");
    };
    desenha({});
    fetch(B + "academia.json").then(r => r.json()).then(D => desenha({ series: D.series || {},
      fa: Object.fromEntries(D.familias), sub: Object.fromEntries(D.subtipos.map(([s, n]) => [s, n])), inst: Object.fromEntries(Object.entries(D.inst).map(([i, r]) => [i, r[1] || r[0]])),
      area: Object.assign(Object.fromEntries(D.areas), Object.fromEntries(D.finas.map(([s, n]) => [s, n]))) })).catch(() => {});
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-tirar-segue]"); if (!b) return;
    ev.preventDefault();
    const [k, x] = b.dataset.tirarSegue.split("|"), g = lyk();
    g[k] = k === "pesquisas" ? g.pesquisas.filter((_, n) => String(n) !== x) : g[k].filter(y => y !== x);
    gravarGostos(); pintaSegue(); document.dispatchEvent(new CustomEvent("lykeion:gostos"));
  });
  // «O que vejo»: a lista do que a pessoa escondeu, com os nomes (do academia.json) e um × para desfazer
  function pintaMenos() {
    const cx = document.getElementById("lykmenos"); if (!cx) return;
    const m = lyk().menos, todos = [].concat(m.tipos.map(x => ["tipos", x]), m.inst.map(x => ["inst", x]), m.areas.map(x => ["areas", x]));
    if (!todos.length) { cx.innerHTML = '<p class="sub">Não escondeu nada. Na página de cada evento, «Afinar o que vejo» deixa esconder um tipo, uma instituição ou uma área.</p>'; return; }
    const desenha = N => {
      cx.innerHTML = '<p class="sub">Escondido na entrada, na agenda e nos emails:</p><p class="lin">' + todos.map(([k, x]) =>
        `<button class="ch" type="button" data-tirar-menos="${k}|${esc(x)}" title="Voltar a mostrar">${esc((N[k] || {})[x] || x)} ×</button>`).join(" ") + "</p>";
    };
    desenha({});
    fetch(B + "academia.json").then(r => r.json()).then(D => desenha({
      tipos: Object.fromEntries(D.subtipos.map(([s, n]) => [s, n])), inst: Object.fromEntries(Object.entries(D.inst).map(([i, r]) => [i, r[0]])),
      areas: Object.assign(Object.fromEntries(D.areas), Object.fromEntries(D.finas.map(([s, n]) => [s, n]))) })).catch(() => {});
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-tirar-menos]"); if (!b) return;
    ev.preventDefault();
    const [k, x] = b.dataset.tirarMenos.split("|"), g = lyk(); g.menos[k] = g.menos[k].filter(y => y !== x);
    gravarGostos(); pintaMenos(); document.dispatchEvent(new CustomEvent("lykeion:gostos"));
  });
  function lykeionEditor(c) {
    const g = lyk(), n = g.inst.length + g.areas.length + g.listas.length;
    return `<h2 id="lykeion">${LY ? "O que segue" : "Lykeion: a agenda da ciência"}</h2><p class="sub">${n ? `Segue ${g.inst.length} ${g.inst.length === 1 ? "instituição" : "instituições"}, ${g.areas.length} ${g.areas.length === 1 ? "área" : "áreas"} e ${g.listas.length} ${g.listas.length === 1 ? "lista" : "listas"}. ` : "Ainda não segue nenhuma instituição nem área. "}` +
      `<a href="${B}${AC}instituicoes/">Escolher instituições</a> · <a href="${B}${AC}listas/">escolher listas e áreas</a>${LY ? ` · <a href="${B}${AC}a-minha-area/">A minha área</a> (ecossistemas e disposição)` : ""}</p>` +
      `<h3>Séries e pesquisas</h3><div id="lyksegue"></div>` + `<h3>O que não quero ver</h3><div id="lykmenos"></div>` + (setTimeout(() => { pintaMenos(); pintaSegue(); }, 0), "") +
      (c ? `<label class="chk"><input type="checkbox" id="glyka"${g.avisos === false ? "" : " checked"}> Avisar-me por email dos eventos novos do que sigo</label>
      <label class="chk"><input type="checkbox" id="glyks"${g.semanal === false ? "" : " checked"}> Receber à segunda-feira a semana académica <a href="${B}conta/lykeion.php?ver" target="_blank" rel="noopener">(ver)</a></label>` : "");
  }

  // ---- ecossistemas da pessoa e «A minha área» (8/11/2026, pedido do Paulo) ----
  // Um ecossistema é uma lista sua de instituições («Sociologia em Portugal»). Pode partir de uma área fina (base: os centros que a
  // sociedade científica indica, academia.json → ia) e a pessoa junta (inst) ou tira (fora) à vontade. Os eventos de todas contam
  // como seguidos: entrada, «A minha área» e emails (conta/lykeion.php).
  let ACD = null;
  const acd = () => ACD || (ACD = fetch(B + "academia.json").then(r => r.ok ? r.json() : Promise.reject()).catch(e => { ACD = null; throw e; }));
  const ecos = () => { const es = lyk().ecos; es.forEach(e => { e.base = e.base || ""; if (!Array.isArray(e.inst)) e.inst = []; if (!Array.isArray(e.fora)) e.fora = []; }); return es; };
  const ecoId = () => "e" + Date.now().toString(36);
  // a instituição i (ou uma das mães) está no ecossistema?
  const ecoTem = (ec, i, D) => {
    for (let k = 0, x = i; x && k < 7; k++, x = (D.pais || {})[x]) {
      if (ec.fora.includes(x)) return false;
      if (ec.inst.includes(x) || (ec.base && ((D.ia || {})[x] || []).includes(ec.base))) return true;
    }
    return false;
  };
  // as instituições que o ecossistema tem diretamente (sem contar as unidades de cada uma)
  const ecoMembros = (ec, D) => Object.keys(D.inst).filter(i => !ec.fora.includes(i) && (ec.inst.includes(i) || (ec.base && ((D.ia || {})[i] || []).includes(ec.base))));
  const ecoEv = (ec, e, D) => ecoTem(ec, e.in, D) || (ec.base && (e.af || []).includes(ec.base) && !(e.in && ec.fora.some(f => ecoTem({ base: "", inst: [f], fora: [] }, e.in, D))));
  const fina = (D, s) => ((D.finas || []).find(f => f[0] === s) || [])[1] || s;
  const mudou = () => { gravarGostos(); document.dispatchEvent(new CustomEvent("lykeion:gostos")); };

  // o menu «+ Ao meu ecossistema» na página da instituição
  function menuEco(b) {
    const cx = b.parentNode.parentNode.querySelector(".lyk-eco-menu"); if (!cx) return;
    const i = b.dataset.ecoInst, nome = b.dataset.nome, areas = (b.dataset.areas || "").split("|").filter(Boolean);
    const dentro = ec => !ec.fora.includes(i) && (ec.inst.includes(i) || (!!ec.base && areas.includes(ec.base)));
    const desenha = D => {
      const es = ecos(), sem = areas.filter(a => !es.some(ec => ec.base === a));
      cx.innerHTML = `<p class="sub">Juntar ${esc(nome)} a um ecossistema seu. Os eventos de todas as instituições do ecossistema aparecem na <a href="${B}${AC}a-minha-area/">sua área</a> e nos avisos.</p>` +
        es.map((ec, n) => `<label class="chk"><input type="checkbox" data-eco-n="${n}"${dentro(ec) ? " checked" : ""}> <span><b>${esc(ec.nome)}</b> <small class="sub">${ec.base ? "parte dos centros de " + esc(fina(D, ec.base).toLowerCase()) + (ec.inst.length ? ` · mais ${ec.inst.length} ${ec.inst.length === 1 ? "sua" : "suas"}` : "") : ec.inst.length + (ec.inst.length === 1 ? " instituição" : " instituições")}</small></span></label>`).join("") +
        sem.map(a => `<p><button class="ch" type="button" data-eco-cria-base="${esc(a)}">+ Criar «${esc(fina(D, a))} em Portugal», com os centros da área</button></p>`).join("") +
        `<form class="linha lyk-eco-novo"><label class="vis" for="ecnovo">Novo ecossistema</label><input id="ecnovo" maxlength="80" placeholder="Novo ecossistema, por exemplo «Estudos urbanos»"><button class="bt">Criar</button></form>`;
    };
    const abre = !cx.hidden ? false : true;
    cx.hidden = !abre; b.setAttribute("aria-expanded", abre);
    if (!abre) return;
    cx.innerHTML = '<p class="sub">A carregar…</p>';
    acd().catch(() => ({ finas: [] })).then(D => {
      desenha(D);
      if (cx.dataset.ligado) return; cx.dataset.ligado = "1";
      cx.addEventListener("change", ev => {
        const c = ev.target.closest("[data-eco-n]"); if (!c) return;
        const ec = ecos()[+c.dataset.ecoN], pelaBase = !!ec.base && areas.includes(ec.base);
        if (c.checked) { ec.fora = ec.fora.filter(x => x !== i); if (!pelaBase && !ec.inst.includes(i)) ec.inst.push(i); }
        else { ec.inst = ec.inst.filter(x => x !== i); if (pelaBase && !ec.fora.includes(i)) ec.fora.push(i); }
        mudou(); desenha(D); aviso(`${c.checked ? "Juntou" : "Tirou"} ${nome} ${c.checked ? "a" : "de"} «${ec.nome}».`);
      });
      cx.addEventListener("click", ev => {
        const c = ev.target.closest("[data-eco-cria-base]"); if (!c) return;
        const a = c.dataset.ecoCriaBase; ecos().push({ id: ecoId(), nome: fina(D, a) + " em Portugal", base: a, inst: [], fora: [] });
        mudou(); desenha(D); aviso(`Criou «${fina(D, a)} em Portugal», com ${esc(nome)} e os outros centros da área.`);
      });
      cx.addEventListener("submit", ev => {
        ev.preventDefault(); const inp = cx.querySelector("#ecnovo"), n = inp.value.trim(); if (!n) { inp.focus(); return; }
        ecos().push({ id: ecoId(), nome: n.slice(0, 80), base: "", inst: [i], fora: [] });
        mudou(); desenha(D); aviso(`Criou «${esc(n)}» com ${esc(nome)}. Junte mais instituições na página de cada uma.`);
      });
    });
    function aviso(t) { const a = document.getElementById("avisoseguir"); if (a) a.innerHTML = t + ` <a href="${B}${AC}a-minha-area/">Ver na minha área</a>` + (!conta && servidor ? ` · <a href="${B}conta.html">Entre</a> para o ter em todos os aparelhos e receber avisos.` : ""); }
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-eco-inst]"); if (b) { menuEco(b); return; }
    const a = ev.target.closest("[data-eco-base]"); if (!a) return;
    const es = ecos(), base = a.dataset.ecoBase, ja = es.find(ec => ec.base === base);
    if (!ja) { es.push({ id: ecoId(), nome: a.dataset.nome, base, inst: [], fora: [] }); mudou(); }
    a.outerHTML = `<a class="bt" href="${B}${AC}a-minha-area/">${ja ? "Já tem «" + esc(ja.nome) + "»" : "Criado ✓"}: abrir na minha área</a>`;
  });
  // nas páginas de área: quem já tem o ecossistema vê logo a ligação
  document.querySelectorAll("[data-eco-base]").forEach(a => { const ja = ecos().find(ec => ec.base === a.dataset.ecoBase); if (ja) a.textContent = "O meu ecossistema: «" + ja.nome + "»"; });

  const BLOCOS = [["prox", "Próximos do que sigo"], ["ecos", "Os meus ecossistemas"], ["inst", "Instituições que sigo"], ["areas", "Áreas e listas"],
                  ["guard", "Guardados"], ["pesq", "Séries e pesquisas com aviso"], ["avisos", "Avisos por email"], ["menos", "O que não quero ver"]];
  const DISP0 = { ordem: BLOCOS.map(b => b[0]), largos: ["prox", "ecos"], esc: [] };
  // 9/11/2026 (Paulo: «o guardados não aparece dentro de a minha área? tem muitos itens lá!»): separadores em vez de oito blocos seguidos
  const SEPS = [["guard", "Guardados", ["guard"]], ["segue", "O que sigo", ["porta", "prox", "inst", "areas"]], ["ecos", "Ecossistemas", ["ecos"]], ["avisos", "Avisos e email", ["avisos", "pesq", "menos"]]];
  BLOCOS.splice(0, 0, ["porta", "As escolhas da entrada"]); DISP0.ordem.unshift("porta");
  let editar = false, proxTodos = false, maSep = /^#(guardados|guard)$/.test(location.hash) ? "guard" : ler("lyk-ma-sep", "");
  function minhaArea() {
    const raiz = document.getElementById("minhaarea"); if (!raiz) return;
    acd().then(D => {
      const g = lyk(), es = ecos(), disp = Object.assign({}, DISP0, g.disp && (g.disp.ordem || []).length ? g.disp : {});
      const ordem = disp.ordem.filter(k => BLOCOS.some(b => b[0] === k)).concat(BLOCOS.map(b => b[0]).filter(k => !disp.ordem.includes(k)));
      const nomeI = i => { const r = D.inst[i] || []; return r[1] || r[0] || i; }, nomeL = i => (D.inst[i] || [])[0] || i;
      const AREA = Object.assign(Object.fromEntries(D.areas), Object.fromEntries(D.finas.map(([s, n]) => [s, n])));
      const SUB = Object.fromEntries(D.subtipos.map(([s, n]) => [s, n]));
      const pertence = (i, alvo) => { for (let k = 0; i && k < 7; k++) { if (i === alvo) return true; i = (D.pais || {})[i]; } return false; };
      const m = g.menos, esc_ = e => m.tipos.includes(e.s) || m.inst.some(i => pertence(e.in, i)) || e.a.concat(e.af || []).some(a => m.areas.includes(a));
      const naLista = (e, f) => (!f.subtipos || f.subtipos.includes(e.s)) && (!f.familias || f.familias.includes(e.fa)) && (!f.areas || e.a.some(a => f.areas.includes(a))) &&
        (!f.modo || f.modo.includes(e.m)) && (!f.lingua || f.lingua.includes(e.li)) && (!f.distritos || f.distritos.includes(e.di)) && (!f.chamada || (e.pz || "") >= hoje);
      // as escolhas da entrada («O meu Lykeion», lyk-porta) contam como seguidas
      let PO; try { PO = JSON.parse(localStorage.getItem("lyk-porta")) || {}; } catch (_) { PO = {}; }
      const poI = (PO.insts || []).map(x => x.id).filter(Boolean), poA = (PO.areas || []).filter(Boolean);
      const porque = e => {
        const i = g.inst.concat(poI).find(x => pertence(e.in, x)); if (i) return nomeI(i);
        const pa = (e.af || []).concat(e.a).find(x => poA.includes(x)); if (pa) return AREA[pa] || pa;
        const ec = es.find(x => ecoEv(x, e, D)); if (ec) return ec.nome;
        const a = e.a.concat(e.af || []).find(x => g.areas.includes(x)); if (a) return AREA[a] || a;
        const l = g.listas.find(x => D.listas[x] && naLista(e, D.listas[x][1])); if (l) return D.listas[l][0];
        if (e.se && g.series.includes(e.se)) return "Série que segue";
        return "";
      };
      const fim = iso(new Date(Date.now() + 60 * 864e5)), meus = [];
      for (const e of D.ev) { const d = e.d.find(x => x >= hoje && x <= fim); if (!d || esc_(e)) continue; const p = porque(e); if (p) meus.push([d, e, p]); }
      meus.sort((a, b) => a[0].localeCompare(b[0]) || a[1].n.localeCompare(b[1].n));
      const quando = d => { const x = dt(d); return d === hoje ? "Hoje" : SEM[x.getDay()] + " " + x.getDate() + " " + MES[x.getMonth()]; };
      const ev1 = (d, e, p) => `<li><span class="ma-dia">${quando(d)}</span><span class="ma-tx"><a href="${B}e/${e.pg}.html">${esc(e.n)}</a><small>${esc([nomeI(e.in) || e.l, SUB[e.s], p].filter(Boolean).join(" · "))}</small></span></li>`;
      const em30 = iso(new Date(Date.now() + 30 * 864e5));
      const vazio = t => `<p class="vazio">${t}</p>`;
      const C = {
        prox: () => meus.length ? `<ul class="ma-lista">${meus.slice(0, proxTodos ? 60 : 8).map(([d, e, p]) => ev1(d, e, p)).join("")}</ul>` +
            (meus.length > 8 && !proxTodos ? `<p><button class="ch" type="button" id="maprox">Mostrar os ${meus.length} dos próximos 60 dias</button></p>` : "")
          : vazio(`Ainda não há nada marcado do que segue. <a href="${B}${AC}instituicoes/">Siga instituições</a> ou <a href="${B}${AC}listas/">áreas</a>.`),
        ecos: () => es.map((ec, n) => {
            const mb = ecoMembros(ec, D).sort((a, b) => nomeL(a).localeCompare(nomeL(b), "pt")), nEv = D.ev.filter(e => e.d.some(d => d >= hoje && d <= em30) && ecoEv(ec, e, D)).length;
            return `<div class="ma-eco"><div class="ma-eco-cab"><b>${esc(ec.nome)}</b><span class="sub">${mb.length} ${mb.length === 1 ? "instituição" : "instituições"} · ${nEv} ${nEv === 1 ? "evento" : "eventos"} nos próximos 30 dias</span></div>` +
              (ec.base ? `<p class="sub">Parte dos centros de <a href="${B}${AC}area/${esc(ec.base)}/">${esc(fina(D, ec.base).toLowerCase())}</a>${ec.fora.length ? ` (tirou ${ec.fora.length})` : ""}${ec.inst.length ? `, mais ${ec.inst.length} que juntou` : ""}.</p>` : "") +
              `<details><summary>Ver as instituições</summary><p class="lin">${mb.map(i => `<span class="ch ma-ch"><a href="${B}${AC}i/${esc(i)}/">${esc(nomeL(i))}</a> <button type="button" class="ma-x" data-eco-tira="${n}|${esc(i)}" title="Tirar deste ecossistema" aria-label="Tirar ${esc(nomeL(i))}">×</button></span>`).join(" ") || '<span class="sub">Nenhuma ainda.</span>'}</p>` +
              `<p class="sub">Para juntar uma instituição, abra a página dela e carregue em «+ Ao meu ecossistema».</p></details>` +
              `<p class="ma-eco-acoes"><button class="lnk" type="button" data-eco-renomear="${n}">Mudar o nome</button> · <button class="lnk" type="button" data-eco-apagar="${n}">Apagar</button></p></div>`;
          }).join("") + (es.length ? "" : `<p class="sub">Um ecossistema junta as instituições de um tema seu, por exemplo «Sociologia em Portugal». Pode partir dos centros de uma área e juntar ou tirar à vontade.</p>`) +
          `<form class="linha ma-eco-novo"><label class="vis" for="maeconome">Nome</label><input id="maeconome" maxlength="80" placeholder="Novo ecossistema" required>` +
          `<label class="vis" for="maecobase">Partir de</label><select id="maecobase" class="busca"><option value="">Começar vazio</option>${[...new Set(Object.values(D.ia || {}).flat())].map(s => [s, fina(D, s)]).sort((a, b) => a[1].localeCompare(b[1], "pt")).map(([s, n]) => `<option value="${esc(s)}">Os centros de ${esc(n.toLowerCase())}</option>`).join("")}</select><button class="bt">Criar</button></form>`,
        inst: () => g.inst.length ? `<p class="lin">${g.inst.map(i => `<span class="ch ma-ch"><a href="${B}${AC}i/${esc(i)}/">${esc(nomeI(i))}</a> <button type="button" class="ma-x" data-tirar-segue="inst|${esc(i)}" title="Deixar de seguir" aria-label="Deixar de seguir ${esc(nomeI(i))}">×</button></span>`).join(" ")}</p>`
          : vazio(`Ainda não segue nenhuma instituição. <a href="${B}${AC}instituicoes/">Escolher</a>`),
        areas: () => (g.areas.length || g.listas.length) ? `<p class="lin">${g.areas.map(a => `<span class="ch ma-ch">${esc(AREA[a] || a)} <button type="button" class="ma-x" data-tirar-segue="areas|${esc(a)}" aria-label="Deixar de seguir">×</button></span>`).concat(g.listas.map(l => `<span class="ch ma-ch">${esc((D.listas[l] || [l])[0])} <button type="button" class="ma-x" data-tirar-segue="listas|${esc(l)}" aria-label="Deixar de seguir">×</button></span>`)).join(" ")}</p>`
          : vazio(`Ainda não segue nenhuma área. <a href="${B}${AC}listas/">Escolher</a>`),
        guard: () => { const gs = ler("lagenda-guardados", []), P = Object.fromEntries(D.ev.map(e => [e.pg, e])), xs = gs.map(p => P[p]).filter(Boolean).map(e => [e.d.find(d => d >= hoje), e]).filter(x => x[0]).sort((a, b) => a[0].localeCompare(b[0]));
          const passados = gs.length - xs.length;
          return (xs.length ? `<ul class="ma-lista">${xs.map(([d, e]) => ev1(d, e, "") .replace("</li>", `<button type="button" class="ma-x" data-desguardar="${esc(e.pg)}" title="Tirar dos guardados" aria-label="Tirar dos guardados">×</button></li>`)).join("")}</ul>` : vazio("Nada guardado para os próximos dias. Na entrada e em cada evento, a estrela ☆ ou «Guardar» põe-no aqui."))
            + (passados ? `<p class="sub">${passados} ${passados === 1 ? "guardado já passou" : "guardados já passaram"}. <a href="${B}guardados.html">Ver todos os guardados</a></p>` : ""); },
        porta: () => { let P; try { P = JSON.parse(localStorage.getItem("lyk-porta")) || {}; } catch (_) { P = {}; }
          const ar = (P.areas || []).map(a => AREA[a] || a), is = (P.insts || []).map(i => i.nome || i.id), SOUN = { mestrando: "Mestrando ou pós-graduado", doutorando: "Doutorando", investigador: "Investigador", docente: "Docente", outro: "Outro" };
          return (ar.length || is.length || P.sou) ? `<p class="lin">${ar.concat(is, P.sou ? [SOUN[P.sou] || P.sou] : []).map(x => `<span class="ch ma-ch">${esc(x)}</span>`).join(" ")}</p><p class="sub">É o que a entrada «Para mim» mostra. <a href="${B}${AC}">Mudar na entrada</a></p>`
            : vazio(`Ainda não escolheu na entrada. <a href="${B}${AC}">Escolher a área, a faculdade e o momento</a>`); },
        pesq: () => '<div id="lyksegue"></div>',
        menos: () => '<div id="lykmenos"></div>',
        avisos: () => conta ? `<label class="chk"><input type="checkbox" id="maavisos"${g.avisos === false ? "" : " checked"}> Avisar-me por email dos eventos novos do que sigo</label>` +
            `<label class="chk"><input type="checkbox" id="masemanal"${g.semanal === false ? "" : " checked"}> Receber à segunda-feira a semana académica <a href="${B}conta/lykeion.php?ver" target="_blank" rel="noopener">(ver)</a></label><p class="sub">Para ${esc(conta.email)} · <a href="${B}conta.html">A minha conta</a></p>`
          : `<p>${servidor ? `<a class="bt prim" href="${B}conta.html">Entrar com o email</a>` : ""}</p><p class="sub">Sem conta, a sua área fica só neste aparelho. Com conta, acompanha-o em todos e avisamos por email dos eventos novos.</p>`
      };
      const ctl = k => `<span class="ma-ctl"><button type="button" class="ma-b" data-ma="sobe|${k}" aria-label="Subir">↑</button><button type="button" class="ma-b" data-ma="desce|${k}" aria-label="Descer">↓</button>` +
        `<button type="button" class="ma-b" data-ma="largo|${k}">${disp.largos.includes(k) ? "Estreito" : "Largo"}</button><button type="button" class="ma-b" data-ma="esc|${k}">${disp.esc.includes(k) ? "Mostrar" : "Esconder"}</button></span>`;
      const nome = ((conta && conta.nome) || "").trim().split(/\s+/)[0], h1 = document.getElementById("maola"); if (h1) h1.textContent = nome ? `A área de ${nome}` : "A minha área";
      const nG = ler("lagenda-guardados", []).length;
      if (!SEPS.some(x => x[0] === maSep)) maSep = nG ? "guard" : "segue";
      const daqui = SEPS.find(x => x[0] === maSep)[2];
      raiz.dataset.sep = maSep;
      raiz.innerHTML = `<div class="lyk-sep ma-seps" role="tablist">${SEPS.map(([k, n]) => `<button type="button" role="tab" data-ma-sep="${k}" aria-selected="${k === maSep}">${n}${k === "guard" && nG ? ` <small>${nG}</small>` : ""}</button>`).join("")}</div>` + `<p class="ma-topo"><span class="sub">${meus.length ? `Do que segue, ${meus.length === 1 ? "vem aí 1 evento" : "vêm aí " + meus.length + " eventos"} nos próximos 60 dias.` : ""}${!conta && servidor ? ` <a href="${B}conta.html">Entre</a> para a ter em todos os aparelhos.` : ""}</span>` +
        `<span>${editar ? '<button class="lnk" type="button" id="marepor">Repor como estava</button> ' : ""}<button class="bt${editar ? " prim" : ""}" type="button" id="maorg" aria-pressed="${editar}">${editar ? "Pronto" : "Organizar"}</button></span></p>` +
        `<div class="ma-grade${editar ? " ma-editar" : ""}">` + ordem.filter(k => daqui.includes(k) && (editar || !disp.esc.includes(k))).map(k => `<section class="lyk-sec ma-bloco${disp.largos.includes(k) ? " ma-largo" : ""}${disp.esc.includes(k) ? " ma-esc" : ""}" data-bloco="${k}">` +
          `<div class="lyk-cab"><h2>${BLOCOS.find(b => b[0] === k)[1]}</h2>${editar ? ctl(k) : ""}</div>${disp.esc.includes(k) ? '<p class="sub">Escondido.</p>' : C[k]()}</section>`).join("") + "</div>";
      pintaSegue(); pintaMenos();
      const grava = nd => { g.disp = nd; gravarGostos(); minhaArea(); };
      raiz.onclick = ev => {
        const t = ev.target.closest("button"); if (!t) return;
        if (t.dataset.maSep) { maSep = t.dataset.maSep; gravar("lyk-ma-sep", maSep); minhaArea(); return; }
        if (t.dataset.desguardar) { const gs = ler("lagenda-guardados", []).filter(x => x !== t.dataset.desguardar); gravar("lagenda-guardados", gs);
          if (conta) post({ acao: "guardar", pg: t.dataset.desguardar, on: false }).catch(() => {}); const n = document.getElementById("nguard"); if (n) n.textContent = gs.length || ""; minhaArea(); return; }
        if (t.id === "maorg") { editar = !editar; minhaArea(); return; }
        if (t.id === "marepor") { delete g.disp; gravarGostos(); minhaArea(); return; }
        if (t.id === "maprox") { proxTodos = true; minhaArea(); return; }
        if (t.dataset.ma) {
          const [a, k] = t.dataset.ma.split("|"), nd = { ordem: ordem.slice(), largos: disp.largos.slice(), esc: disp.esc.slice() }, p = nd.ordem.indexOf(k);
          const vis = nd.ordem.filter(x => editar || !nd.esc.includes(x));
          if (a === "sobe" && p > 0) nd.ordem.splice(p - 1, 0, nd.ordem.splice(p, 1)[0]);
          if (a === "desce" && p < nd.ordem.length - 1) nd.ordem.splice(p + 1, 0, nd.ordem.splice(p, 1)[0]);
          if (a === "largo") nd.largos = nd.largos.includes(k) ? nd.largos.filter(x => x !== k) : nd.largos.concat(k);
          if (a === "esc") nd.esc = nd.esc.includes(k) ? nd.esc.filter(x => x !== k) : nd.esc.concat(k);
          void vis; grava(nd); setTimeout(() => { const b = raiz.querySelector(`[data-ma="${a}|${k}"]`); if (b) b.focus(); }, 0); return;
        }
        if (t.dataset.ecoTira) { const [n, i] = t.dataset.ecoTira.split("|"), ec = es[+n]; ec.inst = ec.inst.filter(x => x !== i); if (ec.base && ((D.ia || {})[i] || []).includes(ec.base) && !ec.fora.includes(i)) ec.fora.push(i); mudou(); return; }
        if (t.dataset.ecoApagar) { if (t.dataset.confirma) { es.splice(+t.dataset.ecoApagar, 1); mudou(); } else { t.dataset.confirma = "1"; t.textContent = "Apagar mesmo?"; } return; }
        if (t.dataset.ecoRenomear) { const ec = es[+t.dataset.ecoRenomear], cab = t.closest(".ma-eco").querySelector(".ma-eco-cab b");
          cab.innerHTML = `<form class="linha ma-ren"><label class="vis" for="maren">Nome</label><input id="maren" maxlength="80" value="${esc(ec.nome)}"><button class="bt">Gravar</button></form>`;
          const f = cab.querySelector("form"); f.querySelector("input").focus(); f.onsubmit = e2 => { e2.preventDefault(); const v = f.querySelector("input").value.trim(); if (v) { ec.nome = v.slice(0, 80); mudou(); } }; }
      };
      raiz.onchange = ev => {
        if (ev.target.id === "maavisos" || ev.target.id === "masemanal") { g.avisos = document.getElementById("maavisos").checked; g.semanal = document.getElementById("masemanal").checked; gravarGostos(); }
      };
      raiz.onsubmit = ev => {
        if (!ev.target.classList.contains("ma-eco-novo")) return;
        ev.preventDefault(); const n = document.getElementById("maeconome").value.trim(), base = document.getElementById("maecobase").value; if (!n) return;
        es.push({ id: ecoId(), nome: n.slice(0, 80), base, inst: [], fora: [] }); mudou();
      };
    }).catch(() => { raiz.innerHTML = '<p class="vazio">Não foi possível carregar a sua área agora. Tente daqui a pouco.</p>'; });
  }
  document.addEventListener("lykeion:gostos", minhaArea);

  // ---- o que o próprio artista escreveu no painel (conta/artista.php): apresentação, fotografia, ligações, datas acrescentadas ----
  function legendaArtista() {
    const cx = document.getElementById("artcasa"); if (!cx || !cx.dataset.artista) return;
    fetch(B + "conta/artista.php?pub=" + encodeURIComponent(cx.dataset.artista)).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      (j.fora || []).forEach(pg => document.querySelectorAll(`.ld a[href$="/${CSS.escape(pg)}.html"]`).forEach(a => a.parentNode.classList.add("fora")));
      const ROT = { site: "Site", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", spotify: "Spotify", bandcamp: "Bandcamp", soundcloud: "SoundCloud", bilhetes: "Bilhetes" };
      const links = Object.entries(j.links || {}).filter(([, u]) => /^https:\/\//.test(u)).map(([k, u]) => `<a class="ch" href="${esc(u)}" target="_blank" rel="noopener">${esc(ROT[k] || k)}</a>`).join("");
      if (j.apresentacao || j.foto || links) cx.innerHTML = (j.foto ? `<img class="art-foto" src="${esc(j.foto)}" alt="">` : "") + (j.apresentacao ? `<p class="rot">Nas palavras ${j.grupo ? "da companhia" : "do artista"}</p>` + j.apresentacao.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("") : "") + (links ? `<div class="lin">${links}</div>` : "");
      const ex = document.getElementById("artextra"), ds = (j.datas || []).filter(d => d.data >= hoje);
      if (ex && ds.length) ex.innerHTML = `<h3 class="am">Mais datas, indicadas ${j.grupo ? "pela companhia" : "pelo artista"}</h3><ol class="ldatas">` + ds.map(d => { const x = dt(d.data);
        return `<li class="ld" data-di="${esc(d.distrito || "")}"><a href="${esc(/^https:\/\//.test(d.link || "") ? d.link : "#")}" target="_blank" rel="noopener"><span class="ld-d"><b>${x.getDate()}</b> ${MES[x.getMonth()]}<small>${SEM[x.getDay()]}${d.hora ? " · " + esc(d.hora) : ""}</small></span>` +
          `<span class="ld-t"><span class="ld-n">${esc(d.sala)}</span><span class="sub">${esc([d.terra, d.distrito].filter(Boolean).join(" · "))}</span></span></a></li>`; }).join("") + "</ol>";
      perto();
    }).catch(() => {});
  }
  // «Só perto de mim»: os distritos que escolheu na conta
  function perto() {
    const b = document.getElementById("aperto"), onde = gostos.onde || []; if (!b || !onde.length) return;
    b.hidden = false; b.textContent = "Só em " + (onde.length > 2 ? onde.length + " distritos" : onde.join(" e "));
    const aplica = () => { const on = b.getAttribute("aria-pressed") === "true";
      document.querySelectorAll(".ld").forEach(li => { li.hidden = on && !onde.includes(li.dataset.di); });
      document.querySelectorAll(".am").forEach(h => { const ol = h.nextElementSibling; h.hidden = on && ol && ![...ol.children].some(li => !li.hidden && !li.classList.contains("fora")); }); };
    if (!b.dataset.ligado) { b.dataset.ligado = "1"; b.addEventListener("click", () => { b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); aplica(); }); }
  }

  // ---- guardar também na conta ----
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-guardar]");
    if (b && conta) setTimeout(() => post({ acao: "guardar", pg: b.dataset.guardar, on: b.getAttribute("aria-pressed") === "true" }).catch(() => {}), 0);
  });

  // ---- estado da conta ----
  fetch(API + "?eu", { credentials: "same-origin" }).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
    servidor = true; conta = j.conta; google = j.google;
    if (conta) {
      if (conta.gostos && Object.keys(conta.gostos).length) { gostos = Object.assign({ cats: [], bairros: [], salas: [], artistas: [], onde: [], avisos: true, livre: false }, conta.gostos); gravar("lagenda-gostos", gostos); }
      else if (gostos.cats.length || gostos.salas.length || gostos.bairros.length || gostos.artistas.length || (gostos.lyk && (gostos.lyk.inst || []).concat(gostos.lyk.areas || [], gostos.lyk.listas || [], gostos.lyk.ecos || []).length)) gravarGostos(); // os gostos deste aparelho passam para a conta
      const locais = ler("lagenda-guardados", []);
      const novos = locais.filter(x => !j.guardados.includes(x));
      if (novos.length) post({ acao: "juntar", guardados: novos }).catch(() => {});
      const todos = Array.from(new Set(j.guardados.concat(locais))); gravar("lagenda-guardados", todos);
      const n = document.getElementById("nguard"); if (n) n.textContent = todos.length || "";
    }
  }).catch(() => {}).finally(() => {
    const cv = ler("lagenda-convite", "");
    const aceitar = conta && cv ? post({ acao: "amigo", codigo: cv }).then(j => { avisoAmigo = `Agora é amigo de ${j.nome}.`; return fetch(API + "?eu", { credentials: "same-origin" }).then(r => r.json()).then(j2 => { conta = j2.conta; }); })
      .catch(e => { avisoAmigo = e.message; }).finally(() => { try { localStorage.removeItem("lagenda-convite"); } catch (_) {} }) : Promise.resolve();
    // a página dos três toques (toques.js) ouve isto para pôr o nome e os gostos da conta
    aceitar.then(() => {
      window.LG = Object.assign(window.LG || {}, { conta, servidor, gostos, contaPronta: true, gravarToques: t => { gostos.toques = t; return gravarGostos(); },
        // «O meu Lykeion» (9/11/2026): as escolhas da entrada (áreas, faculdades e centros, momento) vão para a conta
        gravarPorta: p => { lyk().porta = p; return gravarGostos(); } });
      document.dispatchEvent(new CustomEvent("lagenda:conta", { detail: { conta, servidor, gostos } }));
      nav(); paraSi(); paginaConta(); social(); filasSociais(); tuaLegenda(); deQuemFoi(); seguirArtistas(); seguirLykeion(); perto(); minhaArea(); });
  legendaCasa(); legendaArtista(); // não dependem da conta
  });
  let avisoAmigo = "";

  // ---- vou / fui num evento ----
  function social() {
    const cx = document.getElementById("social"); if (!cx || !servidor) return;
    const pg = cx.dataset.pg, passou = cx.dataset.fim < hoje, comeca = cx.dataset.ini <= hoje;
    const desenhar = () => fetch(API + "?social=" + encodeURIComponent(pg), { credentials: "same-origin" }).then(r => r.json()).then(j => {
      const est = j.eu ? j.eu.estado : "", nota = j.eu ? +j.eu.nota : 0;
      const nomes = j.amigos.filter(a => a.estado === (passou ? "fui" : "vou")).map(a => esc(a.nome));
      const conta1 = passou ? (j.recomendam ? `${j.recomendam} ${j.recomendam === 1 ? "pessoa recomenda" : "pessoas recomendam"}` : "") : (j.vou ? `${j.vou} ${j.vou === 1 ? "pessoa vai" : "pessoas vão"}` : "");
      let bts;
      if (!conta) bts = `<a class="bt" href="${B}conta.html">${passou ? "Foste? Entra para recomendar" : "Vais? Entra para dizeres aos amigos"}</a>`;
      else if (!passou) bts = `<button class="bt" data-est="${est === "vou" ? "" : "vou"}" aria-pressed="${est === "vou"}">${est === "vou" ? "Vou ✓" : "Vou"}</button>` +
        (comeca ? `<button class="bt" data-est="fui" data-nota="1" aria-pressed="${est === "fui" && nota === 1}">Já fui e recomendo</button>` : "");
      else bts = `<span class="sub">Foste?</span> <button class="bt" data-est="fui" data-nota="1" aria-pressed="${est === "fui" && nota === 1}">Recomendo</button><button class="bt" data-est="fui" data-nota="-1" aria-pressed="${est === "fui" && nota === -1}">Não recomendo</button>`;
      cx.innerHTML = `<div class="acoes">${bts}</div><p class="sub">${[conta1, nomes.length ? `${passou ? "Foram" : "Vão"} os teus amigos ${nomes.join(", ")}` : ""].filter(Boolean).join(" · ")}</p>`;
    }).catch(() => {});
    cx.addEventListener("click", ev => {
      const b = ev.target.closest("[data-est]"); if (!b || !conta) return;
      const desligar = b.getAttribute("aria-pressed") === "true";
      post({ acao: "presenca", pg, estado: desligar ? "" : b.dataset.est, nota: +(b.dataset.nota || 0) }).then(desenhar).catch(() => {});
    });
    desenhar();
  }

  // ---- entrada: «Os seus amigos vão» e «Mais procurados» ----
  function filasSociais() {
    const am = document.getElementById("amigos"), po = document.getElementById("populares");
    if ((!am && !po) || !servidor) return;
    dados().then(D => {
      const porPg = Object.fromEntries(D.ev.map(e => [e.pg, e])), futuro = e => e.d.some(d => d >= hoje);
      if (am && conta) fetch(API + "?amigos_vao", { credentials: "same-origin" }).then(r => r.json()).then(j => {
        const evs = Object.keys(j.amigos_vao).map(pg => porPg[pg]).filter(e => e && futuro(e)).sort((a, b) => a.d[0].localeCompare(b.d[0])).slice(0, 12);
        if (evs.length) am.innerHTML = `<div class="fcab"><div><h2>Os teus amigos vão</h2></div></div><div class="trilho">${evs.map(e => cartao(e, D).replace('<span class="onde">', `<span class="quem">${esc(j.amigos_vao[e.pg].slice(0, 3).join(", "))}${j.amigos_vao[e.pg].length > 3 ? " e outros" : ""}</span><span class="onde">`)).join("")}</div>`;
      }).catch(() => {});
      if (po) fetch(API + "?populares").then(r => r.json()).then(j => {
        const evs = j.populares.filter(([pg, n]) => n >= 2 && porPg[pg] && futuro(porPg[pg])).slice(0, 12).map(([pg]) => porPg[pg]);
        if (evs.length >= 4) po.innerHTML = `<div class="fcab"><div><h2>Mais procurados</h2><p class="sub">O que mais pessoas guardaram ou dizem que vão ver.</p></div></div><div class="trilho">${evs.map(e => cartao(e, D)).join("")}</div>`;
      }).catch(() => {});
    });
  }

  // ---- «A tua legenda»: quem foi deixa uma frase e uma fotografia (aparecem depois de revistas) ----
  const LEG = B + "conta/legendas.php";
  const legHtml = l => `<figure class="tl-item">${l.t ? `<a href="${esc(l.u)}" target="_blank" rel="noopener"><img src="${esc(l.t)}" alt="" loading="lazy"></a>` : ""}` +
    `<figcaption><span class="tl-frase">${esc(l.frase)}</span><span class="sub">${esc(l.nome || "Alguém que foi")}</span></figcaption></figure>`;
  function tuaLegenda() {
    const cx = document.getElementById("tualegenda"); if (!cx || !servidor) return;
    const pg = cx.dataset.pg, comecou = cx.dataset.ini <= hoje;
    fetch(LEG + "?pg=" + encodeURIComponent(pg)).then(r => r.json()).then(j => {
      const lista = (j.legendas || []).map(legHtml).join("");
      let form = "";
      if (comecou && conta) form = `<form class="tl-form"><label>A tua legenda<textarea name="frase" maxlength="200" rows="2" required placeholder="Uma frase sobre o que viste"></textarea></label>` +
        `<label class="sub">Fotografia (opcional) <input type="file" name="foto" accept="image/jpeg,image/png,image/webp"></label>` +
        `<label class="chk"><input type="checkbox" name="consentimento" required> A frase e a fotografia são minhas e autorizo a publicação na Lagenda.</label>` +
        `<button class="bt prim">Enviar</button> <span class="sub tl-msg" aria-live="polite">Aparece aqui depois de revista.</span></form>`;
      else if (comecou) form = `<p><a class="bt" href="${B}conta.html">Foste? Entra para deixares a tua legenda</a></p>`;
      if (!lista && !form) return;
      cx.innerHTML = `<h2>A legenda de quem foi</h2>${lista ? `<div class="tl-lista">${lista}</div>` : ""}${form}`;
      const f = cx.querySelector("form"); if (!f) return;
      f.addEventListener("submit", ev => {
        ev.preventDefault(); const fd = new FormData(f); fd.append("pg", pg); const msg = f.querySelector(".tl-msg"), bt = f.querySelector("button");
        bt.disabled = true; msg.textContent = "A enviar…";
        fetch(LEG, { method: "POST", headers: { "X-Lagenda": "1" }, credentials: "same-origin", body: fd })
          .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.erro || "Erro"); }))
          .then(() => { f.reset(); msg.textContent = "Obrigado. A tua legenda aparece aqui depois de revista."; })
          .catch(e => { msg.textContent = e.message; }).finally(() => { bt.disabled = false; });
      });
    }).catch(() => {});
  }
  function deQuemFoi() {
    const cx = document.getElementById("dequemfoi"); if (!cx || !servidor) return;
    fetch(LEG + "?recentes").then(r => r.json()).then(j => {
      const ls = (j.legendas || []).slice(0, 6); if (ls.length < 2) return;
      cx.innerHTML = `<div class="fcab"><div><h2>A legenda de quem foi</h2><p class="sub">Frases e fotografias de quem lá esteve.</p></div></div>` +
        `<div class="tl-lista">${ls.map(l => legHtml(l).replace("</figcaption>", `<a class="sub" href="${B}e/${esc(l.pg)}.html">${esc(l.evento)} · ${esc(l.sala)}</a></figcaption>`)).join("")}</div>`;
    }).catch(() => {});
  }

  // ---- «A legenda da casa»: o que a própria sala escreve no seu painel (conta/sala.php) ----
  function legendaCasa() {
    const sala = document.getElementById("legcasa"), ev = document.getElementById("casaev"), cx = sala || ev; if (!cx || !cx.dataset.lugar) return;
    fetch(B + "conta/sala.php?casa=" + encodeURIComponent(cx.dataset.lugar)).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      const fi = j.ficha || {}, pf = sala && document.querySelector(".sala-cab .ficha");
      const cs = document.getElementById("confsala");  // 14/11/2026: «confirmado pela sala» no evento e na página da sala
      if (cs && fi.confirmado_em) { const d = new Date(fi.confirmado_em.slice(0, 10) + "T12:00:00"); cs.textContent = `Ficha confirmada pela sala a ${d.getDate()} ${MES[d.getMonth()]}. `; }
      if (pf && fi.confirmado_em) {  // a sala corrigiu a ficha no painel: o que ela escreveu passa à frente do diretório
        const d = pf.dataset, site = fi.site || d.s || "", url = site && !/^https?:/.test(site) ? "https://" + site : site;
        pf.innerHTML = [esc(fi.morada || d.m || ""), url ? `<a href="${esc(url)}" target="_blank" rel="noopener">site da sala</a>` : "",
          esc(fi.telefone || d.t || ""), esc(fi.horario || "")].filter(Boolean).join(" · ");
      }
      if (sala && j.apresentacao) sala.innerHTML = `<p class="rot">A legenda da casa</p>${j.apresentacao.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("")}`;
      const f = ev && j.legendas[ev.dataset.pg];
      if (f) ev.innerHTML = `<p class="rot">A legenda da casa</p><p class="frase">${esc(f)}</p>`;
    }).catch(() => {});
  }

  function nav() {
    const a = document.getElementById("nconta"); if (!a) return;
    if (!servidor) { a.hidden = true; return; }
    a.textContent = conta ? "A minha conta" : "Entrar";
  }

  // ---- «Para ti» na entrada ----
  function pontuacao(D) {
    const v = ler("lagenda-vistos", { cats: {}, salas: {} }), guard = ler("lagenda-guardados", []);
    const peso = { cats: {}, salas: {} };
    gostos.cats.forEach(c => peso.cats[c] = (peso.cats[c] || 0) + 4);
    gostos.salas.forEach(s => peso.salas[s] = (peso.salas[s] || 0) + 5);
    Object.entries(v.cats).forEach(([c, n]) => peso.cats[c] = (peso.cats[c] || 0) + Math.min(n, 5) * .6);
    Object.entries(v.salas).forEach(([s, n]) => peso.salas[s] = (peso.salas[s] || 0) + Math.min(n, 5) * .5);
    D.ev.filter(e => guard.includes(e.pg)).forEach(e => { e.c.forEach(c => peso.cats[c] = (peso.cats[c] || 0) + 1.5); peso.salas[e.l] = (peso.salas[e.l] || 0) + 1; });
    const sinais = Object.keys(peso.cats).length + Object.keys(peso.salas).length + (gostos.artistas || []).length;
    return { sinais, nota: e => {
      const [, fg] = D.lugares[e.l] || ["", ""];
      let p = e.c.reduce((s, c) => s + (peso.cats[c] || 0), 0) + (peso.salas[e.l] || 0) + (gostos.bairros.includes(fg) ? 2 : 0) + (gostos.livre && e.g ? 2 : 0)
        + (e.ar || []).filter(a => gostos.artistas.includes(a)).length * 6;
      if (e.i) p += .5; if (guard.includes(e.pg)) p -= 3; if (e.x) p -= 1;
      return p;
    } };
  }
  function cartao(e, D) {
    const [ln] = D.lugares[e.l] || [""], d0 = e.d.find(x => x >= hoje) || e.d[0], d = dt(d0);
    const q = e.x ? `até ${dt(e.f).getDate()} ${MES[dt(e.f).getMonth()]}` : `${SEM[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}`;
    const img = e.i ? `<img class="ci" src="${esc(e.i)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ci sem-img">${esc(e.n.slice(0, 60))}</span>`;
    return `<a class="card" href="${B}e/${e.pg}.html"><span class="fig">${img}</span><span class="quando">${q}</span><span class="tit">${esc(e.n)}</span><span class="onde">${esc(ln)}</span></a>`;
  }
  let dadosP = null;
  const dados = () => dadosP || (dadosP = fetch(B + "dados.json").then(r => r.json()));
  function paraSi() {
    const caixa = document.getElementById("parasi"); if (!caixa) return;
    dados().then(D => {
      const { sinais, nota } = pontuacao(D);
      const sete = iso(new Date(Date.now() + 7 * 864e5));
      if (!sinais) {
        caixa.innerHTML = `<div class="convite"><div><h2>A tua legenda</h2><p class="sub">Diz-nos do que gostas e esta página passa a abrir com o que é para ti.</p></div><a class="bt prim" href="${B}conta.html">Escolher gostos</a></div>`;
        return;
      }
      const evs = D.ev.filter(e => e.d.some(d => d >= hoje && d <= sete)).map(e => [nota(e), e]).filter(([p]) => p > 1.5).sort((a, b) => b[0] - a[0]).slice(0, 12).map(x => x[1]);
      if (!evs.length) { caixa.innerHTML = ""; return; }
      caixa.innerHTML = `<div class="fcab"><div><h2>Para ti</h2><p class="sub">Pelo que segues, guardas e abres${conta ? "" : " neste aparelho"}.</p></div><a class="vertodos" href="${B}conta.html">Afinar gostos</a></div><div class="trilho">${evs.map(e => cartao(e, D)).join("")}</div>`;
    }).catch(() => {});
  }

  // ---- página da conta ----
  function paginaConta() {
    const raiz = document.getElementById("conta"); if (!raiz) return;
    if (LY) return contaLykeion(raiz);
    const msg = location.hash === "#expirado" ? '<p class="aviso">Este link já foi usado ou passou do prazo. Pede outro, chega em segundos.</p>' : location.hash === "#entrou" ? '<p class="aviso ok">Entraste. Já estás na Lagenda.</p>' : "";
    if (!servidor) { raiz.innerHTML = '<p class="sub">As contas ainda não estão ligadas neste endereço. Os teus gostos e guardados ficam, entretanto, neste aparelho.</p>' + editor(null); ligarEditor(); return; }
    if (!conta) {
      const pend = ler("lagenda-convite", "") ? '<p class="aviso">Um amigo convidou-te. Entra e ficam amigos na Lagenda.</p>' : "";
      raiz.innerHTML = msg + pend + `<div class="entrar"><div><h2>Entrar</h2><p>Sem palavra-passe: mandamos-te um link por email.</p>
        <form id="fentrar" class="linha"><label class="vis" for="email">Email</label><input id="email" type="email" required autocomplete="email" placeholder="o.teu@email.pt"><button class="bt prim">Enviar link</button></form>
        <p id="rentrar" class="sub" aria-live="polite"></p>${google ? '<div id="gbotao"></div>' : ""}
        <p class="sub">Com conta, os gostos, as salas que segues e os guardados vão contigo para todos os aparelhos, e podes receber à quinta-feira a tua legenda da semana. <a href="${B}privacidade.html">Privacidade</a>.</p></div></div>` + editor(null);
      document.getElementById("fentrar").addEventListener("submit", ev => {
        ev.preventDefault(); const r = document.getElementById("rentrar"), em = document.getElementById("email").value.trim();
        r.textContent = "A enviar…";
        post({ acao: "entrar", email: em, voltar: B + "conta.html#entrou" }).then(() => { r.textContent = `Enviámos um link para ${em}. Abre-o neste aparelho para entrar (serve durante uma hora).`; })
          .catch(e => { r.textContent = e.message; });
      });
      if (google) {
        const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
        s.onload = () => { google && window.google && window.google.accounts.id.initialize({ client_id: google, callback: r => post({ acao: "google", credencial: r.credential }).then(() => location.reload()).catch(e => alert(e.message)) });
          window.google.accounts.id.renderButton(document.getElementById("gbotao"), { theme: "outline", size: "large", text: "continue_with", locale: "pt-PT" }); };
        document.head.appendChild(s);
      }
      ligarEditor(); return;
    }
    const convite = location.origin + B + "conta.html#amigo-" + conta.codigo;
    raiz.innerHTML = msg + (avisoAmigo ? `<p class="aviso">${esc(avisoAmigo)}</p>` : "") + `<p class="sub">Entraste como <b>${esc(conta.email)}</b> · <button class="lnk" id="sair">Sair</button></p>` +
      `<section class="perfil"><h2>Amigos</h2><p>Os amigos veem o que dizes que vais ver e o que recomendas; os outros só veem contagens, sem nomes.</p>
       <form id="fperfil" class="linha"><label class="vis" for="pnome">O teu nome</label><input id="pnome" maxlength="40" placeholder="Como os amigos te veem (ex.: Ana)" value="${esc(conta.nome || "")}">
       <button class="bt">Gravar nome</button></form>
       <label class="chk"><input type="checkbox" id="pmostrar"${conta.mostrar ? " checked" : ""}> Mostrar aos meus amigos o que vou ver e o que recomendo</label>
       <p><b>O teu link de convite</b> · quem o abrir e entrar fica teu amigo:</p><div class="linha"><input id="pconv" readonly value="${esc(convite)}"><button class="bt prim" type="button" id="copiar">Copiar</button></div>
       <div class="lin" id="lamigos">${(conta.amigos || []).map(a => `<button type="button" class="ch" data-tirar="${a.id}" title="Deixar de ser amigo">${esc(a.nome)} ×</button>`).join("") || '<span class="sub">Ainda não tens amigos na Lagenda.</span>'}</div></section>` + editor(conta) +
      `<details class="perigo"><summary>Apagar a conta</summary><p>Apaga a conta, os gostos e os guardados. Não dá para desfazer.</p><button class="bt" id="apagar1">Quero apagar</button><span id="apagar2" hidden> Tens a certeza? <button class="bt perigo" id="apagar3">Sim, apagar tudo</button></span></details>`;
    document.getElementById("sair").addEventListener("click", () => post({ acao: "sair" }).then(() => location.reload()));
    const perfil = () => post({ acao: "perfil", nome: document.getElementById("pnome").value, mostrar: document.getElementById("pmostrar").checked });
    document.getElementById("fperfil").addEventListener("submit", ev => { ev.preventDefault(); perfil().then(() => { ev.target.querySelector("button").textContent = "Gravado"; }); });
    document.getElementById("pmostrar").addEventListener("change", perfil);
    document.getElementById("copiar").addEventListener("click", ev => {
      const i = document.getElementById("pconv");
      (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(() => { ev.target.textContent = "Copiado"; }).catch(() => { i.select(); });
    });
    document.getElementById("lamigos").addEventListener("click", ev => {
      const b = ev.target.closest("[data-tirar]"); if (!b) return;
      if (b.dataset.confirma) post({ acao: "tirar_amigo", id: +b.dataset.tirar }).then(() => b.remove());
      else { b.dataset.confirma = "1"; b.textContent = "Tirar " + b.textContent.replace(" ×", "") + "?"; }
    });
    document.getElementById("apagar1").addEventListener("click", () => { document.getElementById("apagar2").hidden = false; });
    document.getElementById("apagar3").addEventListener("click", () => post({ acao: "apagar" }).then(() => { ["lagenda-gostos", "lagenda-guardados", "lagenda-vistos"].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} }); location.href = B; }));
    ligarEditor();
  }
  // ---- a conta em lykeion.pt: entrar, o que segue no Lykeion, avisos e a semana académica; sem salas, artistas nem amigos da Lagenda ----
  function contaLykeion(raiz) {
    const msg = location.hash === "#expirado" ? '<p class="aviso">Esse link já foi usado ou passou de prazo. Peça outro.</p>' : location.hash === "#entrou" ? '<p class="aviso ok">Entrou. Bem-vindo ao Lykeion.</p>' : "";
    const form = c => `<form id="flyk" class="gostos">${lykeionEditor(c)}${c ? "" : '<p class="sub">Entre com o seu email para receber os avisos e a semana académica.</p>'}` +
      (c ? '<p class="acoes"><button class="bt prim">Gravar</button> <span id="rlyk" class="sub" aria-live="polite"></span></p>' : "") + "</form>";
    if (!servidor) { raiz.innerHTML = '<p class="sub">As contas ainda não estão ligadas neste endereço. O que segue fica, entretanto, neste aparelho.</p>' + form(null); return; }
    if (!conta) {
      raiz.innerHTML = msg + `<div class="entrar"><div><h2>Entrar</h2><p>Sem palavra-passe: enviamos-lhe um link por email.</p>
        <form id="fentrar" class="linha"><label class="vis" for="email">Email</label><input id="email" type="email" required autocomplete="email" placeholder="o.seu@email.pt"><button class="bt prim">Enviar link</button></form>
        <p id="rentrar" class="sub" aria-live="polite"></p>${google ? '<div id="gbotao"></div>' : ""}
        <p class="sub">Com conta, as instituições e áreas que segue acompanham-no em todos os aparelhos, avisamos por email dos eventos novos e, à segunda-feira, mandamos a semana académica. É a mesma conta da Lagenda. <a href="${B}privacidade.html">Privacidade</a>.</p></div></div>` + form(null);
      document.getElementById("fentrar").addEventListener("submit", ev => {
        ev.preventDefault(); const r = document.getElementById("rentrar"), em = document.getElementById("email").value.trim();
        r.textContent = "A enviar…";
        post({ acao: "entrar", email: em, voltar: B + "conta.html#entrou" }).then(() => { r.textContent = `Enviámos um link para ${em}. Abra-o neste aparelho para entrar (vale durante uma hora).`; })
          .catch(e => { r.textContent = e.message; });
      });
      if (google) {
        const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
        s.onload = () => { window.google && window.google.accounts.id.initialize({ client_id: google, callback: r => post({ acao: "google", credencial: r.credential }).then(() => location.reload()).catch(e => alert(e.message)) });
          window.google.accounts.id.renderButton(document.getElementById("gbotao"), { theme: "outline", size: "large", text: "continue_with", locale: "pt-PT" }); };
        document.head.appendChild(s);
      }
      return;
    }
    raiz.innerHTML = msg + `<p class="sub">Entrou como <b>${esc(conta.email)}</b> · <button class="lnk" id="sair">Sair</button></p>` + form(conta) +
      `<details class="perigo"><summary>Apagar a conta</summary><p>Apaga a conta e tudo o que está ligado a ela, aqui e na Lagenda (é a mesma conta). Não dá para desfazer.</p><button class="bt" id="apagar1">Quero apagar</button><span id="apagar2" hidden> Tem a certeza? <button class="bt perigo" id="apagar3">Sim, apagar tudo</button></span></details>`;
    document.getElementById("sair").addEventListener("click", () => post({ acao: "sair" }).then(() => location.reload()));
    document.getElementById("flyk").addEventListener("submit", ev => {
      ev.preventDefault();
      gostos.lyk = Object.assign({}, lyk(), { avisos: document.getElementById("glyka").checked, semanal: document.getElementById("glyks").checked });
      const r = document.getElementById("rlyk"); r.textContent = "A gravar…";
      gravarGostos().then(() => { r.textContent = "Gravado."; });
    });
    document.getElementById("apagar1").addEventListener("click", () => { document.getElementById("apagar2").hidden = false; });
    document.getElementById("apagar3").addEventListener("click", () => post({ acao: "apagar" }).then(() => { ["lagenda-gostos", "lagenda-guardados", "lagenda-vistos"].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} }); location.href = B; }));
  }
  function editor(c) {
    return `<form id="fgostos" class="gostos"><h2>Do que gostas</h2><div class="lin" id="gcats"></div>
      <h2>Bairros onde costumas andar</h2><div class="lin" id="gbairros"></div>
      <h2>Salas que segues</h2><div id="gsalas" class="lin"></div><input class="busca" id="psala" type="search" placeholder="Procurar uma sala para seguir…" aria-label="Procurar sala"><div id="rsalas" class="lin"></div>
      <h2 id="artistas">Artistas que segues</h2><div id="gartistas" class="lin"></div><input class="busca" id="partista" type="search" placeholder="Procurar um artista, banda ou companhia…" aria-label="Procurar artista"><div id="rartistas" class="lin"></div>
      <h2>Onde queres ser avisado</h2><p class="sub">Os distritos onde costumas ir ver espetáculos. Sem nenhum escolhido, avisamos de todo o país.</p><div id="gonde" class="lin"></div>
      ${c ? `<label class="chk"><input type="checkbox" id="gavisos"${c.gostos && c.gostos.avisos === false ? "" : " checked"}> Avisar-me por email quando um artista que sigo tiver data nova perto de mim</label>` : `<p class="sub">Entra com o teu email para receberes os avisos.</p>`}
      ${lykeionEditor(c)}
      <h2>Mais</h2><label class="chk"><input type="checkbox" id="glivre"> Dar prioridade ao que tem entrada livre</label>
      ${c ? `<label class="chk"><input type="checkbox" id="gnews"${c.newsletter ? " checked" : ""}> Quero receber à quinta-feira a minha legenda da semana, por email</label>
      <p class="sub"><a href="${B}conta/newsletter.php?ver" target="_blank" rel="noopener">Ver como fica esta semana</a> · <button type="button" class="lnk" id="exemplo">Enviar-me um exemplo agora</button> <span id="rexemplo" aria-live="polite"></span></p>` : ""}
      <p class="acoes"><button class="bt prim">Gravar</button> <span id="rgostos" class="sub" aria-live="polite"></span></p></form>`;
  }
  function ligarEditor() {
    dados().then(D => {
      const sel = { cats: new Set(gostos.cats), bairros: new Set(gostos.bairros), salas: new Set(gostos.salas), artistas: new Set(gostos.artistas || []), onde: new Set(gostos.onde || []) };
      const ART = D.artistas || {};
      const chips = (id, itens, k) => {
        const el = document.getElementById(id);
        el.innerHTML = itens.map(([v, t]) => `<button type="button" class="ch" data-k="${k}" data-v="${esc(v)}" aria-pressed="${sel[k].has(v)}">${esc(t)}</button>`).join("");
      };
      const usados = new Set(D.ev.flatMap(e => e.c));
      chips("gcats", (D.eixos && D.eixos.length ? D.eixos.map(([s, n]) => [s, n]) : D.cats).filter(([s]) => usados.has(s)), "cats");  // gostos pelos 8 eixos
      chips("gbairros", BAIRROS.map(b => [b, b]), "bairros");
      const salas = () => chips("gsalas", [...sel.salas].map(id => [id, (D.lugares[id] || [id])[0] + " ×"]), "salas");
      salas(); document.getElementById("glivre").checked = !!gostos.livre;
      const artistas = () => chips("gartistas", [...sel.artistas].map(id => [id, (ART[id] || [id])[0] + " ×"]), "artistas");
      artistas(); chips("gonde", (D.dists || []).map(([, d]) => [d, d]), "onde");
      document.getElementById("partista").addEventListener("input", ev => {
        const q = ev.target.value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const r = q.length < 2 ? [] : Object.entries(ART).filter(([id, a]) => !sel.artistas.has(id) && a[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)).slice(0, 10);
        document.getElementById("rartistas").innerHTML = r.map(([id, a]) => `<button type="button" class="ch" data-k="artistas" data-v="${esc(id)}">+ ${esc(a[0])}</button>`).join("");
      });
      document.getElementById("fgostos").addEventListener("click", ev => {
        const b = ev.target.closest("[data-k]"); if (!b) return;
        const k = b.dataset.k, v = b.dataset.v;
        sel[k].has(v) ? sel[k].delete(v) : sel[k].add(v);
        if (k === "salas") { salas(); document.getElementById("psala").dispatchEvent(new Event("input")); }
        else if (k === "artistas") { artistas(); document.getElementById("partista").dispatchEvent(new Event("input")); }
        else b.setAttribute("aria-pressed", sel[k].has(v));
      });
      document.getElementById("psala").addEventListener("input", ev => {
        const q = ev.target.value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const r = q.length < 2 ? [] : Object.entries(D.lugares).filter(([id, l]) => !sel.salas.has(id) && l[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)).slice(0, 10);
        document.getElementById("rsalas").innerHTML = r.map(([id, l]) => `<button type="button" class="ch" data-k="salas" data-v="${esc(id)}">+ ${esc(l[0])}</button>`).join("");
      });
      const ex = document.getElementById("exemplo");
      if (ex) ex.addEventListener("click", () => {
        const r = document.getElementById("rexemplo"); r.textContent = "A enviar…";
        fetch(B + "conta/newsletter.php?exemplo", { method: "POST", headers: { "X-Lagenda": "1" }, credentials: "same-origin" }).then(x => x.json())
          .then(j => { r.textContent = j.ok ? `Enviado para ${conta.email}.` : j.erro; }).catch(() => { r.textContent = "Não foi possível enviar agora."; });
      });
      document.getElementById("fgostos").addEventListener("submit", ev => {
        ev.preventDefault();
        const av = document.getElementById("gavisos");
        gostos = { cats: [...sel.cats], bairros: [...sel.bairros], salas: [...sel.salas], artistas: [...sel.artistas], onde: [...sel.onde], ...(gostos.toques ? { toques: gostos.toques } : {}),
                   lyk: Object.assign({}, gostos.lyk || {}, document.getElementById("glyka") ? { avisos: document.getElementById("glyka").checked, semanal: document.getElementById("glyks").checked } : {}),
                   avisos: av ? av.checked : gostos.avisos !== false, livre: document.getElementById("glivre").checked };
        const n = document.getElementById("gnews"); if (conta && n) conta.newsletter = n.checked ? 1 : 0;
        const r = document.getElementById("rgostos"); r.textContent = "A gravar…";
        gravarGostos().then(() => { r.innerHTML = conta ? `Gravado. <a href="${B}">Ver a entrada com o que é para ti</a>.` : `Gravado neste aparelho. <a href="${B}">Ver a entrada</a>. Entra para teres os gostos em todos os aparelhos.`; });
      });
    });
  }
})();
