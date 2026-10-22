/* Renders the video-results rows and the comparison viewers from static/js/cases.js. */
(function () {
  "use strict";

  var DEMO_ROWS = 2;          // video results: cases are dealt round-robin into this many rows
  var MIN_SHOW_MS = 6000;     // a row advances once its case has played for at least this long

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function videoEl() {
    var v = el("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "none";
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    return v;
  }

  function posterOf(src) { return src.replace(/\.mp4$/, ".jpg"); }

  function panel(label, highlight) {
    var fig = el("figure", "panel" + (highlight ? " ours" : ""));
    var v = videoEl();
    fig.appendChild(v);
    fig.appendChild(el("figcaption", null, label));
    return { fig: fig, video: v };
  }

  // Black box of the video's size, for a method that produced no result for this case.
  function placeholderPanel(label, message) {
    var fig = el("figure", "panel");
    var box = el("div", "placeholder");
    message.split(/\s+/).forEach(function (w) { box.appendChild(el("span", null, w)); });
    fig.appendChild(box);
    fig.appendChild(el("figcaption", null, label));
    return fig;
  }

  function promptEl(text) {
    var p = el("p", "prompt");
    p.appendChild(el("span", "prompt-label", "Instruction"));
    p.appendChild(document.createTextNode(text));
    return p;
  }

  // Row of case-number buttons (1, 2, 3, ...) used under the demo rows and the comparisons.
  function caseNumbers(n, onPick) {
    var nav = el("div", "case-numbers");
    for (var i = 0; i < n; i++) {
      (function (k) {
        var b = el("button", "case-number", String(k + 1));
        b.type = "button";
        b.setAttribute("aria-label", "Case " + (k + 1));
        b.addEventListener("click", function () { onPick(k); });
        nav.appendChild(b);
      })(i);
    }
    return nav;
  }

  function markNumber(nav, k) {
    Array.prototype.forEach.call(nav.children, function (b, i) {
      b.classList.toggle("active", i === k);
    });
  }

  /* A group of videos that play in sync.
     - Sources are attached only while the group is near the viewport and detached when it
       leaves, so the browser never loads or decodes more than a few clips at a time.
     - Playback starts only once every clip can play, all from frame 0, so panels stay aligned.
     - setSources() swaps the clips; onCycle() is called each time every clip has reached its
       end (return false if it switched clips itself). */
  function SyncGroup(videos, onCycle) {
    var self = this;
    self.videos = videos;
    self.srcs = [];
    self.visible = false;
    self.token = 0;
    videos.forEach(function (v) {
      v.addEventListener("ended", function () {
        if (!videos.every(function (x) { return x.ended; })) return;
        if (onCycle && onCycle() === false) return;
        self.playTogether();
      });
    });
  }
  SyncGroup.prototype.setSources = function (srcs) {
    this.srcs = srcs;
    this.videos.forEach(function (v, i) { v.poster = posterOf(srcs[i]); });
    if (this.visible) this.attach();
  };
  SyncGroup.prototype.attach = function () {
    var srcs = this.srcs;
    this.videos.forEach(function (v, i) {
      if (v.getAttribute("src") !== srcs[i]) {
        v.pause();
        v.preload = "auto";
        v.src = srcs[i];
        v.load();
      }
    });
    this.playTogether();
  };
  SyncGroup.prototype.detach = function () {
    this.token++;
    this.videos.forEach(function (v) {
      v.pause();
      if (v.hasAttribute("src")) {
        v.removeAttribute("src");   // releases the decoder and the buffered data
        v.load();
      }
    });
  };
  SyncGroup.prototype.playTogether = function () {
    var self = this, token = ++self.token, vids = self.videos;
    if (!self.visible) return;
    vids.forEach(function (v) { v.pause(); });
    var ready = function () { return vids.every(function (v) { return v.readyState >= 3; }); };
    var go = function () {
      if (token !== self.token || !self.visible) return;
      vids.forEach(function (v) {
        try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      });
    };
    if (ready()) { go(); return; }
    var check = function () {
      if (token !== self.token) {
        vids.forEach(function (v) { v.removeEventListener("canplay", check); });
        return;
      }
      if (!ready()) return;
      vids.forEach(function (v) { v.removeEventListener("canplay", check); });
      go();
    };
    vids.forEach(function (v) { v.addEventListener("canplay", check); });
  };

  // Attach (and play) groups only while they are near / on screen.
  var groups = new Map();
  var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var g = groups.get(entry.target);
      if (!g) return;
      g.visible = entry.isIntersecting;
      if (g.visible) g.attach(); else g.detach();
    });
  }, { rootMargin: "150px 0px" }) : null;

  function track(node, group) {
    groups.set(node, group);
    if (observer) observer.observe(node); else { group.visible = true; group.attach(); }
  }

  function untrack(node) {
    var g = groups.get(node);
    if (g) g.detach();
    groups.delete(node);
    if (observer) observer.unobserve(node);
  }

  /* ---------------- Video results: 4 rows, each cycling through its cases ---------------- */

  function demoRow(cases) {
    var row = el("article", "case demo-row");
    var prompt = el("div", "prompt-slot");
    var inp = panel("Input"), out = panel("UniVOE (Ours)", true);
    var panels = el("div", "panels");
    panels.style.setProperty("--cols", 2);
    panels.appendChild(inp.fig);
    panels.appendChild(out.fig);
    var stage = el("div", "demo-stage");
    stage.appendChild(panels);
    row.appendChild(prompt);
    row.appendChild(stage);

    var idx = 0, shownAt = 0;
    var nav = caseNumbers(cases.length, function (k) { show(k); });
    if (cases.length > 1) {
      [["prev", "‹", -1], ["next", "›", 1]].forEach(function (a) {
        var b = el("button", "stage-arrow " + a[0], a[1]);
        b.type = "button";
        b.setAttribute("aria-label", a[0] === "prev" ? "Previous case" : "Next case");
        b.addEventListener("click", function () { show((idx + a[2] + cases.length) % cases.length); });
        stage.appendChild(b);
      });
      row.appendChild(nav);
    }

    var group = new SyncGroup([inp.video, out.video], function () {
      if (cases.length < 2 || Date.now() - shownAt < MIN_SHOW_MS) return true;
      show((idx + 1) % cases.length);
      return false;
    });

    function show(k) {
      idx = k;
      shownAt = Date.now();
      var c = cases[k];
      prompt.innerHTML = "";
      prompt.appendChild(promptEl(c.prompt));
      markNumber(nav, k);
      group.setSources([c.input, c.output]);
    }

    track(row, group);
    show(0);
    return row;
  }

  function setupDemos() {
    var section = document.getElementById("demos");
    var holder = document.getElementById("demo-rows");
    var tabs = section.querySelectorAll(".tab");
    var data = window.DEMO_CASES || {};

    function render(task) {
      Array.prototype.forEach.call(holder.children, untrack);
      holder.innerHTML = "";
      var cases = data[task] || [];
      var rows = [];
      for (var r = 0; r < DEMO_ROWS; r++) rows.push([]);
      cases.forEach(function (c, i) { rows[i % DEMO_ROWS].push(c); });
      if (task === "injection") rows.forEach(function (r) { r.reverse(); });
      rows.filter(function (r) { return r.length; }).forEach(function (r) {
        holder.appendChild(demoRow(r));
      });
      Array.prototype.forEach.call(tabs, function (b) {
        var on = b.dataset.task === task;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    Array.prototype.forEach.call(tabs, function (b) {
      var n = (data[b.dataset.task] || []).length;
      b.textContent += " (" + n + ")";
      b.addEventListener("click", function () { render(b.dataset.task); });
    });
    render("injection");
  }

  /* ---------------- Comparison: one case at a time, all methods side by side ---------------- */

  function setupComparison(box) {
    var task = box.dataset.task;
    var cases = (window.COMPARISON_CASES || {})[task] || [];
    if (!cases.length) {
      box.appendChild(el("p", "empty", "Comparison videos will be added soon."));
      return;
    }

    var card = el("article", "case comparison-card");
    var head = el("div", "comparison-head");
    var prev = el("button", "arrow", "‹"), next = el("button", "arrow", "›");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "Previous case");
    next.setAttribute("aria-label", "Next case");
    var prompt = el("div", "prompt-slot");
    head.appendChild(prev);
    head.appendChild(prompt);
    head.appendChild(next);
    var panels = el("div", "panels");
    panels.style.setProperty("--cols", task === "removal" ? 3 : 4);
    var nav = caseNumbers(cases.length, function (k) { show(k); });
    card.appendChild(head);
    card.appendChild(panels);
    box.appendChild(card);
    card.appendChild(nav);

    var idx = 0, group = null;

    function show(k) {
      idx = (k + cases.length) % cases.length;
      var c = cases[idx];
      prompt.innerHTML = "";
      prompt.appendChild(promptEl(c.prompt));

      var items = [{ name: "Input", video: c.input }].concat(c.methods);
      if (group) untrack(panels);
      panels.innerHTML = "";
      var playable = [];
      items.forEach(function (m) {
        if (m.placeholder) { panels.appendChild(placeholderPanel(m.name, m.placeholder)); return; }
        var p = panel(m.name, m.name === "UniVOE (Ours)");
        panels.appendChild(p.fig);
        playable.push({ video: p.video, src: m.video });
      });

      group = new SyncGroup(playable.map(function (p) { return p.video; }));
      track(panels, group);
      group.setSources(playable.map(function (p) { return p.src; }));
      markNumber(nav, idx);
    }

    prev.addEventListener("click", function () { show(idx - 1); });
    next.addEventListener("click", function () { show(idx + 1); });
    show(0);
  }

  setupDemos();
  Array.prototype.forEach.call(document.querySelectorAll(".comparison"), setupComparison);

  /* ---------------- BibTeX copy button ---------------- */
  var copyBtn = document.querySelector(".bibtex .copy");
  copyBtn.addEventListener("click", function () {
    var text = document.getElementById("bibtex-text").textContent;
    var done = function () {
      copyBtn.textContent = "Copied";
      setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done);
    } else {
      var ta = el("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    }
  });
})();
