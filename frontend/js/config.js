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

  const RAILWAY_BACKEND_API = "https://blog-api-production-76b4.up.railway.app/api/v1";

  // Check stored override or URL parameter
  let base = storedApi || paramApi;
  if (!base) {
    if (window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      base = "http://localhost:8000/api/v1";
    } else {
      // Vercel / Production deployment: use the live Railway backend
      base = RAILWAY_BACKEND_API;
    }
  }

  window.LONGHAND = {
    appName: "Longhand",
    apiBase: base,
  };
})();
