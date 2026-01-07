# gjs-property-search

## Serving the site
This is a static site served directly from `index.html` at the repository root. If deployed with GitHub Pages, publish the `main` branch root (or the configured Pages branch) so `index.html` and `properties.json` sit at the site root.

### Local preview
Use any static server that serves the repository root. Example:
```bash
npx http-server . -p 5173 -c-1
```

### Hard refresh tips
If the layout looks stale after deploy, force a hard refresh to bypass cached CSS/HTML:
- Chrome/Edge: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (macOS)
- Safari: `Cmd+Option+E` to clear cache, then reload
