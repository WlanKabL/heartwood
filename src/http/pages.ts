import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { getUserSession } from '../auth/session.js'
import { users, apiTokens } from '../storage/schema.js'
import type { Db } from '../storage/db.js'

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface PagesDeps {
  db: Db
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escapes the five HTML special characters to prevent markup injection. */
const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// ---------------------------------------------------------------------------
// HTML templates
// ---------------------------------------------------------------------------

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; margin-bottom: 0.5rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.25rem; }
    a { color: #2563eb; }
    button, input[type=submit] { cursor: pointer; padding: 0.4rem 0.9rem; background: #2563eb; color: #fff; border: none; border-radius: 4px; font-size: 0.9rem; }
    button.danger { background: #dc2626; }
    input[type=text] { padding: 0.35rem 0.6rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; width: 16rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #e5e5e5; }
    th { color: #6b7280; font-weight: 600; }
    .notice { background: #fef9c3; border: 1px solid #fde047; border-radius: 4px; padding: 0.75rem 1rem; margin-top: 1rem; font-size: 0.9rem; }
    .token-box { font-family: monospace; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.5rem; word-break: break-all; margin-top: 0.5rem; }
    .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .row-actions { display: flex; gap: 0.5rem; align-items: center; }
  </style>
</head>
<body>
${body}
</body>
</html>`

const loginPage = (): string =>
  layout(
    'Heartwood',
    `<h1>Heartwood</h1>
<p class="meta">Knowledge infrastructure for AI agents.</p>
<a href="/auth/github">Log in with GitHub</a>`,
  )

const dashboardPage = (email: string, tokenRows: { id: string; name: string; prefix: string }[]): string => {
  const escapedEmail = escapeHtml(email)

  const tokenTableRows =
    tokenRows.length === 0
      ? `<tr><td colspan="3" style="color:#6b7280">No tokens yet.</td></tr>`
      : tokenRows
          .map(
            (t) =>
              `<tr data-token-id="${escapeHtml(t.id)}">
            <td>${escapeHtml(t.name)}</td>
            <td><code>${escapeHtml(t.prefix)}…</code></td>
            <td>
              <button class="danger" type="button" onclick="deleteToken(this, '${escapeHtml(t.id)}', '${escapeHtml(t.name)}')">Delete</button>
            </td>
          </tr>`,
          )
          .join('\n')

  return layout(
    'Heartwood — Dashboard',
    `<h1>Heartwood</h1>
<p class="meta">Logged in as <strong>${escapedEmail}</strong></p>

<form method="post" action="/auth/logout" style="display:inline">
  <button type="submit">Log out</button>
</form>

<h2>API Tokens</h2>
<table>
  <thead>
    <tr><th>Name</th><th>Prefix</th><th></th></tr>
  </thead>
  <tbody id="token-tbody">
    ${tokenTableRows}
  </tbody>
</table>

<h2>Create token</h2>
<form id="create-token-form" style="display:flex;gap:0.5rem;align-items:center">
  <input type="text" name="name" id="token-name" placeholder="Token name" required autocomplete="off" />
  <button type="submit">Create</button>
</form>
<div id="new-token-notice" style="display:none" class="notice">
  <strong>Copy this token now — it will not be shown again.</strong>
  <div class="token-box" id="new-token-value"></div>
  <button type="button" style="margin-top:0.5rem" onclick="copyToken()">Copy</button>
</div>

<script>
(function () {
  const form = document.getElementById('create-token-form');
  const notice = document.getElementById('new-token-notice');
  const tokenValue = document.getElementById('new-token-value');
  const tbody = document.getElementById('token-tbody');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = document.getElementById('token-name').value.trim();
    if (!name) return;

    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        alert('Failed to create token: ' + res.status);
        return;
      }
      const data = await res.json();

      // Show the raw token once.
      tokenValue.textContent = data.raw;
      notice.style.display = 'block';
      notice.scrollIntoView({ behavior: 'smooth' });

      // Append a new row to the table without a full reload.
      const noDataRow = tbody.querySelector('td[colspan]');
      if (noDataRow) noDataRow.closest('tr').remove();

      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = data.name;
      tr.appendChild(tdName);

      const tdPrefix = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = data.prefix + '…';
      tdPrefix.appendChild(code);
      tr.appendChild(tdPrefix);

      tr.dataset.tokenId = data.id;

      const tdAction = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'danger';
      delBtn.textContent = 'Delete';
      delBtn.onclick = function () { deleteToken(delBtn, data.id, data.name); };
      tdAction.appendChild(delBtn);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);

      document.getElementById('token-name').value = '';
    } catch (err) {
      alert('Network error: ' + err);
    }
  });

  window.deleteToken = async function (btn, id, name) {
    if (!confirm('Delete token ' + name + '?')) return;
    try {
      const res = await fetch('/api/tokens/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!res.ok) {
        alert('Failed to delete token: ' + res.status);
        return;
      }
      const row = btn.closest('tr');
      if (row) row.remove();
      if (tbody.querySelectorAll('tr').length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.style.color = '#6b7280';
        td.textContent = 'No tokens yet.';
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    } catch (err) {
      alert('Network error: ' + err);
    }
  };

  window.copyToken = function () {
    const text = tokenValue.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  };

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}());
</script>`,
  )
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerPages = (app: FastifyInstance, deps: PagesDeps): void => {
  app.get('/', async (request, reply) => {
    const userId = getUserSession(request)

    if (userId === null) {
      return reply
        .code(200)
        .header('content-type', 'text/html; charset=utf-8')
        .send(loginPage())
    }

    const [user] = await deps.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))

    const email = user?.email ?? ''

    const tokens = await deps.db
      .select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix })
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))

    return reply
      .code(200)
      .header('content-type', 'text/html; charset=utf-8')
      .send(dashboardPage(email, tokens))
  })
}
