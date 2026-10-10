// Point the frontend at your Blog API.
// Priority:
// 1. URL parameter (e.g. ?api=https://your-backend.up.railway.app/api/v1)
// 2. localStorage ('longhand.apiBase')
// 3. window.LONGHAND_API_BASE injected by hosting
// 4. Fallback to same-origin /api/v1 (or localhost:8000 when running locally)
(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const paramApi = urlParams.get('api');
  if (paramApi) {
    try { localStorage.setItem('longhand.apiBase', paramApi); } catch (_) {}
  }
  const storedApi = (() => { try { return localStorage.getItem('longhand.apiBase'); } catch (_) { return null; } })();

  let defaultBase = "https://blog-api-production-76b4.up.railway.app";
  if (window.location && window.location.origin) {
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      // If deployed on Vercel and no backend set, default to Railway/backend or same-origin
      defaultBase = window.LONGHAND_API_BASE || (window.location.origin + "/api/v1");
    }
  }

  window.LONGHAND = {
    appName: "Blog API",
    apiBase: storedApi || paramApi || defaultBase,
  };
})();
