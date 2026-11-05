/* lagenda: secção Academia (lê academia.json). Filtros por tipo, formato, área científica, instituição, distrito,
   online ou presencial, aberto ao público e provas públicas. Pensada para poder um dia ser um site à parte. */
(function () {
  "use strict";
  const B = (window.LG && LG.base) || "/", AC = (window.LG && LG.ac != null) ? LG.ac : "academia/", caixa = document.getElementById("academia");
  if (!caixa) return;
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

  fetch(B + "academia.json").then(r => r.json()).then(D => {
    const SUB = Object.fromEntries(D.subtipos.map(([s, n, f]) => [s, { n, f }]));
    const AREA = Object.fromEntries(D.areas), FINA = Object.fromEntries(D.finas.map(([s, n]) => [s, n]));
    const est = Object.assign({ fa: "", sub: "", area: "", inst: "", dist: "", modo: "", aberto: false, provas: true, q: "" }, ler("lagenda-academia", {}), { q: "" });
    const h = decodeURIComponent(location.hash.slice(1));  // #congresso, #saude, #ulisboa, #provas…
    if (h) Object.assign(est, { fa: "", sub: "", area: "", inst: "" },
      D.familias.some(([s]) => s === h) ? { fa: h } : SUB[h] ? { sub: h } : AREA[h] ? { area: h } : D.inst[h] ? { inst: h } : {});
    const nomeInst = i => (D.inst[i] || [])[0] || "";
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

    const passa = e => {
      if (!est.provas && e.so) return false;
      if (est.fa && e.fa !== est.fa) return false;
      if (est.sub && e.s !== est.sub) return false;
      if (est.area && !e.a.includes(est.area)) return false;
      if (est.inst && e.in !== est.inst && ((D.inst[e.in] || [])[2] !== est.inst)) return false;
      if (est.dist && e.di !== est.dist) return false;
      if (est.modo === "online" && e.m === "presencial") return false;
      if (est.modo === "presencial" && e.m === "online") return false;
      if (est.aberto && e.ac !== "livre" && !e.g) return false;
      if (est.q && !norm([e.n, e.l, e.o, e.di, nomeInst(e.in), (SUB[e.s] || {}).n, ...e.a.map(a => AREA[a]), ...e.af.map(a => FINA[a])].join(" ")).includes(norm(est.q))) return false;
      return true;
    };
    const linha = (e, d) => {
      const hh = hora(e.h), etq = [(SUB[e.s] || {}).n].concat(e.m === "online" ? ["Online"] : e.m === "hibrido" ? ["Também online"] : [])
        .concat(e.ac === "livre" || e.g ? ["Aberto"] : e.ac === "pago" ? ["Inscrição paga"] : e.ac === "inscricao" ? ["Com inscrição"] : [])
        .concat(e.li === "en" ? ["Em inglês"] : []);
      const img = e.i ? `<img src="${esc(e.i)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="sem-img">${esc(e.n).slice(0, 60)}</span>`;
      return `<a class="li" href="${B}e/${e.pg}.html"><span class="hr${hh ? "" : " sem"}">${hh || "—"}</span><span class="mi">${img}</span>` +
        `<span class="tx"><span class="ti">${esc(e.n)}</span><br><span class="lg">${esc(nomeInst(e.in) || e.l)}${e.o ? " · " + esc(e.o) : ""}` +
        `${e.a.length ? " · " + e.a.map(a => esc(AREA[a])).join(", ") : ""}</span></span>` +
        `<span class="dir">${etq.map(t => `<span class="tag${t === "Aberto" ? " livre" : ""}">${esc(t)}</span>`).join("")}</span></a>`;
    };
    const desenha = () => {
      document.querySelectorAll("#afam [data-fa]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fa === est.fa));
      $("aonline").setAttribute("aria-pressed", est.modo === "online");
      $("apresencial").setAttribute("aria-pressed", est.modo === "presencial");
      $("aaberto").setAttribute("aria-pressed", est.aberto);
      $("aprovas").setAttribute("aria-pressed", est.provas);
      // cada evento aparece no próximo dia em que acontece; os abertos ao público primeiro
      const dias = {};
      for (const e of D.ev) {
        if (!passa(e)) continue;
        const d = e.d.find(x => x >= hoje); if (!d) continue;
        (dias[d] = dias[d] || []).push(e);
      }
      const ordem = e => (e.ac === "livre" || e.g ? 0 : e.ac === "pago" ? 2 : 1);
      let html = "", total = 0;
      for (const d of Object.keys(dias).sort()) {
        const evs = dias[d].sort((a, b) => ordem(a) - ordem(b) || (hora(a.h) || "99").localeCompare(hora(b.h) || "99") || a.n.localeCompare(b.n));
        total += evs.length; const x = dt(d);
        html += `<div class="dia"><h3>${d === hoje ? "Hoje" : SEML[x.getDay()]}, ${x.getDate()} de ${MESL[x.getMonth()]}${x.getFullYear() !== dt(hoje).getFullYear() ? " de " + x.getFullYear() : ""} <small>${evs.length}</small></h3>${evs.map(e => linha(e, d)).join("")}</div>`;
      }
      caixa.innerHTML = html || '<p class="vazio">Nada com estes filtros. Experimente tirar um.</p>';
      $("acontagem").textContent = `${total} ${total === 1 ? "evento" : "eventos"} de hoje em diante`;
      gravar("lagenda-academia", Object.assign({}, est, { q: "" }));
    };
    $("afam").addEventListener("click", ev => { const b = ev.target.closest("[data-fa]"); if (b) { est.fa = b.dataset.fa; desenha(); } });
    [["asub", "sub"], ["aarea", "area"], ["ainst", "inst"], ["adist", "dist"]].forEach(([id, k]) => $(id).addEventListener("change", ev => { est[k] = ev.target.value; desenha(); }));
    $("aonline").addEventListener("click", () => { est.modo = est.modo === "online" ? "" : "online"; desenha(); });
    $("apresencial").addEventListener("click", () => { est.modo = est.modo === "presencial" ? "" : "presencial"; desenha(); });
    $("aaberto").addEventListener("click", () => { est.aberto = !est.aberto; desenha(); });
    $("aprovas").addEventListener("click", () => { est.provas = !est.provas; desenha(); });
    $("abusca").addEventListener("input", ev => { est.q = ev.target.value.trim(); desenha(); });
    desenha();

    // «Olá, <nome>» na entrada do Lykeion: o que vem das instituições (e das suas unidades), áreas e listas que a pessoa segue
    const ola = $("lyk-ola");
    const pertence = (i, alvo) => { for (let k = 0; i && k < 6; k++) { if (i === alvo) return true; i = (D.pais || {})[i]; } return false; };
    const naLista = (e, f) => (!f.subtipos || f.subtipos.includes(e.s)) && (!f.familias || f.familias.includes(e.fa)) &&
      (!f.areas || e.a.some(a => f.areas.includes(a))) && (!f.modo || f.modo.includes(e.m)) && (!f.lingua || f.lingua.includes(e.li)) &&
      (!f.distritos || f.distritos.includes(e.di)) && (!f.chamada || (e.pz || "") >= (window.LG || {}).hoje);
    const poeOla = (conta, gostos) => {
      if (!ola || !conta) return;
      const g = Object.assign({ inst: [], areas: [], listas: [] }, (gostos || {}).lyk || {});
      const nome = (conta.nome || "").trim().split(/\s+/)[0];
      const cab = `<h2>Olá${nome ? ", " + esc(nome) : ""}.</h2>`;
      if (!g.inst.length && !g.areas.length && !g.listas.length) {
        ola.innerHTML = cab + `<p class="sub">Siga instituições, áreas ou listas e passa a ter aqui o que lhe interessa, com aviso por email e a semana académica à segunda. ` +
          `<a href="${B}${AC}instituicoes/">Escolher instituições</a> · <a href="${B}${AC}listas/">listas e áreas</a></p>`;
      } else {
        const meus = [];
        for (const e of D.ev) {
          const d = e.d.find(x => x >= hoje); if (!d) continue;
          if (g.inst.some(i => pertence(e.in, i)) || e.a.some(a => g.areas.includes(a)) || g.listas.some(l => D.listas[l] && naLista(e, D.listas[l][1]))) meus.push([d, e]);
        }
        meus.sort((a, b) => a[0].localeCompare(b[0]) || a[1].n.localeCompare(b[1].n));
        let ant = "";
        const linhas = meus.slice(0, 5).map(([d, e]) => { const x = dt(d), cab = d === ant ? "" : `<p class="rot">${d === hoje ? "Hoje" : SEML[x.getDay()] + ", " + x.getDate() + " de " + MESL[x.getMonth()]}</p>`; ant = d; return cab + linha(e, d); }).join("");
        ola.innerHTML = cab + `<p class="sub">${meus.length ? `Do que segue, ${meus.length === 1 ? "vem aí 1 evento" : "vêm aí " + meus.length + " eventos"}.` : "Do que segue, ainda não há nada marcado."} ` +
          `<a href="${B}conta.html#lykeion">O que sigo</a></p>` + linhas;
      }
      ola.hidden = false;
    };
    if (window.LG && LG.contaPronta) poeOla(LG.conta, LG.gostos);
    document.addEventListener("lagenda:conta", ev => poeOla(ev.detail.conta, ev.detail.gostos));
  }).catch(() => {});  // sem dados, fica a lista feita no servidor
})();
