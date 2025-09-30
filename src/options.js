const DEFAULTS = ["\\[bot\\]", "(?:^|[+\\-._])bot(?:$|[+\\-._])"];

const $$ = (sel) => document.querySelector(sel);
const patternsEl = $$("#patterns");
const statusEl = $$("#status");
const saveBtn = $$("#save");
const resetBtn = $$("#reset");

function showStatus(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (ok ? "ok" : "error");
  if (ok)
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
}

function toLines() {
  return (patternsEl.value || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function fromLines(lines) {
  patternsEl.value = (lines || []).join("\n");
}

function validate(lines) {
  const errors = [];
  for (const src of lines) {
    try {
      new RegExp(src, "i");
    } catch (e) {
      errors.push(`${src}: ${e.message}`);
    }
  }
  return errors;
}

async function load() {
  try {
    const res = await chrome.storage.sync.get({ botRegexSources: DEFAULTS });
    fromLines(res?.botRegexSources || DEFAULTS);
  } catch (e) {
    showStatus(`Failed to load settings: ${e.message}`, false);
    fromLines(DEFAULTS);
  }
}

saveBtn.addEventListener("click", async () => {
  const lines = toLines();
  const errs = validate(lines);
  if (errs.length) {
    showStatus("Invalid regex:\n" + errs.join("\n"), false);
    return;
  }
  try {
    await chrome.storage.sync.set({ botRegexSources: lines });
    showStatus("Saved");
  } catch (e) {
    showStatus("Failed to save: " + e.message, false);
  }
});

resetBtn.addEventListener("click", async () => {
  fromLines(DEFAULTS);
  try {
    await chrome.storage.sync.set({ botRegexSources: DEFAULTS });
    showStatus("Defaults restored");
  } catch (e) {
    showStatus("Failed to reset: " + e.message, false);
  }
});

document.addEventListener("DOMContentLoaded", load);
