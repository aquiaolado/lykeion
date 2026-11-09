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
    document.dispatchEvent(new CustomEvent("lyk:dados", { detail: D }));
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
        .concat(e.li === "en" ? ["Em inglês"] : []).concat(e.ins ? ["Inscrição aqui"] : []).concat(e.ax ? ["Acessível"] : []);
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
    if (comParam) Object.assign(est, { fa: "", sub: "", area: "", inst: "", dist: "", modo: "", aberto: false, ingles: false, acess: false, tv: false });
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
      if (est.ingles && e.li !== "en") return false;  // 8/11/2026
      if (est.acess && !(e.ax || []).length) return false;
      if (est.tv && !e.tv) return false;
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
      [["aingles", "ingles"], ["aacess", "acess"], ["atv", "tv"]].forEach(([i, k]) => { if ($(i)) $(i).setAttribute("aria-pressed", !!est[k]); });
      const nf = [est.sub, est.area, est.inst, est.dist, est.modo, est.aberto, est.ingles, est.acess, est.tv].filter(Boolean).length;
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
    [["aingles", "ingles"], ["aacess", "acess"], ["atv", "tv"]].forEach(([i, k]) => { if ($(i)) $(i).addEventListener("click", () => { est[k] = !est[k]; muda(); }); });
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
      (!f.distritos || f.distritos.includes(e.di)) && (!f.chamada || (e.pz || "") >= (window.LG || {}).hoje) &&
      (!f.acess || (e.ax || []).some(x => f.acess.includes(x)));
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
/* Lykeion (8/11/2026): inscrição gratuita na página do evento (conta/inscrever.php). Mostra quantos já se inscreveram e
   quantos lugares restam, envia sem sair da página e preenche nome e email com os da conta, se houver. */
(function () {
  "use strict";
  const s = document.getElementById("inscricao");
  if (!s) return;
  const api = s.dataset.api, ev = s.dataset.insc, f = s.querySelector("form"), n = s.querySelector(".lyk-insc-n");
  const t = f.querySelector('[name="t"]'); if (t) t.value = Math.floor(Date.now() / 1000);
  const conta = () => { const c = (window.LG && LG.conta) || null; if (!c) return;
    if (c.email && !f.email.value) f.email.value = c.email; if (c.nome && !f.nome.value) f.nome.value = c.nome; };
  conta(); document.addEventListener("lagenda:conta", conta);
  const mostra = d => {
    if (!d || !d.ok) return;
    if (d.cancelado) { n.textContent = "Este evento foi cancelado."; f.hidden = true; return; }
    if (d.fechado) { n.textContent = "As inscrições estão fechadas." + (d.n ? ` ${d.n} inscritos.` : ""); f.hidden = true; return; }
    const p = d.n === 1 ? "1 pessoa inscrita" : `${d.n} pessoas inscritas`;
    n.textContent = d.lot ? (!d.n ? `${d.lot} lugares. Ainda ninguém se inscreveu.` : d.restam > 0 ? `${p} · ${d.restam === 1 ? "resta 1 lugar" : `restam ${d.restam} lugares`} de ${d.lot}.` : `${p} · cheio: quem se inscrever fica em lista de espera.`)
                          : (d.n ? `${p}.` : "Seja o primeiro a inscrever-se.");
    f.querySelector("button").textContent = d.lot && d.restam <= 0 ? "Entrar na lista de espera" : "Inscrever-me";
  };
  fetch(`${api}?ev=${encodeURIComponent(ev)}&n`, { cache: "no-store" }).then(r => r.json()).then(mostra).catch(() => {});
  f.addEventListener("submit", ev_ => {
    ev_.preventDefault();
    const b = f.querySelector("button"); b.disabled = true;
    fetch(f.action, { method: "POST", body: new FormData(f), headers: { Accept: "application/json" } })
      .then(r => r.json()).then(d => {
        const p = document.createElement("p"); p.className = "lyk-insc-msg" + (d.ok ? " ok" : ""); p.textContent = d.msg || "Não conseguimos receber. Tente outra vez.";
        s.querySelectorAll(".lyk-insc-msg").forEach(x => x.remove()); f.after(p);
        if (d.ok) { f.hidden = true; fetch(`${api}?ev=${encodeURIComponent(ev)}&n`, { cache: "no-store" }).then(r => r.json()).then(x => { mostra(x); f.hidden = true; }).catch(() => {}); }
      }).catch(() => { b.disabled = false; f.submit(); }).finally(() => { b.disabled = false; });
  });
})();

/* «O meu Lykeion» (9/11/2026; antes, 8/11/2026, as três portas). Para investigadores, docentes e estudantes de mestrado,
   doutoramento e pós-graduações (decisão do Paulo). Três toques, uma vez, sem mudar de página: a área (a grande abre as finas
   no sítio), a faculdade ou centro (várias) e o momento. Depois a entrada é a secretária de cada um: as escolhas no topo,
   cada uma com ×; separadores Esta semana · Próximos 30 dias · Prazos · Provas · Tudo; a razão de cada evento; a coluna com
   prazos, provas e formação. Fica neste aparelho (lyk-porta); com conta, vai para a conta (gostos.lyk.porta) e vale em todos
   os aparelhos e no email de segunda. Partilhar: ?mesa=a.sociologia,i.iscte (os docentes mandam aos alunos). */
(function () {
  "use strict";
  const box = document.getElementById("lyk-portas"); if (!box) return;
  const B = (window.LG && LG.base) || "/";
  const $ = id => document.getElementById(id);
  const inp = $("lykfac"), op = $("lykfacop"), volta = $("lyk-volta"), escF = $("lykfacesc"), finasBox = $("lykfinas");
  const perfil = $("lyk-perfil"), mesa = $("lyk-mesa"), geral = $("lyk-geral"), partilha = $("lyk-partilha");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lerLS = (k, v) => { try { return JSON.parse(localStorage.getItem(k)) || v; } catch (_) { return v; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const SOUS = { mestrando: "Mestrando ou pós-graduado", doutorando: "Doutorando", investigador: "Investigador", docente: "Docente", outro: "Outro" };
  // o estado: {areas:[slug], insts:[{id,nome}], sou:"", t:carimbo}. Converte o formato de 8/11/2026 ({inst,nome,area,fina,sou}).
  const arrumar = o => {
    o = (o && typeof o === "object") ? o : {};
    const r = { areas: Array.isArray(o.areas) ? o.areas.filter(x => typeof x === "string").slice(0, 8) : [],
                insts: Array.isArray(o.insts) ? o.insts.filter(x => x && x.id).map(x => ({ id: String(x.id), nome: String(x.nome || x.id) })).slice(0, 6) : [],
                sou: SOUS[o.sou] ? o.sou : o.sou === "estudante" ? "mestrando" : "", t: +o.t || 0,
                onde: Array.isArray(o.onde) ? o.onde.filter(x => typeof x === "string").slice(0, 21) : [] };
    if (o.inst && !r.insts.some(x => x.id === o.inst)) r.insts.push({ id: o.inst, nome: o.nome || o.inst });
    if (o.fina && !r.areas.includes(o.fina)) r.areas.push(o.fina); else if (o.area && !o.fina && !r.areas.includes(o.area)) r.areas.push(o.area);
    return r;
  };
  const vazio = p => !p.areas.length && !p.insts.length && !p.sou && !p.onde.length;
  let ondeMais = false, P = arrumar(lerLS("lyk-porta", {})), D = null, editar = vazio(P), aberta = "", sep = "semana", mostrar = 30;
  // seleção partilhada (?mesa=a.sociologia,i.iscte,s.docente): vê-se sem mexer na da pessoa, e pode guardar-se
  let alheia = null;
  { const m = new URLSearchParams(location.search).get("mesa");
    if (m) { const o = { areas: [], insts: [], sou: "" };
      m.split(",").forEach(x => { const [k, v] = [x.slice(0, 1), x.slice(2)]; if (!v) return;
        if (k === "a") o.areas.push(v); else if (k === "i") o.insts.push({ id: v, nome: v }); else if (k === "s") o.sou = v; else if (k === "o") (o.onde = o.onde || []).push(v); });
      alheia = arrumar(o); if (!vazio(alheia)) editar = false; else alheia = null; } }
  const atual = () => alheia || P;
  const conta = () => window.LG && LG.conta;
  const guardar = () => {
    P.t = Date.now(); gravarLS("lyk-porta", P);
    if (conta() && LG.gravarPorta) LG.gravarPorta({ areas: P.areas, insts: P.insts, sou: P.sou, onde: P.onde, t: P.t });
  };

  // ---- 2 · a faculdade ou centro: procura nas entidades ----
  let L = null, pedido = null, sel = -1, vis = [];
  const carregar = () => pedido || (pedido = fetch(inp.dataset.lista).then(r => r.json()).then(x => (L = x.map(r => [r, norm(r[0] + " " + r[1] + " " + r[2] + " " + r[3])]))).catch(() => (L = [])));
  const escolheFac = r => { if (!P.insts.some(x => x.id === r[0])) P.insts = P.insts.concat({ id: r[0], nome: r[2] || r[1] }).slice(-6);
    inp.value = ""; vis = []; desenhaOp(); mudou(); };
  const desenhaOp = () => {
    op.innerHTML = vis.map((r, k) => `<li role="option" data-k="${k}"${k === sel ? ' aria-selected="true"' : ""}><b>${esc(r[1])}</b>` +
      `${r[2] && !norm(r[1]).includes(norm(r[2])) ? " <span>" + esc(r[2]) + "</span>" : ""}${r[3] ? ' <span class="sub">' + esc(r[3]) + "</span>" : ""}` +
      `${r[4] ? ' <span class="n">' + r[4] + (r[4] === 1 ? " evento" : " eventos") + "</span>" : ""}</li>`).join("");
    op.hidden = !vis.length;
  };
  const procura = () => {
    const q = norm(inp.value.trim()); sel = -1;
    if (q.length < 2 || !L) { vis = []; desenhaOp(); return; }
    const ps = q.split(/\s+/), sig = L.filter(([r]) => norm(r[2]) === q || r[0] === q).map(x => x[0]);
    vis = sig.concat(L.filter(([r, t]) => !sig.includes(r) && ps.every(p => t.includes(p))).map(x => x[0])).slice(0, 8);
    desenhaOp();
  };
  inp.addEventListener("focus", carregar);
  inp.addEventListener("input", () => { if (L) procura(); else carregar().then(procura); });
  inp.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { if (!vis.length) return; ev.preventDefault(); sel = (sel + (ev.key === "ArrowDown" ? 1 : vis.length - 1)) % vis.length; desenhaOp(); }
    else if (ev.key === "Enter") { ev.preventDefault(); const r = vis[sel < 0 ? 0 : sel]; if (r) escolheFac(r); }
    else if (ev.key === "Escape") { vis = []; desenhaOp(); }
  });
  op.addEventListener("mousedown", ev => { const li = ev.target.closest("li"); if (li) { ev.preventDefault(); escolheFac(vis[+li.dataset.k]); } });
  inp.addEventListener("blur", () => setTimeout(() => { vis = []; desenhaOp(); }, 150));

  // ---- nomes e pertenças ----
  const nomeArea = s => ((D ? D.areas.concat(D.finas) : []).find(x => x[0] === s) || [])[1] ||
    ((box.querySelector(`[data-porta-area="${s}"],[data-porta-fina="${s}"]`) || {}).textContent) || s;
  const curto = n => String(n).replace(/^Ciências (Médicas e da |Exatas e |Agrárias e |)/, "").replace(/ e Sociedade$/, "").replace(/^Engenharia (Eletrotécnica e de Computadores)$/, "Eng. Eletrotécnica");
  const paiDe = f => ((box.querySelector(`[data-porta-fina="${f}"]`) || {}).dataset || {}).pai || "";
  const pertence = (i, alvo) => { for (let k = 0; i && k < 7; k++) { if (i === alvo) return true; i = (D.pais || {})[i]; } return false; };

  // ---- marcar / desmarcar (carregar outra vez tira) ----
  box.addEventListener("click", ev => {
    const a = ev.target.closest("[data-porta-area],[data-porta-fina],[data-porta-sou],[data-porta-onde],[data-onde-mais],[data-tirar],[data-pronto]"); if (!a) return;
    ev.preventDefault();
    if (a.dataset.pronto != null) { editar = false; mudou(); scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (a.dataset.tirar) { tirar(a.dataset.tirar); return; }
    if (a.dataset.portaArea) {
      const s = a.dataset.portaArea, finasDela = [...box.querySelectorAll(`[data-pai="${s}"]`)].map(b => b.dataset.portaFina);
      if (P.areas.includes(s) || P.areas.some(x => finasDela.includes(x))) { P.areas = P.areas.filter(x => x !== s && !finasDela.includes(x)); aberta = aberta === s ? "" : aberta; }
      else { P.areas = P.areas.concat(s); aberta = s; }
    } else if (a.dataset.portaFina) {
      const f = a.dataset.portaFina, pai = a.dataset.pai;
      if (P.areas.includes(f)) { P.areas = P.areas.filter(x => x !== f); if (!P.areas.some(x => paiDe(x) === pai)) P.areas = P.areas.concat(pai); }
      else P.areas = P.areas.filter(x => x !== pai).concat(f);  // a fina diz mais do que a grande
    } else if (a.dataset.portaSou) P.sou = P.sou === a.dataset.portaSou ? "" : a.dataset.portaSou;
    else if (a.dataset.ondeMais != null) { ondeMais = !ondeMais; marcar(); return; }
    else if (a.dataset.portaOnde) { const d = a.dataset.portaOnde; P.onde = P.onde.includes(d) ? P.onde.filter(x => x !== d) : P.onde.concat(d); }
    mudou();
  });
  const tirar = k => {
    if (alheia) { alheia = null; }
    if (k === "tudo") P = arrumar({});
    else if (k === "sou") P.sou = "";
    else if (k.startsWith("o:")) P.onde = P.onde.filter(x => x !== k.slice(2));
    else if (k.startsWith("i:")) P.insts = P.insts.filter(x => x.id !== k.slice(2));
    else if (k.startsWith("a:")) P.areas = P.areas.filter(x => x !== k.slice(2));
    if (vazio(P)) editar = true;
    mudou();
  };
  const marcar = () => {
    const ativa = s => P.areas.includes(s) || P.areas.some(x => paiDe(x) === s);
    box.querySelectorAll("[data-porta-area]").forEach(b => { const on = ativa(b.dataset.portaArea); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    box.querySelectorAll("[data-porta-sou]").forEach(b => { const on = b.dataset.portaSou === P.sou; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    box.querySelectorAll("[data-porta-onde]").forEach(b => { const on = P.onde.includes(b.dataset.portaOnde); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
      if (b.classList.contains("lyk-onde-mais")) b.hidden = !ondeMais && !on; });
    const bm = box.querySelector("[data-onde-mais]"); if (bm) bm.textContent = ondeMais ? "Menos" : "Mais";
    if (!aberta || !ativa(aberta)) aberta = (P.areas.map(x => paiDe(x) || x).filter(x => box.querySelector(`[data-porta-area="${x}"]`)).slice(-1)[0]) || "";
    let nf = 0;
    box.querySelectorAll("[data-porta-fina]").forEach(b => { const v = b.dataset.pai === aberta; b.hidden = !v; if (v) nf++;
      const on = P.areas.includes(b.dataset.portaFina); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    finasBox.hidden = !nf;
    escF.hidden = !P.insts.length;
    escF.innerHTML = P.insts.map(x => `<span class="ch on">${esc(x.nome)} <button type="button" class="lyk-x" data-tirar="i:${esc(x.id)}" aria-label="Tirar ${esc(x.nome)}">×</button></span>`).join(" ");
    inp.placeholder = P.insts.length ? "Juntar outra" : "Nome ou sigla (pode juntar várias)";
  };

  // ---- o que é desta pessoa ----
  const SOU = { mestrando: ["sessoes", "formacao", "provas", "reunioes", "livros"], doutorando: ["sessoes", "formacao", "reunioes", "provas", "livros"],
                investigador: ["reunioes", "sessoes", "provas", "formacao", "livros"], docente: ["sessoes", "reunioes", "provas", "formacao", "livros"],
                outro: ["sessoes", "divulgacao", "reunioes", "formacao", "provas", "livros"] };
  const hoje = () => (window.LG && LG.hoje) || new Date().toISOString().slice(0, 10);
  const mais = n => { const d = new Date(hoje() + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const prox = e => e.d.find(x => x >= hoje()) || (e.f >= hoje() ? hoje() : "");
  const FORA_S = new Set(["exposicao", "cinema-debate"]);
  const util = e => prox(e) && !FORA_S.has(e.s) && (e.fa !== "divulgacao" || atual().sou === "outro");
  const porque = (e, p) => {
    const r = [];
    const i = p.insts.find(x => pertence(e.in, x.id)); if (i) r.push(["fac", i.nome]);
    const ar = p.areas.find(a => (e.af || []).includes(a)) || p.areas.find(a => (e.a || []).includes(a)); if (ar) r.push(["ar", curto(nomeArea(ar))]);
    return r;
  };
  // onde (9/11/2026): estreita tudo aos distritos escolhidos (e aos eventos online, se «Online» estiver escolhido)
  const noSitio = (e, p) => !p.onde.length || p.onde.includes(e.di) || (p.onde.includes("online") && e.m === "online");
  const meus = p => {
    const so = !p.areas.length && !p.insts.length;
    return D.ev.filter(e => util(e) && noSitio(e, p)).map(e => ({ e, r: so ? [] : porque(e, p) }))
      .filter(x => so ? (p.sou ? (SOU[p.sou] || []).slice(0, 2).includes(x.e.fa) : p.onde.length > 0) : x.r.length);
  };
  const peso = (p, e) => { const o = SOU[p.sou] || ["reunioes", "sessoes", "provas", "formacao", "livros"]; const k = o.indexOf(e.fa); return k < 0 ? 9 : k; };
  const horaN = e => { const m = /(\d{1,2})h(\d{2})?/.exec(e.h || ""); return m ? +m[1] * 60 + +(m[2] || 0) : 9999; };
  const dd = d => { const [, m, x] = d.split("-"); return +x + "/" + +m; };
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], SEMD = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const longo = d => { const x = new Date(d + "T12:00:00"); return `${SEMD[x.getDay()]}, ${x.getDate()} de ${["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"][x.getMonth()]}`; };
  const faltam = d => Math.round((new Date(d + "T12:00:00") - new Date(hoje() + "T12:00:00")) / 864e5);
  const gcal = e => { const d = prox(e).replace(/-/g, ""), x = new Date(prox(e) + "T12:00:00"); x.setDate(x.getDate() + 1);
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(e.n) + "&dates=" + d + "/" + x.toISOString().slice(0, 10).replace(/-/g, "") +
      "&details=" + encodeURIComponent(location.origin + B + "e/" + e.pg + ".html") + "&location=" + encodeURIComponent([e.l, e.o].filter(Boolean).join(", ")); };
  const guard = () => lerLS("lagenda-guardados", []);
  const linha = (x, p) => {
    const e = x.e, h = /(\d{1,2}h\d{0,2})/.exec(e.h || ""), g = guard().includes(e.pg);
    const sub = ((D.subtipos || []).find(s => s[0] === e.s) || [])[1] || "";
    return `<div class="lyk-ev"><span class="lyk-ev-h">${h ? esc(h[1]) : ""}</span><span class="lyk-ev-t"><a href="${B}e/${e.pg}.html"><b>${esc(e.n)}</b></a>` +
      `<span class="lyk-ev-o">${x.r.map(([k, n]) => `<span class="lyk-mot ${k}">${esc(n)}</span>`).join("")}${esc(sub)}${sub ? " · " : ""}${esc([(D.inst[e.in] || [])[1] || (D.inst[e.in] || [])[0] || e.l, e.o].filter(Boolean).join(" · "))}` +
      `${e.m === "online" ? " · online" : ""}</span></span><span class="lyk-ev-ac">` +
      `<button type="button" class="lyk-g" data-guardar="${esc(e.pg)}" aria-pressed="${g}" title="Guardar" aria-label="Guardar">${g ? "★" : "☆"}</button>` +
      `<a href="${gcal(e)}" target="_blank" rel="noopener" title="Juntar ao Google Calendar">Calendário</a>` +
      (p.sou === "docente" ? `<button type="button" class="lyk-part" data-partilhar="${esc(e.pg)}" data-nome="${esc(e.n)}">Partilhar</button>` : "") + "</span></div>";
  };
  const lista = (xs, p, porDia = true) => {
    let h = "", ant = "";
    xs.slice(0, mostrar).forEach(x => { const d = prox(x.e); if (porDia && d !== ant) h += `<p class="lyk-mdia">${longo(d)}</p>`; ant = d; h += linha(x, p); });
    if (xs.length > mostrar) h += `<p><button type="button" class="bt" data-mais>Mostrar mais (${xs.length - mostrar})</button></p>`;
    return h || '<p class="vazio">Nada marcado por agora. Os eventos novos aparecem aqui sozinhos, todas as noites.</p>';
  };
  // por dia e por hora (como numa agenda); na mesma hora, primeiro o que o momento da pessoa procura e o que é da sua faculdade
  const ordenar = (xs, p) => xs.sort((a, b) => prox(a.e).localeCompare(prox(b.e)) || horaN(a.e) - horaN(b.e) || peso(p, a.e) - peso(p, b.e) || b.r.length - a.r.length || a.e.n.localeCompare(b.e.n));
  const prazos = (p, xs) => {
    const h0 = hoje();
    const cham = xs.filter(x => (x.e.pz || "") >= h0).map(x => ({ d: x.e.pz, n: "Chamada · " + x.e.n, q: (D.inst[x.e.in] || [])[1] || (D.inst[x.e.in] || [])[0] || x.e.l, u: B + "e/" + x.e.pg + ".html", r: x.r }));
    const bol = (D.pzs || []).filter(r => !r[5] || !p.areas.length || p.areas.some(a => String(r[5]).split("|").includes(a)) || p.areas.some(a => String(r[5]).split("|").includes(paiDe(a))))
      .map(r => ({ d: r[2], n: r[0], q: r[1] + (r[6] ? " · " + r[6] : ""), u: r[3], ext: 1, r: [] }));
    return cham.concat(bol).sort((a, b) => a.d.localeCompare(b.d));
  };
  const linhaPz = z => { const f = faltam(z.d);
    return `<div class="lyk-ev"><span class="lyk-ev-h lyk-pz${f <= 7 ? " urg" : ""}">${dd(z.d)}</span><span class="lyk-ev-t"><a href="${esc(z.u)}"${z.ext ? ' target="_blank" rel="noopener"' : ""}><b>${esc(z.n)}</b></a>` +
      `<span class="lyk-ev-o">${(z.r || []).map(([k, n]) => `<span class="lyk-mot ${k}">${esc(n)}</span>`).join("")}${esc(z.q)} · ${f === 0 ? "fecha hoje" : f === 1 ? "fecha amanhã" : "faltam " + f + " dias"}</span></span><span class="lyk-ev-ac"></span></div>`; };
  const ligacaoPartilha = p => new URL(box.dataset.ag, location.href).href.split("#")[0].split("?")[0] + "?mesa=" + [].concat(p.areas.map(a => "a." + a), p.insts.map(i => "i." + i.id), p.sou && p.sou !== "docente" ? ["s." + p.sou] : [], p.onde.map(d => "o." + d)).join(",");

  const desenhaMesa = () => {
    const p = atual();
    if (!D || vazio(p) || editar) { mesa.hidden = true; geral.hidden = false; document.body.classList.remove("lyk-com-mesa"); return; }
    const xs = ordenar(meus(p), p), h0 = hoje(), f7 = mais(6), f30 = mais(30);
    const sem = xs.filter(x => prox(x.e) <= f7), m30 = xs.filter(x => prox(x.e) <= f30);
    const pv = xs.filter(x => x.e.fa === "provas"), pz = prazos(p, xs);
    const N = { semana: sem.length, mes: m30.length, prazos: pz.length, provas: pv.length, tudo: xs.length };
    const SEP = [["semana", "Esta semana"], ["mes", "Próximos 30 dias"], ["prazos", "Prazos"], ["provas", "Provas"], ["tudo", "Tudo"]];
    let corpo;
    if (sep === "prazos") corpo = pz.length ? pz.slice(0, mostrar).map(linhaPz).join("") + (pz.length > mostrar ? `<p><button type="button" class="bt" data-mais>Mostrar mais</button></p>` : "")
      : '<p class="vazio">Sem prazos abertos para as suas escolhas.</p>';
    else corpo = lista(sep === "semana" ? sem : sep === "mes" ? m30 : sep === "provas" ? pv : xs, p);
    if (sep === "semana" && !sem.length && m30.length) corpo = '<p class="sub">Nada marcado nos próximos sete dias. O que vem a seguir:</p>' + lista(m30.slice(0, 10), p);
    // a coluna do lado
    const pequeno = (titulo, ir, itens, f) => itens.length ? `<div class="lyk-lado-b"><h3>${titulo}${ir ? ` <button type="button" class="lyk-lig" data-sep="${ir}">todos</button>` : ""}</h3><ul>${itens.slice(0, 3).map(f).join("")}</ul></div>` : "";
    const liE = x => `<li><span class="lyk-pz">${dd(prox(x.e))}</span><a href="${B}e/${x.e.pg}.html">${esc(x.e.n)}</a></li>`;
    const alunos = p.sou === "docente" ? xs.filter(x => prox(x.e) <= f7 && ["aula-aberta", "conferencia", "licao", "seminario", "coloquio"].includes(x.e.s)) : [];
    const lado = pequeno("Prazos a fechar", "prazos", pz, z => `<li><span class="lyk-pz${faltam(z.d) <= 7 ? " urg" : ""}">${dd(z.d)}</span><a href="${esc(z.u)}"${z.ext ? ' target="_blank" rel="noopener"' : ""}>${esc(z.n)}</a></li>`)
      + pequeno(p.areas.length ? "Provas na sua área" : "Provas", "provas", pv, liE)
      + pequeno("Formação e escolas", "", xs.filter(x => x.e.fa === "formacao"), liE)
      + (p.sou === "docente" ? `<div class="lyk-lado-b"><h3>Para os seus alunos</h3><p class="sub">${alunos.length} aulas abertas, conferências e seminários esta semana nas suas escolhas.</p>` +
         `<button type="button" class="bt" data-partilhar-mesa>Copiar a ligação para a turma</button><p class="sub lyk-copiado" hidden></p></div>` : "")
      + (conta() && ((LG.gostos || {}).lyk || {}).semanal !== false
         ? `<div class="lyk-lado-b lyk-email"><h3>À segunda, por email</h3><p>Recebe a semana académica com estas escolhas.</p><a class="bt" href="${box.dataset.conta}#lykeion">Mudar</a></div>`
         : `<div class="lyk-lado-b lyk-email"><h3>Isto por email, à segunda</h3><p>Só o que é seu: a sua área, a sua faculdade, os seus prazos. E as escolhas passam para todos os seus aparelhos.</p><a class="bt" href="${box.dataset.conta}#lykeion">Receber à segunda</a></div>`);
    // fora das escolhas: os grandes congressos da semana, numa linha
    const GR = new Set(["congresso", "conferencia-cientifica", "simposio"]), vistas = new Set();
    const fora = D.ev.filter(e => util(e) && noSitio(e, p) && GR.has(e.s) && prox(e) <= f7 && !xs.some(x => x.e === e)).filter(e => { const k = e.in || e.l; if (vistas.has(k)) return false; vistas.add(k); return true; }).slice(0, 4);
    const ver = p.areas.length === 1 && !p.insts.length ? box.dataset.area + p.areas[0] + "/" : p.insts.length === 1 && !p.areas.length ? inp.dataset.pag + p.insts[0].id + "/" : "";
    mesa.innerHTML = `<div class="lyk-sep" role="tablist">${SEP.map(([k, n]) => `<button type="button" role="tab" data-sep="${k}" aria-selected="${k === sep}">${n} <small>${N[k]}</small></button>`).join("")}</div>` +
      `<div class="lyk-mesa-c"><div class="lyk-mesa-l">${corpo}${sep === "tudo" && ver ? `<p class="sub"><a href="${ver}">A página completa, com centros e notícias</a></p>` : ""}</div><aside class="lyk-lado">${lado}</aside>` +
      (fora.length ? `<p class="lyk-fora"><b>Fora das suas escolhas, esta semana${p.onde.length ? "" : " no país"}:</b> ${fora.map(e => `<a href="${B}e/${e.pg}.html">${esc(e.n)}</a>`).join(" · ")}</p>` : "") + "</div>";
    mesa.hidden = false; geral.hidden = true; document.body.classList.add("lyk-com-mesa");
  };
  const desenhaPerfil = () => {
    const p = atual();
    if (vazio(p) || editar) { perfil.hidden = true; } else {
      const pas = (k, n) => `<span class="ch on">${esc(n)} <button type="button" class="lyk-x" data-tirar="${esc(k)}" aria-label="Tirar ${esc(n)}">×</button></span>`;
      perfil.innerHTML = `<span class="lyk-pr">Para</span>` + p.areas.map(a => pas("a:" + a, nomeArea(a))).join("") + p.insts.map(i => pas("i:" + i.id, i.nome)).join("") +
        (p.sou ? pas("sou", SOUS[p.sou]) : "") + p.onde.map(d => pas("o:" + d, d === "online" ? "Online" : d)).join("") + `<button type="button" class="ch lyk-mais" data-editar>+ outra área ou centro</button><button type="button" class="lyk-lig lyk-mudar" data-editar>Mudar</button>`;
      perfil.hidden = false;
    }
    partilha.hidden = !alheia;
    if (alheia) partilha.innerHTML = 'Está a ver uma seleção que alguém partilhou consigo. <button type="button" class="bt" data-alheia="guardar">Guardar como minha</button> ' +
      (vazio(P) ? "" : '<button type="button" class="lyk-lig" data-alheia="voltar">Voltar à minha</button>');
    box.hidden = !editar;
    document.body.classList.toggle("lyk-perfil-on", !vazio(p) && !editar);
  };
  // a contagem enquanto escolhe
  const desenhaVolta = () => {
    if (vazio(P)) { volta.hidden = true; volta.innerHTML = ""; return; }
    let txt = "A contar…";
    if (D) { const xs = meus(P), s7 = xs.filter(x => prox(x.e) <= mais(6)).length, pz = prazos(P, xs).length, pv = xs.filter(x => x.e.fa === "provas").length;
      txt = `<b>Já há ${xs.length} ${xs.length === 1 ? "evento" : "eventos"} para si.</b> ${s7} esta semana, ${pz} ${pz === 1 ? "prazo aberto" : "prazos abertos"}, ${pv} ${pv === 1 ? "prova" : "provas"}.`; }
    volta.innerHTML = `<p>${txt}</p><p><button type="button" class="bt" data-pronto>Ver o meu Lykeion</button> <button type="button" class="lyk-lig" data-tirar="tudo">Limpar</button></p>`;
    volta.hidden = false;
  };
  const tudo = () => { marcar(); desenhaPerfil(); desenhaVolta(); desenhaMesa(); };
  const mudou = () => { guardar(); mostrar = 30; tudo(); };

  // cliques na faixa, na secretária e na partilha
  document.addEventListener("click", ev => {
    const t = ev.target;
    const ed = t.closest("[data-editar]"); if (ed) { if (alheia) { P = arrumar(alheia); alheia = null; guardar(); } editar = true; tudo(); inp.focus({ preventScroll: true }); box.scrollIntoView({ block: "nearest" }); return; }
    const ti = t.closest("#lyk-perfil [data-tirar]"); if (ti) { if (alheia) { P = arrumar(alheia); alheia = null; } tirar(ti.dataset.tirar); return; }
    const al = t.closest("[data-alheia]"); if (al) { if (al.dataset.alheia === "guardar") { P = arrumar(alheia); guardar(); } alheia = null; history.replaceState(null, "", location.pathname); editar = vazio(P); tudo(); return; }
    const sp = t.closest("#lyk-mesa [data-sep]"); if (sp) { sep = sp.dataset.sep; mostrar = 30; gravarLS("lyk-sep", sep); desenhaMesa(); if (sp.closest(".lyk-lado")) mesa.scrollIntoView({ behavior: "smooth" }); return; }
    if (t.closest("#lyk-mesa [data-mais]")) { mostrar += 30; desenhaMesa(); return; }
    const g = t.closest("#lyk-mesa .lyk-g"); if (g) { const id = g.dataset.guardar; let gs = guard(); const on = !gs.includes(id); gs = on ? gs.concat(id) : gs.filter(x => x !== id);
      gravarLS("lagenda-guardados", gs); g.setAttribute("aria-pressed", on); g.textContent = on ? "★" : "☆"; const n = $("nguard"); if (n) n.textContent = gs.length || ""; return; }
    const pa = t.closest("[data-partilhar]"); if (pa) { const url = location.origin + B + "e/" + pa.dataset.partilhar + ".html";
      if (navigator.share) navigator.share({ title: pa.dataset.nome, url }).catch(() => {}); else copiar(url, () => { pa.textContent = "Ligação copiada"; }); return; }
    if (t.closest("[data-partilhar-mesa]")) { const url = ligacaoPartilha(atual()), c = mesa.querySelector(".lyk-copiado");
      copiar(url, ok => { if (c) { c.hidden = false; c.innerHTML = ok ? "Copiada. Os alunos veem estas escolhas, sem conta." : "Copie esta ligação: " + esc(url); } }); }
  });
  const copiar = (txt, fim) => { try { navigator.clipboard.writeText(txt).then(() => fim(true), () => fim(false)); } catch (_) { fim(false); } };

  // com conta: as escolhas vão para a conta e vêm da conta (vale o que foi mudado por último)
  document.addEventListener("lagenda:conta", ev => {
    const d = ev.detail || {}; if (!d.conta) return;
    const s = arrumar(((d.gostos || {}).lyk || {}).porta);
    if (!vazio(s) && (s.t > P.t || vazio(P))) { P = s; gravarLS("lyk-porta", P); editar = false; tudo(); }
    else if (!vazio(P) && (P.t > s.t) && LG.gravarPorta) LG.gravarPorta({ areas: P.areas, insts: P.insts, sou: P.sou, t: P.t });
  });
  sep = lerLS("lyk-sep", "semana"); if (!["semana", "mes", "prazos", "provas", "tudo"].includes(sep)) sep = "semana";
  tudo();
  document.addEventListener("lyk:dados", ev => {
    D = ev.detail;
    // os nomes das instituições de uma seleção partilhada
    if (alheia) alheia.insts.forEach(i => { const r = D.inst[i.id]; if (r) i.nome = r[1] || r[0]; });
    tudo();
  });
})();
