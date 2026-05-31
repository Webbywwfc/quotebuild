export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  try {
    const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY));

    // Find customer by email
    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });

    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'No customer found for this email' });
    }

    const customerId = customers.data[0].id;

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://app.briefquote.co.uk',
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('customer-portal error:', err);
    return res.status(500).json({ error: err.message });
  }
}
