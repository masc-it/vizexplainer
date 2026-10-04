// vizexplainer runtime: entity linking, detail panel, focus API, table of contents, theme.
// Exposes `window.vx` for component scripts.
(() => {
  const root = document.documentElement;
  const esc = (value) => CSS.escape(value);
  const withEntity = (id, scope = document) => scope.querySelectorAll(`[data-entity="${esc(id)}"]`);

  // Theme toggle (the saved choice is applied before paint by an inline head script).
  document.querySelector("[data-vx-theme-toggle]")?.addEventListener("click", () => {
    const current = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("vx-theme", next); } catch {}
  });

  // Hovering or focusing anything tied to an entity highlights it everywhere on the page.
  let linked = null;
  const link = (id) => {
    if (id === linked) return;
    if (linked) withEntity(linked).forEach((el) => el.classList.remove("vx-linked"));
    linked = id;
    if (id) withEntity(id).forEach((el) => el.classList.add("vx-linked"));
  };
  document.addEventListener("mouseover", (e) => link(e.target.closest?.("[data-entity]")?.dataset.entity ?? null));
  document.addEventListener("focusin", (e) => link(e.target.closest?.("[data-entity]")?.dataset.entity ?? null));

  // Detail panel.
  const panel = document.querySelector("[data-vx-panel]");
  const content = panel.querySelector("[data-vx-panel-content]");
  const back = panel.querySelector("[data-vx-panel-back]");
  const history = [];
  let current = null;
  const render = (id) => {
    const template = document.querySelector(`template[data-entity-panel="${esc(id)}"]`);
    if (!template) return false;
    current = id;
    content.replaceChildren(template.content.cloneNode(true));
    content.scrollTop = 0;
    panel.classList.add("vx-panel-open");
    document.body.classList.add("vx-panel-docked");
    panel.setAttribute("aria-hidden", "false");
    back.hidden = history.length === 0;
    return true;
  };
  const openEntity = (id) => {
    if (id === current && panel.classList.contains("vx-panel-open")) return;
    const previous = panel.classList.contains("vx-panel-open") ? current : null;
    if (render(id) && previous) { history.push(previous); back.hidden = false; }
  };
  const closePanel = () => {
    panel.classList.remove("vx-panel-open");
    document.body.classList.remove("vx-panel-docked");
    panel.setAttribute("aria-hidden", "true");
    history.length = 0;
    current = null;
  };
  back.addEventListener("click", () => { const id = history.pop(); if (id) render(id); });
  panel.querySelector("[data-vx-panel-close]").addEventListener("click", closePanel);
  document.addEventListener("click", (e) => {
    const target = e.target.closest?.("[data-entity]");
    if (target && !e.target.closest("a[href]")) openEntity(target.dataset.entity);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
    const target = e.target.closest?.("[data-entity]");
    if (target && (e.key === "Enter" || e.key === " ") && !/^(A|BUTTON|SUMMARY|INPUT|TEXTAREA)$/.test(e.target.tagName)) {
      e.preventDefault();
      openEntity(target.dataset.entity);
    }
  });

  // Focus API: spotlight entities and code lines inside a container (used by steps; available to custom components).
  const focusState = new WeakMap();
  const applyFocus = (container) => {
    const { entities, lines } = focusState.get(container);
    const on = entities.size > 0;
    container.classList.toggle("vx-focus-mode", on);
    const drawn = new Set();
    container.querySelectorAll("[data-entity]").forEach((el) => {
      const hit = on && (entities.has(el.dataset.entity) || (el.dataset.contains || "").split(" ").some((id) => entities.has(id)));
      el.classList.toggle("vx-focused", hit);
      if (hit) drawn.add(el.dataset.entity);
    });
    container.querySelectorAll("[data-from][data-to]").forEach((el) => {
      el.classList.toggle("vx-edge-on", on && drawn.has(el.dataset.from) && drawn.has(el.dataset.to));
    });
    container.querySelectorAll(".vx-code").forEach((code) => {
      code.classList.toggle("vx-has-focus", Boolean(lines));
      code.querySelectorAll("[data-line]").forEach((line) => {
        const n = Number(line.dataset.line);
        line.classList.toggle("vx-line-focus", Boolean(lines) && n >= lines[0] && n <= lines[1]);
      });
      if (lines) scrollLineIntoView(code, lines[0]);
    });
  };
  const setFocus = (container, { entities = [], lines = null } = {}) => {
    focusState.set(container, { entities: new Set(entities), lines });
    applyFocus(container);
  };
  const refreshFocus = (element) => {
    for (let el = element; el; el = el.parentElement) if (focusState.has(el)) return applyFocus(el);
  };
  const scrollLineIntoView = (scope, line) => {
    const body = scope.querySelector(".vx-code-body");
    const el = body?.querySelector(`[data-line="${line}"]`);
    if (el) body.scrollTo({ top: Math.max(0, el.offsetTop - body.clientHeight / 3), behavior: "smooth" });
  };

  // Diagrams: hovering a node (`data-node`) lights the edges (`data-from`/`data-to`) that touch it.
  document.querySelectorAll("[data-vx-diagram]").forEach((figure) => {
    const edges = [...figure.querySelectorAll("[data-from][data-to]")];
    figure.querySelectorAll("[data-node]").forEach((node) => {
      const id = node.dataset.node;
      node.addEventListener("mouseenter", () => { figure.classList.add("vx-hovering"); edges.forEach((e) => e.classList.toggle("vx-edge-on", e.dataset.from === id || e.dataset.to === id)); });
      node.addEventListener("mouseleave", () => { figure.classList.remove("vx-hovering"); edges.forEach((e) => e.classList.remove("vx-edge-on")); refreshFocus(figure); });
    });
  });

  // Section row: highlight the current section and fill each underline with reading progress.
  const nav = document.querySelector("[data-vx-sections]");
  const links = [...document.querySelectorAll("[data-vx-toc-link]")];
  const targets = links.map((a) => document.getElementById(a.dataset.vxTocLink));
  let ticking = false;
  let activeSection = -1;
  const onScroll = () => {
    ticking = false;
    const line = scrollY + innerHeight * 0.3;
    const end = document.documentElement.scrollHeight;
    const starts = targets.map((t) => (t ? t.getBoundingClientRect().top + scrollY : end));
    let active = -1;
    links.forEach((a, i) => {
      const start = starts[i];
      const stop = i + 1 < starts.length ? starts[i + 1] : end - innerHeight * 0.7;
      const read = Math.min(1, Math.max(0, (line - start) / Math.max(1, stop - start)));
      a.style.setProperty("--vx-read", read.toFixed(3));
      if (line >= start) active = i;
    });
    // At the very bottom the last section is current even if it is short.
    if (scrollY + innerHeight >= end - 2 && links.length) {
      active = links.length - 1;
      links[active].style.setProperty("--vx-read", "1");
    }
    if (active !== activeSection) {
      activeSection = active;
      links.forEach((a, i) => a.classList.toggle("vx-active", i === active));
      const link = links[active];
      if (nav && link) {
        // Keep the active link visible without scrolling the page itself.
        const left = link.offsetLeft - nav.offsetLeft;
        if (left < nav.scrollLeft || left + link.offsetWidth > nav.scrollLeft + nav.clientWidth) {
          nav.scrollTo({ left: left - nav.clientWidth / 3, behavior: "smooth" });
        }
      }
    }
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();

  // Diagrams shrink to fit, but never below a readable scale; past that they scroll instead.
  const fitSvg = (svg) => {
    const box = svg.parentElement;
    const style = getComputedStyle(box);
    const available = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const width = Number(svg.dataset.width);
    const height = Number(svg.dataset.height);
    const pinned = svg.closest(".vx-steps-pin");
    const narrow = innerWidth < 900;
    const maxHeight = svg.dataset.maxHeight === "none" ? Infinity : pinned ? innerHeight * (narrow ? 0.4 : 1) - (narrow ? 0 : 150) : innerHeight * 0.72;
    // 0.7 keeps 13.5px labels at about 9.5px, the smallest comfortable size; `vizx preview` checks the same.
    const scale = Math.max(0.7, Math.min(1, available / width, maxHeight / height));
    svg.style.width = `${width * scale}px`;
    svg.style.height = `${height * scale}px`;
    svg.style.maxWidth = "none";
  };
  const fitted = [...document.querySelectorAll("svg[data-vx-fit]")];
  const resize = new ResizeObserver((entries) => entries.forEach((entry) => fitted.filter((svg) => svg.parentElement === entry.target).forEach(fitSvg)));
  fitted.forEach((svg) => { fitSvg(svg); resize.observe(svg.parentElement); });

  window.vx = { openEntity, closePanel, setFocus, refreshFocus, scrollLineIntoView, fitSvg };
})();
