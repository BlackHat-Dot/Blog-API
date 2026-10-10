// Point the frontend at your Blog API.
// If you serve this folder from the same FastAPI app, use "/api/v1".
window.LONGHAND = {
  appName: "Blog API",
  apiBase: (window.location && window.location.origin ? window.location.origin : "http://localhost:8000") + "/api/v1",
};
