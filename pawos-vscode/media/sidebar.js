// The PawOS sidebar. It draws the state the extension sends and reports button presses back.
// It holds display data only (no session, no token) and writes server text with textContent only.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  let state = null;
  let draft = (vscode.getState() || {}).draft || "";

  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra || {}));

  function el(tag, options, children) {
    const node = document.createElement(tag);
    const opts = options || {};
    if (opts.className) node.className = opts.className;
    if (opts.text !== undefined && opts.text !== null) node.textContent = String(opts.text);
    if (opts.onClick) node.addEventListener("click", opts.onClick);
    if (opts.disabled) node.disabled = true;
    if (opts.title) node.title = opts.title;
    for (const child of children || []) if (child) node.appendChild(child);
    return node;
  }

  const button = (label, onClick, options) => el("button", Object.assign({ text: label, onClick, className: "button" }, options || {}));
  const secondary = (label, onClick, options) => button(label, onClick, Object.assign({ className: "button secondary" }, options || {}));
  const link = (label, onClick) => el("button", { text: label, onClick, className: "link" });
  const label = (text) => el("div", { className: "label", text });
  const para = (text, className) => (text ? el("p", { className: className || "", text }) : null);

  const STEP_MARK = { done: "✓", active: "●", pending: "○", failed: "✕", skipped: "–" };

  function steps(list) {
    if (!list || list.length === 0) return null;
    return el(
      "ul",
      { className: "steps" },
      list.map((step) =>
        el("li", { className: "step " + step.status }, [
          el("span", { className: "mark", text: STEP_MARK[step.status] || "○" }),
          el("span", { className: "step-text" }, [el("span", { text: step.label }), step.detail ? el("span", { className: "detail", text: " — " + step.detail }) : null]),
        ])
      )
    );
  }

  function repository(repo, busy) {
    const rows = [label("Repository")];
    if (repo.kind === "unknown") rows.push(para("Loading…", "muted"));
    if (repo.selected) rows.push(el("div", { className: "value", text: repo.selected + (repo.defaultBranch ? "  (" + repo.defaultBranch + ")" : "") }));
    if (repo.message) rows.push(para(repo.message, repo.mismatch || repo.kind !== "ready" ? "warning" : "muted"));
    if (!repo.selected && repo.workspace && repo.kind !== "unknown") rows.push(para("This folder: " + repo.workspace, "muted"));
    if (repo.canUseWorkspace && repo.workspace) rows.push(secondary("Use " + repo.workspace, () => send("useWorkspaceRepository"), { disabled: busy }));
    return el("section", {}, rows);
  }

  function links(task) {
    const row = [];
    if (task.commitUrl) row.push(button("Open Commit", () => send("open", { which: "commit" })));
    if (task.pullRequestUrl) row.push(button("Open Pull Request", () => send("open", { which: "pullRequest" })));
    return row.length ? el("div", { className: "row" }, row) : null;
  }

  function result(task) {
    const rows = [];
    if (task.summary) rows.push(label("Summary"), para(task.summary));
    if (task.files.length) rows.push(label("Files changed"), el("ul", { className: "files" }, task.files.map((file) => el("li", { text: file }))));
    if (task.checks) rows.push(label("Checks"), para(task.checks));
    return rows;
  }

  function taskSection(s) {
    const task = s.task;
    const note = para("PawOS works on the connected GitHub repository. Review the resulting commit or pull request.", "note");
    const again = secondary("New Task", () => send("newTask"));

    if (task.phase === "running") {
      return el("section", {}, [el("div", { className: "heading", text: "PawOS is working…" }), task.repository ? para(task.repository, "muted") : null, steps(task.steps) || para("Starting…", "muted"), note]);
    }
    if (task.phase === "complete") {
      return el("section", {}, [el("div", { className: "heading ok", text: "Task complete" })].concat(result(task), [links(task), note, again]));
    }
    if (task.phase === "noChange") {
      return el("section", {}, [el("div", { className: "heading", text: "No change was made" }), para(task.message), again]);
    }
    if (task.phase === "failed") {
      return el("section", {}, [el("div", { className: "heading bad", text: "Task failed" }), para(task.message, "warning"), steps(task.steps)].concat(result(task), [links(task), again]));
    }
    if (task.phase === "timeout") {
      return el("section", {}, [el("div", { className: "heading", text: "Still working" }), para(task.message, "warning"), steps(task.steps), el("div", { className: "row" }, [button("Check Again", () => send("checkAgain")), again])]);
    }

    const input = el("textarea", { className: "task" });
    input.rows = 5;
    input.maxLength = 4000;
    input.placeholder = "Describe the change you want PawOS to make";
    input.value = draft;
    input.addEventListener("input", () => {
      draft = input.value;
      vscode.setState({ draft });
    });
    const run = button("Run with PawOS", () => {
      if (!input.value.trim()) return;
      const text = input.value;
      draft = "";
      vscode.setState({ draft });
      send("run", { text });
    }, { disabled: !s.repo.canRun || s.loading });
    return el("section", {}, [label("Task"), input, run, note]);
  }

  function render() {
    app.textContent = "";
    if (!state) return;
    const s = state;
    const nodes = [el("h1", { text: "PawOS" })];

    if (s.configProblem) {
      nodes.push(para(s.configProblem, "warning"), button("Open Settings", () => send("openSettings")));
    } else if (s.auth === "signingIn") {
      nodes.push(para("Sign in to PawOS in your browser, then paste the authentication code it shows you into the box at the top of VS Code."), secondary("Start Again", () => send("signIn")));
    } else if (s.auth !== "signedIn") {
      nodes.push(para(s.notice, "warning"), para(s.error, "warning"), button("Sign In", () => send("signIn")));
    } else {
      nodes.push(
        el("section", {}, [
          el("div", { className: "plan" }, [el("span", { className: "label inline", text: "Plan: " }), el("span", { className: "value", text: s.plan || (s.loading ? "Loading…" : "—") })]),
          s.email ? para(s.email, "muted") : null,
        ]),
        para(s.error, "warning"),
        repository(s.repo, s.loading || s.task.phase === "running"),
        taskSection(s),
        el("footer", {}, [link("Refresh", () => send("refresh")), el("span", { text: " · " }), link("Sign Out", () => send("signOut"))])
      );
    }
    for (const node of nodes) if (node) app.appendChild(node);
  }

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "state") {
      state = event.data.state;
      render();
    }
  });
  send("ready");
})();
