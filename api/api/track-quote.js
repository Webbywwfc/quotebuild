export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const normalised = email.toLowerCase().trim();
  const key = `quotes:${encodeURIComponent(normalised)}`;

  try {
    // Get current count
    const getRes = await fetch(
      `${process.env.KV_REST_API_URL}/get/${key}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    const getData = await getRes.json();
    const count = parseInt(getData.result || '0', 10);

    // Check pro status
    const proKey = `pro:${encodeURIComponent(normalised)}`;
    const proRes = await fetch(
      `${process.env.KV_REST_API_URL}/get/${proKey}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    const proData = await proRes.json();
    const isPro = proData.result === 'true';

    if (!isPro && count >= 3) {
      return res.status(200).json({ allowed: false, count, isPro: false });
    }

    // Increment count
    await fetch(
      `${process.env.KV_REST_API_URL}/incr/${key}`,
      { method: 'GET', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );

    return res.status(200).json({ allowed: true, count: count + 1, isPro });

  } catch (err) {
    console.error('track-quote error:', err);
    return res.status(500).json({ error: err.message });
  }
}
