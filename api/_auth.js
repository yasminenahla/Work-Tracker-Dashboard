// Editor-password gate for write endpoints. This is a soft lock (a shared
// secret checked server-side, not a real per-user account) — good enough to
// keep casual viewers from editing, not a substitute for real auth. See
// README.md's "Access control" note.
export function requireEditor(req, res) {
  const expected = process.env.EDITOR_PASSWORD;
  if (!expected) {
    // Misconfiguration: refuse writes rather than silently allowing them.
    res.status(500).json({ error: 'Server is missing EDITOR_PASSWORD configuration.' });
    return false;
  }
  const provided = req.headers['x-editor-password'];
  if (provided !== expected) {
    res.status(401).json({ error: 'Incorrect editor password.' });
    return false;
  }
  return true;
}
