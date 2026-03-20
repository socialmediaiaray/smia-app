// api/progress.js — Salva e carrega o progresso do aluno por email
// Usa o KV (Key-Value store) gratuito da Vercel para persistir os dados

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV não configurado.' });
  }

  // Normaliza email como chave
  const normalizeEmail = (email) =>
    email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '');

  // GET /api/progress?email=xxx — carrega progresso
  if (req.method === 'GET') {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

    const key = `progress:${normalizeEmail(email)}`;
    try {
      const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const data = await r.json();
      if (!data.result) return res.status(200).json({ completed: {}, checklist: {} });
      const parsed = JSON.parse(data.result);
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(200).json({ completed: {}, checklist: {} });
    }
  }

  // POST /api/progress — salva progresso
  if (req.method === 'POST') {
    const { email, completed, checklist } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

    const key = `progress:${normalizeEmail(email)}`;
    const value = JSON.stringify({ completed: completed || {}, checklist: checklist || {}, updatedAt: new Date().toISOString() });

    try {
      await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(value)
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao salvar.' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}
