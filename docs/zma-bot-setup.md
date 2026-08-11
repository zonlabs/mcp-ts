# zma[bot] — automated bot setup

The AI workflows in this repo run on the opencode engine but post as a
custom bot identity, **`zma[bot]`** (Zon Labs MCP Assistant), instead of
the default `github-actions[bot]`.

This is achieved with a GitHub App named **`ZMA`**. GitHub automatically
renders its account as `zma[bot]`. The workflows mint a short-lived token
for that app (`actions/create-github-app-token@v1`) and pass it to the
opencode action as `GITHUB_TOKEN`, so every review, comment, and triage
response is authored by `zma[bot]`.

## Step 1 — Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
   (https://github.com/settings/apps/new)
2. Fill in:
   - **GitHub App name:** `ZMA`  (displays as `zma[bot]`)
   - **Homepage URL:** `https://github.com/zonlabs`
   - **Description:** e.g. "Zon Labs MCP Assistant bot — automated issue triage and PR review"
   - **Webhook:** Disable (no webhook needed; workflows are event-driven)
3. **Repository permissions** (must be granted):
   - `Contents` → **Read**
   - `Issues` → **Read & write**
   - `Pull requests` → **Read & write**
   - `Metadata` → **Read** (always)
4. Leave "Subscribe to events" empty (no webhook).
5. Click **Create GitHub App**.
6. On the app page:
   - Copy the **App ID** (top of page).
   - Click **Generate a private key** → downloads a `.pem` file. Keep it safe — it can only be downloaded once.

## Step 2 — Install the app on the repo

1. On the app page, go to **Install App** (left sidebar) → **Install** next to `zonlabs`.
2. Select the **mcp-ts** repository (or "All repositories" if you want it org-wide).
3. Confirm the permissions shown and **Install**.

## Step 3 — Add repo secrets

Go to **Repo → Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `ZMA_APP_ID` | The app ID copied in Step 1.6 |
| `ZMA_PRIVATE_KEY` | The **entire contents** of the `.pem` file (including `-----BEGIN RSA PRIVATE KEY-----` … `-----END RSA PRIVATE KEY-----`) |
| `OPENCODE_API_KEY` | An opencode API key for the underlying engine (same key the obot repo workflows use) |

> `ZMA_PRIVATE_KEY` is multiline — paste the full PEM. A common failure is a
> truncated key that omits the trailing newline.

## How it works

- `.github/workflows/opencode.yml` — responds to `/oc` and `/opencode` comments (and `@` mentions) on issues/PRs
- `.github/workflows/opencode-triage.yml` — triages newly opened issues from accounts older than 30 days
- `.github/workflows/opencode-review.yml` — reviews every opened/synced PR for quality, bugs, and improvements

All three mint a `zma[bot]` token and feed it to `anomalyco/opencode/github@latest`, so the
engine is opencode but the identity shown to contributors is `zma[bot]`.

## Troubleshooting

- **Workflow fails with "Could not get token"** → check `ZMA_APP_ID` / `ZMA_PRIVATE_KEY` are set correctly (full PEM, no stray whitespace).
- **Comments still posted by `github-actions[bot]`** → the `GITHUB_TOKEN` env wasn't picked up; verify `use_github_token: true` is set and the `app-token` step ID matches.
- **App can't comment** → confirm `Issues` and `Pull requests` permissions are **Read & write** and the app is installed on this repo.
