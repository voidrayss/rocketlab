# Public hosting preparation — not deployed

RocketLab is compatible with static hosting; no server-side runtime or compile
step is required. GitHub Pages is the preferred first option. The prepared
[workflow template](deployment/github-pages.yml.example) sits outside
`.github/workflows`, so pushing it cannot trigger a workflow or publish a site.
It is manual-only and restricts deployment to main even after activation.

The last GitHub audit found Pages disabled, no homepage/deployment/workflow,
and no custom domain. The only supplied URL is localhost:8000. No existing
public website has been identified or overwritten.

## Exact activation steps — only after explicit approval

1. Review and merge approved development features into main; do not publish
   experimental changes implicitly.
2. Copy `docs/deployment/github-pages.yml.example` to
   `.github/workflows/pages.yml` in the approved main revision.
3. In `voidrayss/rocketlab` → Settings → Pages → Build and deployment → Source,
   select **GitHub Actions**. Add a required reviewer for the `github-pages`
   environment if available for the account/repository.
4. In Actions, select **Publish approved RocketLab to Pages** → Run workflow,
   using main. It stages only index.html/css/js/data, then uploads/deploys.
5. Use the deployment job's returned URL. The expected default project URL is
   `https://voidrayss.github.io/rocketlab/`; it is not currently claimed live.
6. Verify 2D/3D, motor fetching, JSON download/load, CAD worker/STEP import/export,
   and HTTPS after publication. No DNS or personal tokens are needed for this
   default Pages address. Do not add a custom domain without separate approval.

Routine pushes to development will not deploy. Local preview remains
`python3 -m http.server 8000`. The integration test's `--subpath` mode serves
under `/rocketlab/` to check relative URLs before enabling hosting. Pages does
not provide a separate per-branch preview here; preview development locally or
choose a separate preview service later with approval.

If an approved release needs rollback, publish a new reviewed revert commit on
main and manually dispatch the workflow again; do not force-push shared history.
The template has not run on GitHub, so publication remains unverified.

Official references checked 2026-10-25:
[custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[publishing source settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
