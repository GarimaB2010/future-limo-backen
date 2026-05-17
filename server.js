// ==========================================
// FUTURE LIMO STRIPE BACKEND
// ==========================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

// ==========================================
// CORS
// ==========================================

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://future-limo.com'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// ==========================================
// HEALTH CHECK ROUTE
// ==========================================

app.get('/', (req, res) => {
  res.send('✅ Future Limo backend running');
});

// ==========================================
// WEBHOOK ROUTE
// MUST COME BEFORE express.json()
// ==========================================

app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (request, response) => {

    const sig = request.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        endpointSecret
      );
    } catch (err) {
      console.error(`❌ Webhook Error: ${err.message}`);
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ==========================================
    // PAYMENT SUCCESS
    // ==========================================

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;

      console.log(`✅ Payment succeeded: ${paymentIntent.amount / 100} CAD`);

      try {
        const customerName = paymentIntent.metadata.customerName || 'Customer';
        const customerEmail = paymentIntent.metadata.customerEmail;
        const pickup = paymentIntent.metadata.pickup || 'Not provided';
        const destination = paymentIntent.metadata.destination || 'Not provided';
        const vehicle = paymentIntent.metadata.vehicle || 'Not provided';
        const bookingDate = paymentIntent.metadata.bookingDate || 'Not provided';
        const totalPaid = (paymentIntent.amount / 100).toFixed(2);

        // ==========================================
        // SEND EMAIL TO CUSTOMER
        // ==========================================

        if (customerEmail) {
          await resend.emails.send({
            from: 'Future Limo <reservations@future-limo.com>',
            to: customerEmail,
            subject: 'Your Future Limo Booking Confirmation',
            html: `
              <h1>Booking Confirmed</h1>

              <p>Thank you for booking with Future Limo.</p>

              <h3>Trip Details</h3>

              <p><strong>Name:</strong> ${customerName}</p>
              <p><strong>Pickup:</strong> ${pickup}</p>
              <p><strong>Destination:</strong> ${destination}</p>
              <p><strong>Vehicle:</strong> ${vehicle}</p>
              <p><strong>Date:</strong> ${bookingDate}</p>
              <p><strong>Total Paid:</strong> $${totalPaid} CAD</p>

              <br />

              <p>We look forward to serving you.</p>
              <p>Future Limo</p>
            `
          });
        }

        // ==========================================
        // SEND EMAIL TO OWNER
        // ==========================================

        await resend.emails.send({
          from: 'Future Limo <reservations@future-limo.com>',
          to: 'reservations@future-limo.com',
          subject: 'New Future Limo Booking Paid',
          html: `
            <h1>New Paid Booking</h1>

            <h3>Customer Details</h3>

            <p><strong>Name:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail || 'Not provided'}</p>

            <h3>Trip Details</h3>

            <p><strong>Pickup:</strong> ${pickup}</p>
            <p><strong>Destination:</strong> ${destination}</p>
            <p><strong>Vehicle:</strong> ${vehicle}</p>
            <p><strong>Date:</strong> ${bookingDate}</p>
            <p><strong>Total Paid:</strong> $${totalPaid} CAD</p>

            <br />

            <p>This booking has been paid successfully through Stripe.</p>
          `
        });

        console.log('📧 Customer and owner emails sent');

      } catch (emailError) {
        console.error('❌ Email sending failed:', emailError);
      }
    }

    // ==========================================
    // PAYMENT FAILED
    // ==========================================

    else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      console.log(`❌ Payment failed: ${paymentIntent.amount / 100} CAD`);
    }

    response.sendStatus(200);
  }
);

// ==========================================
// NORMAL JSON ROUTES
// ==========================================

app.use(express.json());

// ==========================================
// CREATE PAYMENT INTENT
// ==========================================

app.post('/create-payment-intent', async (req, res) => {
  try {
    const {
      amount,
      customerName,
      customerEmail,
      pickup,
      destination,
      vehicle,
      bookingDate
    } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'cad',

      automatic_payment_methods: {
        enabled: true,
      },

      receipt_email: customerEmail,

      metadata: {
        customerName,
        customerEmail,
        pickup,
        destination,
        vehicle,
        bookingDate
      }
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (error) {
    console.error(error);

    res.status(400).send({
      error: {
        message: error.message
      }
    });
  }
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
