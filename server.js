const express = require('express');
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());

// ==========================================
// 1. WEBHOOK ROUTE (MUST BE BEFORE express.json)
// ==========================================
// We use express.raw() because Stripe needs the raw request body to check the security signature.
app.post('/webhook', express.raw({ type: 'application/json' }), (request, response) => {
  const sig = request.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // This verifies the request 100% came from Stripe using your Webhook Secret
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the specific events we care about
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    console.log(`✅ [SUCCESS] Payment for ${paymentIntent.amount / 100} CAD succeeded!`);
    
    // TODO: Write code to send emails/save to database here
    
  } else if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    console.log(`❌ [FAILED] Payment for ${paymentIntent.amount / 100} CAD failed.`);
  }

  // Return a 200 response to acknowledge receipt so Stripe stops sending it
  response.send();
});

// ==========================================
// 2. STANDARD ROUTES (Uses express.json)
// ==========================================
app.use(express.json()); // Now we can parse JSON for normal routes

app.post('/create-payment-intent', async (req, res) => {
  const { amount } = req.body;

  try {
    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convert to cents for Stripe
      currency: 'cad',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(400).send({
      error: { message: error.message }
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
