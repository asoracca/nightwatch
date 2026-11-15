# Teammate setup

Private repository: https://github.com/asoracca/nightwatch

Ask the repository owner to invite your GitHub account, then:

```bash
git clone https://github.com/asoracca/nightwatch.git
cd nightwatch
git switch -c your-feature
```

Follow [LOCAL_SETUP.md](LOCAL_SETUP.md). Use Node 22 and Python 3.11. Run `npm ci` in frontend. Get secrets through your team's secret manager; never commit credentials, videos or model weights. Use your own Git identity. Open a pull request and run the two-user real-video acceptance tests before enabling hosted video processing.

The source was initially published through the GitHub connector because the author's machine lacked GitHub CLI/network access. Clone this remote for an aligned history; do not force-push an unrelated local initial commit.

## Fallback push commands for a fresh local copy
Only if the remote has not yet been initialized:

```bash
git add .
git diff --cached --check
git commit -m "Build NightWatch prototype"
gh repo create nightwatch --private --source=. --remote=origin --push
```

Suggested ownership: frontend/UI, API/worker, database/RLS, and Arduino firmware. Preserve Databricks assets and import no unverified records.
