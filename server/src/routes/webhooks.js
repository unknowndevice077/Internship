import express, { Router } from 'express';
import Vendor from '../models/Vendor.js';
import { completePayment } from '../lib/orders.js';
import { constructWebhookEvent, getStripe } from '../lib/payments.js';

const router = Router();

// Stripe needs the raw body to verify the signature, so this is mounted before express.json()
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!getStripe()) return res.status(404).end();
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const group = event.data.object.metadata?.paymentGroup;
      if (group) await completePayment(group);
    } else if (event.type === 'account.updated') {
      const account = event.data.object;
      await Vendor.updateOne(
        { stripeAccountId: account.id },
        { payoutsEnabled: Boolean(account.charges_enabled && account.payouts_enabled) },
      );
    }
    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, 'webhook handling failed');
    res.status(500).json({ error: 'handler failed' });
  }
});

export default router;
