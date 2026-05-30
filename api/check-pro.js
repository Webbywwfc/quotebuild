export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const normalised = email.toLowerCase().trim();

  try {
    const response = await fetch(`${process.env.KV_REST_API_URL}/get/pro:${encodeURIComponent(normalised)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
    });
    const data = await response.json();
    const isPro = data.result === 'true';
    return res.status(200).json({ isPro });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
