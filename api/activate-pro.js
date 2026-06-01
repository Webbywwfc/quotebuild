export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, sessionId } = req.body;

  if (!email || !sessionId) {
    return res.status(400).json({ error: 'Missing email or sessionId' });
  }

  try {
    const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY));

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const normalised = email.toLowerCase().trim();
    await fetch(
      `${process.env.KV_REST_API_URL}/set/pro:${encodeURIComponent(normalised)}/true`,
      { method: 'GET', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );

    console.log(`Pro activated for ${normalised} (session: ${sessionId})`);

// Send notification email to hello@briefquote.co.uk
await fetch('https://formspree.io/f/xzdwqdqq', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    _subject: '🎉 New BriefQuote Pro subscriber!',
    message: `New Pro subscriber: ${normalised}\nSession: ${sessionId}\nTime: ${new Date().toISOString()}`
  })
});
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('activate-pro error:', err);
    return res.status(500).json({ error: err.message });
  }
}
