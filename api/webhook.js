export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function setProStatus(email, isPro) {
  const normalised = email.toLowerCase().trim();
  const url = isPro
    ? `${process.env.KV_REST_API_URL}/set/pro:${encodeURIComponent(normalised)}/true`
    : `${process.env.KV_REST_API_URL}/del/pro:${encodeURIComponent(normalised)}`;

  await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY));
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_details?.email || session.customer_email;
        if (email) {
          await setProStatus(email, true);
          console.log(`Pro activated for ${email}`);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY));
        const customer = await stripe.customers.retrieve(subscription.customer);
        if (customer.email) {
          await setProStatus(customer.email, false);
          console.log(`Pro revoked for ${customer.email}`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        if (subscription.status === 'active') {
          const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY));
          const customer = await stripe.customers.retrieve(subscription.customer);
          if (customer.email) {
            await setProStatus(customer.email, true);
          }
        }
        break;
      }
      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
