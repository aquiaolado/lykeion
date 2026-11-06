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
  const lyk = () => (gostos.lyk = Object.assign({ inst: [], areas: [], listas: [] }, gostos.lyk || {}));
  function seguirLykeion() {
    document.querySelectorAll("[data-seguir-inst],[data-seguir-area],[data-seguir-lista]").forEach(b => {
      const k = b.dataset.seguirInst ? "inst" : b.dataset.seguirLista ? "listas" : "areas", id = b.dataset.seguirInst || b.dataset.seguirLista || b.dataset.seguirArea, aviso = document.getElementById("avisoseguir");
      const marca = (mudou) => {
        const on = lyk()[k].includes(id); b.setAttribute("aria-pressed", on);
        if (b.classList.contains("bt")) b.textContent = on ? "A seguir ✓" : "Seguir";  // as fichas de área (.ch) guardam o nome
        if (!aviso || (!mudou && !on)) return;
        aviso.innerHTML = !on ? "Deixou de seguir." : !servidor ? "A seguir neste aparelho." :
          !conta ? `A seguir neste aparelho. <a href="${B}conta.html#lykeion">Entre com o seu email</a> para receber um aviso quando houver eventos novos e, à segunda, a semana académica.` :
          `A seguir. Avisamos por email dos eventos novos e, à segunda, mandamos a semana académica. <a href="${B}conta.html#lykeion">Mudar</a>`;
      };
      marca(false);
      if (!b.dataset.ligado) { b.dataset.ligado = "1"; b.addEventListener("click", () => { const g = lyk(); g[k] = g[k].includes(id) ? g[k].filter(x => x !== id) : g[k].concat(id); marca(true); gravarGostos(); }); }
    });
  }
  seguirLykeion();
  function lykeionEditor(c) {
    const g = lyk(), n = g.inst.length + g.areas.length + g.listas.length;
    return `<h2 id="lykeion">${LY ? "O que segue" : "Lykeion: a agenda da ciência"}</h2><p class="sub">${n ? `Segue ${g.inst.length} ${g.inst.length === 1 ? "instituição" : "instituições"}, ${g.areas.length} ${g.areas.length === 1 ? "área" : "áreas"} e ${g.listas.length} ${g.listas.length === 1 ? "lista" : "listas"}. ` : "Ainda não segue nenhuma instituição nem área. "}` +
      `<a href="${B}${AC}instituicoes/">Escolher instituições</a> · <a href="${B}${AC}listas/">escolher listas e áreas</a></p>` +
      (c ? `<label class="chk"><input type="checkbox" id="glyka"${g.avisos === false ? "" : " checked"}> Avisar-me por email dos eventos novos do que sigo</label>
      <label class="chk"><input type="checkbox" id="glyks"${g.semanal === false ? "" : " checked"}> Receber à segunda-feira a semana académica <a href="${B}conta/lykeion.php?ver" target="_blank" rel="noopener">(ver)</a></label>` : "");
  }

  // ---- o que o próprio artista escreveu no painel (conta/artista.php): apresentação, fotografia, ligações, datas acrescentadas ----
  function legendaArtista() {
    const cx = document.getElementById("artcasa"); if (!cx || !cx.dataset.artista) return;
    fetch(B + "conta/artista.php?pub=" + encodeURIComponent(cx.dataset.artista)).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      (j.fora || []).forEach(pg => document.querySelectorAll(`.ad a[href$="/${CSS.escape(pg)}.html"]`).forEach(a => a.parentNode.classList.add("fora")));
      const ROT = { site: "Site", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", spotify: "Spotify", bandcamp: "Bandcamp", soundcloud: "SoundCloud", bilhetes: "Bilhetes" };
      const links = Object.entries(j.links || {}).filter(([, u]) => /^https:\/\//.test(u)).map(([k, u]) => `<a class="ch" href="${esc(u)}" target="_blank" rel="noopener">${esc(ROT[k] || k)}</a>`).join("");
      if (j.apresentacao || j.foto || links) cx.innerHTML = (j.foto ? `<img class="art-foto" src="${esc(j.foto)}" alt="">` : "") + (j.apresentacao ? `<p class="rot">Nas palavras ${j.grupo ? "da companhia" : "do artista"}</p>` + j.apresentacao.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("") : "") + (links ? `<div class="lin">${links}</div>` : "");
      const ex = document.getElementById("artextra"), ds = (j.datas || []).filter(d => d.data >= hoje);
      if (ex && ds.length) ex.innerHTML = `<h3 class="am">Mais datas, indicadas ${j.grupo ? "pela companhia" : "pelo artista"}</h3><ol class="adatas">` + ds.map(d => { const x = dt(d.data);
        return `<li class="ad" data-di="${esc(d.distrito || "")}"><a href="${esc(/^https:\/\//.test(d.link || "") ? d.link : "#")}" target="_blank" rel="noopener"><span class="ad-d"><b>${x.getDate()}</b> ${MES[x.getMonth()]}<small>${SEM[x.getDay()]}${d.hora ? " · " + esc(d.hora) : ""}</small></span>` +
          `<span class="ad-t"><span class="ad-n">${esc(d.sala)}</span><span class="sub">${esc([d.terra, d.distrito].filter(Boolean).join(" · "))}</span></span></a></li>`; }).join("") + "</ol>";
      perto();
    }).catch(() => {});
  }
  // «Só perto de mim»: os distritos que escolheu na conta
  function perto() {
    const b = document.getElementById("aperto"), onde = gostos.onde || []; if (!b || !onde.length) return;
    b.hidden = false; b.textContent = "Só em " + (onde.length > 2 ? onde.length + " distritos" : onde.join(" e "));
    const aplica = () => { const on = b.getAttribute("aria-pressed") === "true";
      document.querySelectorAll(".ad").forEach(li => { li.hidden = on && !onde.includes(li.dataset.di); });
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
      else if (gostos.cats.length || gostos.salas.length || gostos.bairros.length || gostos.artistas.length || (gostos.lyk && (gostos.lyk.inst || []).concat(gostos.lyk.areas || [], gostos.lyk.listas || []).length)) gravarGostos(); // os gostos deste aparelho passam para a conta
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
      window.LG = Object.assign(window.LG || {}, { conta, servidor, gostos, contaPronta: true, gravarToques: t => { gostos.toques = t; return gravarGostos(); } });
      document.dispatchEvent(new CustomEvent("lagenda:conta", { detail: { conta, servidor, gostos } }));
      nav(); paraSi(); paginaConta(); social(); filasSociais(); tuaLegenda(); deQuemFoi(); seguirArtistas(); seguirLykeion(); perto(); });
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
