// Wraps a handler so a thrown error becomes a real JSON error response
// instead of Vercel's generic crash page — which is opaque to the browser
// (apiClient.js can't parse HTML as JSON, so it was falling back to a bare
// "Request failed (500)" with no detail). err.code is a Postgres error code
// (e.g. 42P01 = undefined table, 28P01 = bad password/auth) when the error
// came from `pg` — genuinely useful for diagnosis, not a secret.
export function withErrorHandling(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: err.message || 'Internal server error',
        code: err.code || null,
      });
    }
  };
}
