const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

function loadContent() {
  const context = {
    chrome: { storage: { sync: { get: async () => ({}) } } },
    document: {
      querySelector: () => ({ textContent: "alice" }),
      querySelectorAll: () => [],
      addEventListener() {},
      documentElement: {},
    },
    window: { addEventListener() {} },
    MutationObserver: class {
      observe() {}
    },
    setTimeout: () => 1,
    clearTimeout() {},
    console,
  };
  runInNewContext(
    readFileSync(resolve(__dirname, "../src/content.js"), "utf8"),
    context,
  );
  return context;
}

for (const domain of ["users.noreply.github.com", "USERS.NOREPLY.GITHUB.COM"]) {
  test(`GitHub noreply address removes the PR author's sign-off: ${domain}`, () => {
    const { cleanCommitMessageValue } = loadContent();
    const result = cleanCommitMessageValue(
      `Subject\n\nCo-authored-by: dependabot[bot] <bot@example.com>\nSigned-off-by: Other Person <123+alice@${domain}>`,
    );
    assert.equal(result.text, "Subject");
    assert.equal(result.changed, true);
  });
}

for (const domain of [
  "evilusers.noreply.github.com",
  "sub.users.noreply.github.com",
  "users.noreply.github.com.evil.test",
  "example.com",
  "users.noreply.github.com@evil.test",
]) {
  test(`Untrusted address preserves another person's sign-off: ${domain}`, () => {
    const { cleanCommitMessageValue, extractUsernameCandidates } =
      loadContent();
    const email = `123+alice@${domain}`;
    assert.equal(
      extractUsernameCandidates(email, "Other Person").has("alice"),
      false,
    );
    const signOff = `Signed-off-by: Other Person <${email}>`;
    assert.equal(
      cleanCommitMessageValue(
        `Subject\n\nCo-authored-by: dependabot[bot] <bot@example.com>\n${signOff}`,
      ).text,
      `Subject\n\n${signOff}`,
    );
  });
}

test("Preserves human co-authors and legacy username matching", () => {
  const { cleanCommitMessageValue, extractUsernameCandidates } = loadContent();
  const message = "Subject\n\nCo-authored-by: Human <human@example.com>";
  assert.equal(cleanCommitMessageValue(message).text, message);
  assert.equal(
    extractUsernameCandidates(
      "alice@users.noreply.github.com",
      "Other Person",
    ).has("alice"),
    true,
  );
  assert.equal(
    extractUsernameCandidates("someone@example.com", "Alice").has("alice"),
    true,
  );
});
