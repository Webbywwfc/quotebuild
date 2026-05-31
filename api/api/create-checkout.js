export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;

  try {
    const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY));

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: { name: 'BriefQuote Pro' },
          unit_amount: 1499,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      customer_email: email || undefined,
      success_url: `https://app.briefquote.co.uk/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://app.briefquote.co.uk`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
