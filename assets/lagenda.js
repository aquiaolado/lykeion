/* lagenda: guardar, calendário, partilhar, mapas, e as páginas Agenda, Mapa e Guardados (lêem dados.json). */
(function () {
  "use strict";
  const B = (window.LG && LG.base) || "/";
  // Contador de visitas próprio, sem cookies (conta/contar.php): só o caminho da página e o site de onde se veio.
  try {
    const cam = "/" + location.pathname.slice(B.length).replace(/^\//, "");
    navigator.sendBeacon(B + "conta/contar.php", JSON.stringify({ p: cam, r: document.referrer }));
  } catch (_) {}
  const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const MESL = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const SEML = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dt = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
  const mais = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const hoje = (() => { const h = iso(new Date()); return window.LG && h < LG.hoje ? LG.hoje : h; })();
  const hora = (h, d) => {
    h = h || "";
    if (d) { const dia = ["dom","seg","ter","qua","qui","sex","s[aá]b"][dt(d).getDay()];
      const m = new RegExp(dia + "[^;0-9]*?(\\d{1,2})h(\\d{2})?", "i").exec(h); if (m) return m[1].padStart(2, "0") + ":" + (m[2] || "00"); }
    const m = /(\d{1,2})h(\d{2})?/.exec(h); return m ? m[1].padStart(2, "0") + ":" + (m[2] || "00") : "";
  };
  const ler = (k, v) => { try { return JSON.parse(localStorage.getItem(k)) || v; } catch (_) { return v; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const img = (i, t) => i ? `<img src="${esc(i)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;sem-img&quot;>'+this.dataset.t+'</span>'" data-t="${esc(t).slice(0, 60)}">` : `<span class="sem-img">${esc(t).slice(0, 60)}</span>`;

  // ---- guardados (neste aparelho) ----
  let guard = ler("lagenda-guardados", []);
  const contaGuard = () => { const n = document.getElementById("nguard"); if (n) n.textContent = guard.length || ""; };
  contaGuard();
  document.querySelectorAll("[data-guardar]").forEach(b => {
    const id = b.dataset.guardar, marca = () => { const on = guard.includes(id); b.setAttribute("aria-pressed", on); b.textContent = on ? "Guardado" : "Guardar"; };
    marca();
    b.addEventListener("click", () => { guard = guard.includes(id) ? guard.filter(x => x !== id) : guard.concat(id); gravar("lagenda-guardados", guard); marca(); contaGuard(); });
  });

  // ---- adicionar ao calendário (.ics) ----
  document.querySelectorAll("[data-ics]").forEach(b => b.addEventListener("click", () => {
    const e = JSON.parse(b.dataset.ics), d = e.d.replace(/-/g, ""), h = (e.h || "").replace(":", "");
    const ini = h ? `DTSTART;TZID=Europe/Lisbon:${d}T${h}00` : `DTSTART;VALUE=DATE:${d}`;
    const fim = h ? `DTEND;TZID=Europe/Lisbon:${d}T${String((+h.slice(0, 2) + 2) % 24).padStart(2, "0")}${h.slice(2)}00` : `DTEND;VALUE=DATE:${mais(e.d, 1).replace(/-/g, "")}`;
    const t = s => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, " ");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//lagenda//PT", "BEGIN:VEVENT", "UID:" + d + "-" + Math.random().toString(36).slice(2) + "@lagenda.pt",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z", ini, fim, "SUMMARY:" + t(e.t), "LOCATION:" + t(e.l), "URL:" + (e.u || location.href), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "evento.ics"; document.body.appendChild(a); a.click(); a.remove();
  }));

  // ---- partilhar ----
  document.querySelectorAll("[data-partilhar]").forEach(b => b.addEventListener("click", async () => {
    const dados = { title: document.title, url: location.href };
    try { if (navigator.share) { await navigator.share(dados); return; } await navigator.clipboard.writeText(location.href); b.textContent = "Ligação copiada"; }
    catch (_) { b.textContent = "Copie o endereço da página"; }
  }));

  // ---- mapa pequeno (evento, sala) ----
  const m1 = document.getElementById("mapa1");
  if (m1 && window.L) {
    const ll = [+m1.dataset.lat, +m1.dataset.lon], m = L.map(m1, { scrollWheelZoom: false }).setView(ll, 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(m);
    L.marker(ll).addTo(m).bindPopup(esc(m1.dataset.nome));
  }

  // ---- páginas que usam todos os dados ----
  const precisa = ["agenda", "mapa", "guardados"].filter(id => document.getElementById(id));
  if (!precisa.length) return;
  fetch(B + "dados.json").then(r => r.json()).then(D => {
    const CAT = Object.fromEntries(D.cats), lug = e => D.lugares[e.l] || ["", "", null, null, "", "Lisboa", 0, 1];
    const url = e => B + "e/" + e.pg + ".html";
    if (document.getElementById("agenda")) agenda(D, CAT, lug, url);
    if (document.getElementById("mapa")) mapa(D, CAT, lug, url);
    if (document.getElementById("guardados")) guardados(D, CAT, lug, url);
  }).catch(() => { precisa.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<p class="vazio">Não consegui carregar a agenda. Recarregue a página.</p>'; }); });

  function cartao(e, CAT, lug, url) {
    const [ln] = lug(e), d0 = e.d[0];
    const q = e.x ? `até ${dt(e.f).getDate()} ${MES[dt(e.f).getMonth()]}` : `${["dom","seg","ter","qua","qui","sex","sáb"][dt(d0).getDay()]} ${dt(d0).getDate()} ${MES[dt(d0).getMonth()]}${hora(e.h, d0) ? " · " + hora(e.h, d0) : ""}`;
    return `<a class="card" href="${url(e)}"><span class="fig">${img(e.i, e.n)}${e.c[0] ? `<span class="selo">${esc(CAT[e.c[0]] || "")}</span>` : ""}${e.g ? '<span class="selo livre">Livre</span>' : ""}</span>` +
      `<span class="quando">${q}</span><span class="tit">${esc(e.n)}</span><span class="onde">${esc(ln)}</span></a>`;
  }

  function agenda(D, CAT, lug, url) {
    const est = Object.assign({ quando: "semana", cat: "", livre: false, q: "", onde: "", tag: "" }, ler("lagenda-filtros", {}), { q: "" });
    const h = location.hash.slice(1), DIST = Object.fromEntries(D.dists || []);
    // taxonomia (3/11/2026): 8 eixos com subcategorias; as etiquetas (famílias, festival, LGP…) cruzam os eixos
    const EIXOS = D.eixos || [], PAI = {}, TAG = Object.fromEntries(D.tags || []);
    EIXOS.forEach(([s, , subs]) => { PAI[s] = s; subs.forEach(x => PAI[x] = s); });
    if (est.cat && !CAT[est.cat]) est.cat = "";
    if (est.tag && !TAG[est.tag]) est.tag = "";
    if (TAG[h] && !CAT[h]) est.tag = h;
    if (h === "festivais") est.tag = "festival";
    if (h.startsWith("d=")) est.onde = DIST[h.slice(2)] ? h.slice(2) : "";
    else if (h === "fora") est.onde = "fora";
    else if (h === "fds") est.quando = "fds"; else if (h === "livre") est.livre = true; else if (CAT[h]) { est.cat = h; est.quando = h === "exposicoes" ? "tudo" : est.quando; }
    const DIAS = [["hoje", "Hoje"], ["amanha", "Amanhã"], ["fds", "Fim de semana"], ["semana", "7 dias"], ["tudo", "14 dias"]];
    const intervalo = () => {
      if (est.quando === "hoje") return [hoje];
      if (est.quando === "amanha") return [mais(hoje, 1)];
      const n = est.quando === "tudo" ? 14 : 7, out = [];
      for (let i = 0; i < (est.quando === "fds" ? 7 : n); i++) { const d = mais(hoje, i), w = dt(d).getDay(); if (est.quando !== "fds" || w === 5 || w === 6 || w === 0) out.push(d); if (est.quando === "fds" && w === 0 && out.length) break; }
      return out;
    };
    const sel = document.getElementById("onde");
    if (sel) {
      sel.innerHTML = '<option value="">Todo o país</option><option value="fora">Fora de Lisboa</option>' + (D.dists || []).map(([s, n]) => `<option value="${s}">${esc(n)}</option>`).join("");
      if (est.onde !== "fora" && !DIST[est.onde]) est.onde = "";
      sel.value = est.onde;
      sel.addEventListener("change", () => { est.onde = sel.value; desenha(); });
    }
    const passa = e => {
      if (est.onde && (est.onde === "fora" ? lug(e)[7] : DIST[est.onde] !== lug(e)[5])) return false;
      if (est.cat && !e.c.includes(est.cat)) return false;
      if (est.tag && !(e.t || []).includes(est.tag)) return false;
      if (est.livre && !e.g) return false;
      if (est.q) { const [ln, fg] = lug(e); if (!norm(e.n + " " + e.s + " " + ln + " " + fg).includes(norm(est.q))) return false; }
      return true;
    };
    const linha = (e, d) => {
      const [ln, fg] = lug(e), hh = hora(e.h, d);
      return `<a class="li" href="${url(e)}"><span class="hr${hh ? "" : " sem"}">${hh || "—"}</span><span class="mi">${img(e.i, e.n)}</span>` +
        `<span class="tx"><span class="ti">${esc(e.n)}</span><br><span class="lg">${esc(ln)}${fg ? " · " + esc(fg) : ""}</span></span>` +
        `<span class="dir">${e.c[0] ? `<span class="tag">${esc(CAT[e.c[0]] || "")}</span>` : ""}${e.g ? '<span class="tag livre">Livre</span>' : e.p ? `<span>${esc(e.p.length > 22 ? e.p.slice(0, 22) + "…" : e.p)}</span>` : ""}</span></a>`;
    };
    const desenha = () => {
      const usados = new Set(D.ev.flatMap(e => e.c));
      document.getElementById("dias").innerHTML = DIAS.map(([k, t]) => `<button class="ch" data-q="${k}" aria-pressed="${est.quando === k}">${t}</button>`).join("");
      const botao = ([s, n], on) => `<button class="ch" data-c="${s}" aria-pressed="${on}">${esc(n)}</button>`;
      if (EIXOS.length) {
        const pai = PAI[est.cat] || "", subs = (EIXOS.find(([s]) => s === pai) || [, , []])[2].filter(x => usados.has(x));
        document.getElementById("cats").innerHTML = `<button class="ch" data-c="" aria-pressed="${!est.cat}">Tudo</button>` + EIXOS.filter(([s]) => usados.has(s)).map(([s, n]) => botao([s, n], pai === s)).join("");
        const sb = document.getElementById("subs");
        if (sb) { sb.hidden = !subs.length; sb.innerHTML = subs.length ? botao([pai, "Tudo em " + CAT[pai]], est.cat === pai) + subs.map(x => botao([x, CAT[x]], est.cat === x)).join("") : ""; }
      } else document.getElementById("cats").innerHTML = `<button class="ch" data-c="" aria-pressed="${!est.cat}">Tudo</button>` + D.cats.filter(([s]) => usados.has(s)).map(([s, n]) => botao([s, n], est.cat === s)).join("");
      const st = document.getElementById("tag");
      if (st) {
        const tu = new Set(D.ev.flatMap(e => e.t || []));
        st.innerHTML = '<option value="">Para quem e como</option>' + (D.tags || []).filter(([s]) => tu.has(s)).map(([s, n]) => `<option value="${s}">${esc(n)}</option>`).join("");
        st.value = est.tag;
      }
      document.getElementById("livre").setAttribute("aria-pressed", est.livre);
      const dias = intervalo(), set = new Set(dias); let html = "", total = 0;
      for (const d of dias) {
        const evs = D.ev.filter(e => !e.x && e.d.includes(d) && passa(e)).sort((a, b) => (hora(a.h, d) || "99").localeCompare(hora(b.h, d) || "99") || a.n.localeCompare(b.n));
        if (!evs.length) continue; total += evs.length;
        const x = dt(d);
        html += `<div class="dia"><h3>${d === hoje ? "Hoje" : d === mais(hoje, 1) ? "Amanhã" : SEML[x.getDay()]}, ${x.getDate()} de ${MESL[x.getMonth()]} <small>${evs.length}</small></h3>${evs.map(e => linha(e, d)).join("")}</div>`;
      }
      document.getElementById("agenda").innerHTML = html || '<p class="vazio">Nada com estes filtros. Experimente outro dia ou «Tudo».</p>';
      const cz = D.ev.filter(e => e.x && e.d.some(x => set.has(x)) && passa(e)).sort((a, b) => a.f.localeCompare(b.f));
      document.getElementById("cartaz").innerHTML = cz.map(e => cartao(e, CAT, lug, url)).join("") || '<p class="vazio">Nada em cartaz com estes filtros.</p>';
      document.getElementById("contagem").textContent = `${total} ${total === 1 ? "evento" : "eventos"} e ${cz.length} em cartaz`;
      gravar("lagenda-filtros", Object.assign({}, est, { q: "" }));
    };
    document.getElementById("dias").addEventListener("click", ev => { const b = ev.target.closest("[data-q]"); if (b) { est.quando = b.dataset.q; desenha(); } });
    document.getElementById("cats").addEventListener("click", ev => { const b = ev.target.closest("[data-c]"); if (b) { est.cat = b.dataset.c; desenha(); } });
    const sb = document.getElementById("subs"); if (sb) sb.addEventListener("click", ev => { const b = ev.target.closest("[data-c]"); if (b) { est.cat = b.dataset.c; desenha(); } });
    const st = document.getElementById("tag"); if (st) st.addEventListener("change", () => { est.tag = st.value; desenha(); });
    document.getElementById("livre").addEventListener("click", () => { est.livre = !est.livre; desenha(); });
    document.getElementById("busca").addEventListener("input", ev => { est.q = ev.target.value.trim(); desenha(); });
    desenha();
  }

  function mapa(D, CAT, lug, url) {
    if (!window.L) return;
    const m = L.map("mapa").setView([39.6, -8.0], 7);
    const DIST = Object.fromEntries(D.dists || []), msel = document.getElementById("monde");
    let onde = "";
    if (msel) {
      msel.innerHTML = '<option value="">Todo o país</option>' + (D.dists || []).map(([s, n]) => `<option value="${s}">${esc(n)}</option>`).join("");
      msel.addEventListener("change", () => { onde = msel.value; desenha(); });
    }
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(m);
    let camada = L.layerGroup().addTo(m), quando = "hoje";
    const OP = [["hoje", "Hoje"], ["amanha", "Amanhã"], ["fds", "Fim de semana"], ["cartaz", "Exposições em cartaz"]];
    const desenha = () => {
      document.getElementById("mdias").innerHTML = OP.map(([k, t]) => `<button class="ch" data-q="${k}" aria-pressed="${quando === k}">${t}</button>`).join("");
      const dias = quando === "hoje" ? [hoje] : quando === "amanha" ? [mais(hoje, 1)] : quando === "fds" ? [0, 1, 2, 3, 4, 5, 6].map(i => mais(hoje, i)).filter(d => [5, 6, 0].includes(dt(d).getDay())).slice(0, 3) : [hoje];
      const evs = D.ev.filter(e => (quando === "cartaz" ? e.x : !e.x) && e.d.some(d => dias.includes(d)) && (!onde || lug(e)[5] === DIST[onde]));
      const por = {}; evs.forEach(e => { if (lug(e)[2]) (por[e.l] = por[e.l] || []).push(e); });
      camada.clearLayers(); const pts = [];
      Object.entries(por).forEach(([l, es]) => {
        const [ln, fg, la, lo, sl, , ap] = D.lugares[l]; pts.push([la, lo]);
        L.circleMarker([la, lo], { radius: 6 + Math.min(es.length, 8), color: "#16203A", weight: 1.5, fillColor: "#F7CC2E", fillOpacity: .95 }).addTo(camada)
          .bindPopup(`<b>${esc(ap ? fg : ln)}</b>${ap ? '<small>Local aproximado (centro do concelho)</small>' : ""}${es.slice(0, 8).map(e => `<a href="${url(e)}">${quando !== "cartaz" && hora(e.h, dias[0]) ? hora(e.h, dias[0]) + " · " : ""}${esc(e.n)}</a>`).join("")}${es.length > 8 && sl ? `<a href="${B}salas/${sl}.html">e mais ${es.length - 8}…</a>` : ""}`);
      });
      if (pts.length) m.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
      document.getElementById("mlista").innerHTML = `<p class="sub">${evs.length} ${evs.length === 1 ? "evento" : "eventos"} em ${Object.keys(por).length} salas. Toque num ponto para ver o que há.</p>`;
    };
    document.getElementById("mdias").addEventListener("click", ev => { const b = ev.target.closest("[data-q]"); if (b) { quando = b.dataset.q; desenha(); } });
    desenha();
  }

  function guardados(D, CAT, lug, url) {
    const evs = D.ev.filter(e => guard.includes(e.pg));
    document.getElementById("guardados").innerHTML = evs.map(e => cartao(e, CAT, lug, url)).join("") ||
      '<p class="vazio">Ainda não guardou nada. Abra um evento e carregue em «Guardar».</p>';
  }
})();
