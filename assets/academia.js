/* lagenda: secção Academia (lê academia.json). Filtros por tipo, formato, área científica, instituição, distrito,
   online ou presencial, aberto ao público e provas públicas. Pensada para poder um dia ser um site à parte. */
(function () {
  "use strict";
  const B = (window.LG && LG.base) || "/", AC = (window.LG && LG.ac != null) ? LG.ac : "academia/", caixa = document.getElementById("academia");
  const ola0 = document.getElementById("lyk-ola");
  if (!caixa && !ola0 && !document.querySelector("[data-fim]")) return;
  const MESL = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const SEML = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dt = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
  const hoje = (() => { const h = iso(new Date()); return window.LG && h < LG.hoje ? LG.hoje : h; })();
  const hora = h => { const m = /(\d{1,2})h(\d{2})?/.exec(h || ""); return m ? m[1].padStart(2, "0") + ":" + (m[2] || "00") : ""; };
  const ler = (k, v) => { try { return JSON.parse(localStorage.getItem(k)) || v; } catch (_) { return v; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const $ = id => document.getElementById(id);
  // 6/11/2026: a entrada e as listas são geradas de noite; o que já passou sai à vista de quem visita (dias passados e,
  // hoje, o que tem hora e acabou há mais de duas horas)
  // «menos disto» (7/11/2026): o que a pessoa escondeu (tipos, instituições e as suas unidades, áreas) não aparece
  let PAIS = {};
  const menos = () => { const g = (window.LG && LG.gostos) || ler("lagenda-gostos", {}); return Object.assign({ tipos: [], inst: [], areas: [] }, ((g || {}).lyk || {}).menos || {}); };
  const naInst = (i, lista) => { for (let k = 0; i && k < 6; k++) { if (lista.includes(i)) return true; i = PAIS[i]; } return false; };
  const escondido = (s, i, as, M) => M.tipos.includes(s) || naInst(i, M.inst) || as.some(a => M.areas.includes(a));
  (() => {
    const agora = new Date(), min = agora.getHours() * 60 + agora.getMinutes(), dia0 = iso(agora);
    document.querySelectorAll("[data-fim]").forEach(a => {
      const fim = a.dataset.fim, d = a.dataset.dia, m = /^(\d\d):(\d\d)/.exec(a.dataset.hr || "");
      const passou = fim < dia0 || (d === dia0 && fim === dia0 && m && +m[1] * 60 + +m[2] + 120 < min);
      if (passou) a.remove();
    });
  })();
  // em cada bloco da entrada: tira o escondido, mostra só os primeiros «mostra», e os dias que ficam com alguma coisa
  const arrumar = () => {
    const M = menos();
    document.querySelectorAll(".lyk-bloco").forEach(b => {
      let n = 0; const max = (b.dataset.mostraTel && matchMedia("(max-width:520px)").matches ? +b.dataset.mostraTel : +b.dataset.mostra) || 99;
      b.querySelectorAll("[data-fim]").forEach(a => {
        const fora = a.dataset.s != null && escondido(a.dataset.s, a.dataset.in || "", (a.dataset.a || "").split(" ").filter(Boolean), M);
        a.hidden = fora || n >= max; if (!a.hidden) n++;
      });
      b.querySelectorAll(".rot").forEach(r => { let x = r.nextElementSibling, ve = false; while (x && !x.classList.contains("rot")) { if (x.matches("[data-fim]") && !x.hidden) { ve = true; break; } x = x.nextElementSibling; } r.hidden = !ve; });
      const vz = b.querySelector(".vazio.lyk-auto");
      if (!n && !vz && !b.querySelector(".vazio")) (b.querySelector(".lyk-cab") || b.querySelector("h2")).insertAdjacentHTML("afterend", `<p class="vazio lyk-auto">Os próximos aparecem na atualização desta noite.</p>`);
      else if (n && vz) vz.remove();
    });
  };
  arrumar();
  document.addEventListener("lagenda:conta", arrumar);
  document.addEventListener("lykeion:gostos", arrumar);
  // «Novo desde a última visita» (7/11/2026): neste aparelho, sem conta. Guarda os eventos que havia na visita anterior
  // (mais de 3 horas antes); o que entrou depois leva a etiqueta «Novo» em todas as páginas.
  let VISTO = ler("lyk-visto", null);
  const NOVOS = new Set((VISTO && VISTO.novos) || []);
  const marcaNovos = (raiz) => {
    if (!NOVOS.size) return;
    (raiz || document).querySelectorAll('a[href*="/e/"]').forEach(a => {
      const m = /\/e\/([^/]+)\.html/.exec(a.getAttribute("href") || "");
      if (m && NOVOS.has(m[1]) && !a.querySelector(".lyk-novo")) { const t = a.querySelector(".lyk-ti,.ti"); if (t) t.insertAdjacentHTML("afterbegin", '<span class="lyk-novo">Novo</span> '); }
    });
  };
  marcaNovos();

  if (!caixa && !ola0) return;
  fetch(B + "academia.json").then(r => r.json()).then(D => {
    PAIS = D.pais || {}; arrumar();
    {  // atualizar a memória da visita (só na entrada, que lê o academia.json)
      const agora = Date.now(), ids = D.ev.map(e => e.pg);
      if (!VISTO || !Array.isArray(VISTO.ids)) VISTO = { t: agora, ids, novos: [], antes: 0 };
      else if (agora - VISTO.t > 3 * 3600e3) { const ja = new Set(VISTO.ids); VISTO = { t: agora, ids, novos: ids.filter(x => !ja.has(x)), antes: VISTO.t }; }
      gravar("lyk-visto", VISTO);
      NOVOS.clear(); const aqui = new Set(ids); VISTO.novos.forEach(x => aqui.has(x) && NOVOS.add(x)); marcaNovos();
      const cx = $("lyk-novos");
      if (cx && NOVOS.size && VISTO.antes) {
        const x = new Date(VISTO.antes), quando = x.toDateString() === new Date().toDateString() ? "hoje" : SEML[x.getDay()].toLowerCase() + ", " + x.getDate() + " de " + MESL[x.getMonth()];
        const nN = D.ev.filter(e => NOVOS.has(e.pg) && e.d.some(x => x >= hoje)).length;
        cx.innerHTML = `<b>${nN} ${nN === 1 ? "evento novo" : "eventos novos"}</b> desde a sua última visita (${quando}). <a href="${B}${AC}?novos=1#resultados">Ver só os novos</a>`;
        cx.hidden = false;
      }
    }
    const SUB = Object.fromEntries(D.subtipos.map(([s, n, f]) => [s, { n, f }]));
    const AREA = Object.fromEntries(D.areas), FINA = Object.fromEntries(D.finas.map(([s, n]) => [s, n]));
    const nomeInst = i => (D.inst[i] || [])[0] || "";
    const linha = (e, d) => {
      // 6/11/2026: sem a etiqueta «Aberto» (quase tudo é aberto; mostra-se o contrário), sem «—» sem hora, sem miniatura sem imagem
      const hh = hora(e.h), etq = [(SUB[e.s] || {}).n].concat(e.m === "online" ? ["Online"] : e.m === "hibrido" ? ["Também online"] : [])
        .concat(e.ac === "pago" ? ["Inscrição paga"] : e.ac === "inscricao" ? ["Com inscrição"] : [])
        .concat(e.li === "en" ? ["Em inglês"] : []);
      const mi = e.i ? `<span class="mi"><img src="${esc(e.i)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.li').classList.add('sem-mi');this.parentNode.remove()"></span>` : "";
      return `<a class="li${mi ? "" : " sem-mi"}" href="${B}e/${e.pg}.html"><span class="hr${hh ? "" : " sem"}">${hh}</span>${mi}` +
        `<span class="tx"><span class="ti">${esc(e.n)}</span><br><span class="lg">${esc(nomeInst(e.in) || e.l)}${e.o ? " · " + esc(e.o) : ""}` +
        `${e.a.length ? " · " + e.a.map(a => esc(AREA[a])).join(", ") : ""}</span></span>` +
        `<span class="dir">${etq.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</span></a>`;
    };
    if (caixa) {
    // 6/11/2026: o botão «Com provas públicas» saiu (as provas filtram-se em «Provas e atos académicos»); as provas aparecem sempre
    const est = Object.assign({ fa: "", sub: "", area: "", inst: "", dist: "", modo: "", aberto: false, q: "" }, ler("lagenda-academia", {}), { q: "", quando: "", provas: true });
    // 7/11/2026: a entrada manda para aqui já filtrado (?q=, ?quando=hoje|fds|semana|mes, ?di=Porto)
    // 7/11/2026 (noite): a página Agenda foi apagada; os resultados abrem-se na própria entrada (#resultados)
    const P = new URLSearchParams(location.search), CH = ["q", "quando", "di", "fa", "sub", "area", "inst", "novos"];
    const comParam = CH.some(k => P.has(k));
    if (comParam) Object.assign(est, { fa: "", sub: "", area: "", inst: "", dist: "", modo: "", aberto: false });
    if (P.get("q")) est.q = P.get("q").trim();
    est.novos = P.get("novos") === "1";
    if (P.get("quando")) est.quando = P.get("quando");
    if (P.get("di")) est.dist = P.get("di");
    ["fa", "sub", "area", "inst"].forEach(k => { if (P.get(k)) est[k] = P.get(k); });
    const res = $("resultados");
    const somar = (s, n) => { const x = dt(s); x.setDate(x.getDate() + n); return iso(x); };
    const janela = () => {  // [primeiro dia, último dia] do filtro «quando»
      const w = dt(hoje).getDay();  // 0 = domingo
      if (est.quando === "hoje") return [hoje, hoje];
      if (est.quando === "fds") return w === 0 ? [hoje, hoje] : w === 6 ? [hoje, somar(hoje, 1)] : [somar(hoje, 6 - w), somar(hoje, 7 - w)];
      if (est.quando === "semana") return [hoje, somar(hoje, 6)];
      if (est.quando === "mes") return [hoje, somar(hoje, 30)];
      return [hoje, "9999"];
    };
    const PASSO = 60; let mostrar = PASSO;  // a lista mostra 60 eventos de cada vez («Mostrar mais»), não os 1 400 seguidos
    const h = decodeURIComponent(location.hash.slice(1));  // #congresso, #saude, #ulisboa, #provas…
    const hFiltro = h && (D.familias.some(([s]) => s === h) || SUB[h] || AREA[h] || D.inst[h]);
    if (hFiltro) Object.assign(est, { fa: "", sub: "", area: "", inst: "" },
      D.familias.some(([s]) => s === h) ? { fa: h } : SUB[h] ? { sub: h } : AREA[h] ? { area: h } : D.inst[h] ? { inst: h } : {});
    if (res && (comParam || hFiltro || h === "resultados")) {
      res.hidden = false; document.body.classList.add("lyk-com-res");
      // 7/11/2026 (uniformizar): os resultados abrem com o mesmo topo das outras páginas, em vez de saltar por cima dele
      const t1 = document.querySelector(".lyk-abre h1"); if (t1) t1.textContent = est.novos ? "Novos desde a última visita" : "Procurar na agenda";
      setTimeout(() => { scrollTo(0, 0); if (!est.q && h === "resultados" && !comParam) $("abusca").focus({ preventScroll: true }); }, 0);
    }
    const opcoes = (el, lista, val) => { el.innerHTML = el.options[0].outerHTML + lista.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join(""); el.value = val; };
    // só se oferecem as opções que têm eventos
    const usa = k => new Set(D.ev.flatMap(e => [].concat(e[k] || [])));
    const us = usa("s"), ua = usa("a"), ui = usa("in");
    opcoes($("asub"), D.subtipos.filter(([s]) => us.has(s)).map(([s, n]) => [s, n]), est.sub);
    opcoes($("aarea"), D.areas.filter(([s]) => ua.has(s)), est.area);
    const insts = Object.entries(D.inst).filter(([i, r]) => ui.has(i) || Object.entries(D.inst).some(([j, x]) => x[2] === i && ui.has(j)))
      .sort((a, b) => a[1][0].localeCompare(b[1][0], "pt")).map(([i, r]) => [i, (r[2] ? "— " : "") + r[0]]);
    opcoes($("ainst"), insts, est.inst);
    opcoes($("adist"), D.dists.map(d => [d, d]), est.dist);

    let nEsc = 0, M = menos();
    const passa = e => {
      if (est.novos && !NOVOS.has(e.pg)) return false;
      if (!est.provas && e.so) return false;
      if (est.fa && e.fa !== est.fa) return false;
      if (est.sub && e.s !== est.sub) return false;
      if (est.area && !e.a.includes(est.area)) return false;
      if (est.inst && e.in !== est.inst && ((D.inst[e.in] || [])[2] !== est.inst)) return false;
      if (est.dist && e.di !== est.dist) return false;
      if (est.modo === "online" && e.m === "presencial") return false;
      if (est.modo === "presencial" && e.m === "online") return false;
      if (est.aberto && e.ac !== "livre" && !e.g) return false;
      if (!est.verTudo && !est.q && escondido(e.s, e.in, e.a.concat(e.af || []), M)) { nEsc++; return false; }
      if (est.q && !norm([e.n, e.l, e.o, e.di, nomeInst(e.in), (SUB[e.s] || {}).n, ...e.a.map(a => AREA[a]), ...e.af.map(a => FINA[a])].join(" ")).includes(norm(est.q))) return false;
      return true;
    };
    const desenha = () => {
      document.querySelectorAll("#afam [data-fa]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fa === est.fa));
      document.querySelectorAll("#aquando [data-quando]").forEach(b => b.setAttribute("aria-pressed", b.dataset.quando === est.quando));
      const [ini, fim] = janela();
      M = menos(); nEsc = 0;
      $("aonline").setAttribute("aria-pressed", est.modo === "online");
      $("apresencial").setAttribute("aria-pressed", est.modo === "presencial");
      $("aaberto").setAttribute("aria-pressed", est.aberto);
      const nf = [est.sub, est.area, est.inst, est.dist, est.modo, est.aberto].filter(Boolean).length;
      if ($("anf")) $("anf").textContent = nf ? "(" + nf + ")" : "";
      // cada evento aparece no próximo dia em que acontece; os abertos ao público primeiro
      const dias = {};
      for (const e of D.ev) {
        if (!passa(e)) continue;
        const d = e.d.find(x => x >= ini && x <= fim); if (!d) continue;
        (dias[d] = dias[d] || []).push(e);
      }
      const ordem = e => (e.ac === "livre" || e.g ? 0 : e.ac === "pago" ? 2 : 1);
      // 8/11/2026 (Paulo: os resultados «à imagem da página inicial»): números, «Em destaque» em cartões e cada dia numa secção
      const SEMC = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], MESC = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      const cartao = (e, d) => { const x = dt(d), hh = hora(e.h);
        return `<a class="lyk-cartao" href="${B}e/${e.pg}.html"><span class="lyk-quando">${SEMC[x.getDay()]} ${x.getDate()} ${MESC[x.getMonth()]}${hh ? " · " + hh : ""}</span>` +
          `<span class="lyk-ti">${esc(e.n)}</span><span class="lyk-onde">${esc(nomeInst(e.in) || e.l)}${e.o ? " · " + esc(e.o) : ""}</span><span class="tag">${esc((SUB[e.s] || {}).n || "")}</span></a>`; };
      const PESO = { congresso: 0, "conferencia-cientifica": 0, simposio: 0, coloquio: 1, jornadas: 1, "aula-aberta": 1, licao: 1, conferencia: 2, seminario: 3 };
      const FORA = ["exposicao", "cinema-debate", "workshop", "curso-livre", "masterclass", "sessao-solene", "webinar", "provas-mestrado"];
      let html = "", total = 0, postos = 0; const insts = new Set(), todosDias = Object.keys(dias).sort(), cand = [];
      for (const d of todosDias) for (const e of dias[d]) { if (e.in) insts.add(e.in); if (!FORA.includes(e.s) && cand.length < 400) cand.push([d, e]); }
      const nTotal = todosDias.reduce((n, d) => n + dias[d].length, 0);
      const dest = [], vistas = new Set();
      if (nTotal > 8) for (const [d, e] of cand.sort((a, b) => (PESO[a[1].s] ?? 4) - (PESO[b[1].s] ?? 4) || (a[1].i ? 0 : 1) - (b[1].i ? 0 : 1) || a[0].localeCompare(b[0]))) {
        const q = e.in || e.l; if (vistas.has(q)) continue; vistas.add(q); dest.push([d, e]); if (dest.length === 4) break;
      }
      dest.sort((a, b) => a[0].localeCompare(b[0]));
      const noDest = new Set(dest.map(([, e]) => e.pg));
      html += `<div class="lyk-numeros"><div><b>${nTotal}</b><span>${nTotal === 1 ? "evento" : "eventos"}</span></div><div><b>${insts.size}</b><span>${insts.size === 1 ? "instituição" : "instituições"}</span></div><div><b>${todosDias.length}</b><span>${todosDias.length === 1 ? "dia" : "dias"}</span></div></div>`;
      if (dest.length) html += `<section class="lyk-sec"><div class="lyk-cab"><h2>Em destaque</h2></div><div class="lyk-cartoes">${dest.map(([d, e]) => cartao(e, d)).join("")}</div></section>`;
      for (const d of todosDias) {
        const evs = dias[d].filter(e => !noDest.has(e.pg)).sort((a, b) => (hora(a.h) || "99").localeCompare(hora(b.h) || "99") || ordem(a) - ordem(b) || a.n.localeCompare(b.n));
        total += evs.length; const x = dt(d);
        if (postos >= mostrar || !evs.length) continue;
        const vai = evs.slice(0, mostrar - postos); postos += vai.length;
        html += `<section class="lyk-sec lyk-res-dia"><div class="lyk-cab"><h2>${d === hoje ? "Hoje" : SEML[x.getDay()]}, ${x.getDate()} de ${MESL[x.getMonth()]}${x.getFullYear() !== dt(hoje).getFullYear() ? " de " + x.getFullYear() : ""}</h2><span class="sub">${dias[d].length}</span></div>${vai.map(e => linha(e, d)).join("")}</section>`;
      }
      total += dest.length; postos += dest.length;
      if (nEsc) html = `<p class="sub lyk-esc">${nEsc} ${nEsc === 1 ? "evento escondido" : "eventos escondidos"} pelo que escolheu não ver. <button class="ch" id="avertudo">Mostrar também</button> · <a href="${B}conta.html#lykeion">O que vejo</a></p>` + html;
      if (total > postos) html += `<p class="lyk-maisev"><button class="bt" id="amaisev">Mostrar mais (faltam ${total - postos})</button></p>`;
      caixa.innerHTML = html || '<p class="vazio">Nada com estes filtros. Experimente tirar um.</p>';
      $("acontagem").textContent = `${total} ${total === 1 ? "evento" : "eventos"} ${({ hoje: "hoje", fds: "no fim de semana", semana: "nos próximos sete dias", mes: "nos próximos 30 dias" })[est.quando] || "de hoje em diante"}`;
      if (est.novos) $("acontagem").textContent = `${total} ${total === 1 ? "evento novo" : "eventos novos"} desde a sua última visita`;
      marcaNovos(caixa);
      // «Avise-me» (7/11/2026): guardar esta pesquisa; o conta.js trata do clique (data-avise) e grava nos gostos
      const pq = { q: est.q, fa: est.fa, sub: est.sub, area: est.area, inst: est.inst, dist: est.dist };
      let av = $("aavise");
      if (!av) { $("acontagem").insertAdjacentHTML("afterend", '<p class="lyk-avise"><button class="ch" id="aavise" type="button">Avise-me de eventos novos</button> <span class="sub" id="aaviso"></span></p>'); av = $("aavise"); }
      const temPq = Object.values(pq).some(Boolean);
      av.parentNode.hidden = !temPq;
      if (temPq) { const on = !!(window.LG && LG.lykPesquisaGuardada && LG.lykPesquisaGuardada(pq)); av.dataset.avise = JSON.stringify(Object.fromEntries(Object.entries(pq).filter(([, v]) => v)));
        av.setAttribute("aria-pressed", on); av.textContent = on ? "Aviso ligado ✓" : "Avise-me de eventos novos"; }
      gravar("lagenda-academia", Object.assign({}, est, { q: "", quando: "", verTudo: false, novos: false }));
    };
    const muda = () => { mostrar = PASSO; desenha(); };  // um filtro novo volta aos primeiros 60
    $("abusca").value = est.q;
    if ($("aquando")) $("aquando").addEventListener("click", ev => { const b = ev.target.closest("[data-quando]"); if (b) { est.quando = b.dataset.quando; muda(); } });
    $("afam").addEventListener("click", ev => { const b = ev.target.closest("[data-fa]"); if (b) { est.fa = b.dataset.fa; muda(); } });
    [["asub", "sub"], ["aarea", "area"], ["ainst", "inst"], ["adist", "dist"]].forEach(([id, k]) => $(id).addEventListener("change", ev => { est[k] = ev.target.value; muda(); }));
    $("aonline").addEventListener("click", () => { est.modo = est.modo === "online" ? "" : "online"; muda(); });
    $("apresencial").addEventListener("click", () => { est.modo = est.modo === "presencial" ? "" : "presencial"; muda(); });
    $("aaberto").addEventListener("click", () => { est.aberto = !est.aberto; muda(); });
    $("abusca").addEventListener("input", ev => { est.q = ev.target.value.trim(); muda(); });
    caixa.addEventListener("click", ev => { if (ev.target.id === "amaisev") { mostrar += PASSO * 2; desenha(); } if (ev.target.id === "avertudo") { est.verTudo = true; desenha(); } });
    document.addEventListener("lagenda:conta", desenha);
    if ($("aabrir")) $("aabrir").addEventListener("click", () => {  // telemóvel: os filtros abrem e fecham
      const f = $("afiltros"), aberto = !f.classList.contains("aberto");
      f.classList.toggle("aberto", aberto); $("aabrir").setAttribute("aria-expanded", aberto);
    });
    desenha();

    }
    // «Olá, <nome>» na entrada do Lykeion: o que vem das instituições (e das suas unidades), áreas e listas que a pessoa segue
    const ola = $("lyk-ola");
    const pertence = (i, alvo) => { for (let k = 0; i && k < 6; k++) { if (i === alvo) return true; i = (D.pais || {})[i]; } return false; };
    const naLista = (e, f) => (!f.subtipos || f.subtipos.includes(e.s)) && (!f.familias || f.familias.includes(e.fa)) &&
      (!f.areas || e.a.some(a => f.areas.includes(a))) && (!f.modo || f.modo.includes(e.m)) && (!f.lingua || f.lingua.includes(e.li)) &&
      (!f.distritos || f.distritos.includes(e.di)) && (!f.chamada || (e.pz || "") >= (window.LG || {}).hoje);
    const poeOla = (conta, gostos) => {
      if (!ola || !conta) return;
      const g = Object.assign({ inst: [], areas: [], listas: [], series: [], pesquisas: [], ecos: [] }, (gostos || {}).lyk || {});
      // os ecossistemas da pessoa (8/11/2026): instituições juntadas, os centros da área de base, menos as tiradas
      const noEco = (ec, e) => { const fora = ec.fora || [], ia = D.ia || {};
        for (let k = 0, x = e.in; x && k < 7; k++, x = (D.pais || {})[x]) { if (fora.includes(x)) return false; if ((ec.inst || []).includes(x) || (ec.base && (ia[x] || []).includes(ec.base))) return true; }
        return !!ec.base && (e.af || []).includes(ec.base); };
      const naPq = (e, p) => (!p.fa || e.fa === p.fa) && (!p.sub || e.s === p.sub) && (!p.area || e.a.concat(e.af || []).includes(p.area)) &&
        (!p.inst || pertence(e.in, p.inst)) && (!p.dist || e.di === p.dist) && (!p.q || norm([e.n, e.l, e.o, e.di, nomeInst(e.in)].join(" ")).includes(norm(p.q)));
      const nome = (conta.nome || "").trim().split(/\s+/)[0];
      const cab = `<h2>Olá${nome ? ", " + esc(nome) : ""}.</h2>`;
      if (!g.inst.length && !g.areas.length && !g.listas.length && !g.series.length && !g.pesquisas.length && !g.ecos.length) {
        ola.innerHTML = cab + `<p class="sub">Siga instituições, áreas ou listas e passa a ter aqui o que lhe interessa, com aviso por email e a semana académica à segunda. ` +
          `<a href="${B}${AC}instituicoes/">Escolher instituições</a> · <a href="${B}${AC}listas/">listas e áreas</a></p>`;
      } else {
        const meus = [];
        for (const e of D.ev) {
          const d = e.d.find(x => x >= hoje); if (!d) continue;
          if (escondido(e.s, e.in, e.a.concat(e.af || []), menos())) continue;
          if (g.inst.some(i => pertence(e.in, i)) || e.a.concat(e.af || []).some(a => g.areas.includes(a)) || g.listas.some(l => D.listas[l] && naLista(e, D.listas[l][1])) || (e.se && g.series.includes(e.se)) || g.pesquisas.some(p => naPq(e, p)) || g.ecos.some(ec => noEco(ec, e))) meus.push([d, e]);
        }
        meus.sort((a, b) => a[0].localeCompare(b[0]) || a[1].n.localeCompare(b[1].n));
        let ant = "";
        setTimeout(() => marcaNovos(ola), 0);
        const linhas = meus.slice(0, 5).map(([d, e]) => { const x = dt(d), cab = d === ant ? "" : `<p class="rot">${d === hoje ? "Hoje" : SEML[x.getDay()] + ", " + x.getDate() + " de " + MESL[x.getMonth()]}</p>`; ant = d; return cab + linha(e, d); }).join("");
        ola.innerHTML = cab + `<p class="sub">${meus.length ? `Do que segue, ${meus.length === 1 ? "vem aí 1 evento" : "vêm aí " + meus.length + " eventos"}.` : "Do que segue, ainda não há nada marcado."} ` +
          `<a href="${B}${AC}a-minha-area/">A minha área</a></p>` + linhas;
      }
      ola.hidden = false;
    };
    if (window.LG && LG.contaPronta) poeOla(LG.conta, LG.gostos);
    document.addEventListener("lagenda:conta", ev => poeOla(ev.detail.conta, ev.detail.gostos));
  }).catch(() => {});  // sem dados, fica a lista feita no servidor
})();
