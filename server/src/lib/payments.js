import Stripe from 'stripe';
import config from '../config.js';

// Stripe Connect "separate charges and transfers". No STRIPE_SECRET_KEY = mock provider for local dev.

let stripe;
export function getStripe() {
  if (!config.stripe.secretKey) return null;
  if (!stripe) stripe = new Stripe(config.stripe.secretKey);
  return stripe;
}

export const providerName = () => (getStripe() ? 'stripe' : 'mock');

export const toCents = (amount) => Math.round(amount * 100);
export const round2 = (n) => Math.round(n * 100) / 100;

export async function createConnectAccount(vendor, email) {
  const s = getStripe();
  if (!s) return { id: `mock_acct_${vendor._id}`, mock: true };
  // Accounts v2 (new platforms can't use v1). A "recipient" account only receives transfers from us,
  // with an Express dashboard, and the platform covers losses
  const account = await s.v2.core.accounts.create({
    contact_email: email,
    display_name: vendor.storeName,
    dashboard: 'express',
    identity: { country: config.stripe.accountCountry },
    configuration: {
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
    },
    defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
    metadata: { vendorId: vendor._id.toString() },
  });
  return { id: account.id };
}

export async function createOnboardingLink(accountId) {
  const s = getStripe();
  if (!s) return null;
  const link = await s.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        refresh_url: `${config.clientUrl}/vendor/payouts?refresh=1`,
        return_url: `${config.clientUrl}/vendor/payouts?done=1`,
      },
    },
  });
  return link.url;
}

export async function getAccountStatus(accountId) {
  const s = getStripe();
  if (!s) return { payoutsEnabled: true };
  const account = await s.v2.core.accounts.retrieve(accountId, { include: ['configuration.recipient'] });
  const transfers = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
  return { payoutsEnabled: transfers?.status === 'active' };
}

export async function createPaymentIntent({ amount, paymentGroup, customerId }) {
  const s = getStripe();
  if (!s) {
    return { provider: 'mock', id: `mock_pi_${paymentGroup}`, clientSecret: null };
  }
  const intent = await s.paymentIntents.create({
    amount: toCents(amount),
    currency: config.currency,
    transfer_group: paymentGroup,
    automatic_payment_methods: { enabled: true },
    metadata: { paymentGroup, customerId },
  });
  return { provider: 'stripe', id: intent.id, clientSecret: intent.client_secret };
}

export async function getPaymentIntent(id) {
  const s = getStripe();
  if (!s) return { id, status: 'succeeded', latest_charge: null };
  return s.paymentIntents.retrieve(id);
}

export async function transferToVendor({ amount, accountId, paymentGroup, chargeId, orderId }) {
  const s = getStripe();
  if (!s) return { id: `mock_tr_${orderId}` };
  if (!accountId) return { id: null };
  const transfer = await s.transfers.create({
    amount: toCents(amount),
    currency: config.currency,
    destination: accountId,
    transfer_group: paymentGroup,
    // tie the transfer to the charge so it doesn't fail on pending balance
    ...(chargeId && { source_transaction: chargeId }),
    metadata: { orderId: orderId.toString() },
  });
  return { id: transfer.id };
}

export async function refundPayment(intentId, amount) {
  const s = getStripe();
  if (!s) return { id: `mock_re_${intentId}` };
  return s.refunds.create({ payment_intent: intentId, amount: toCents(amount) });
}

// takes back part of a vendor's transfer, used for refunds after the payout went out
export async function reverseTransfer(transferId, amount) {
  const s = getStripe();
  if (!s || !transferId || amount <= 0) return { id: transferId ? `mock_trr_${transferId}` : null };
  return s.transfers.createReversal(transferId, { amount: toCents(amount) });
}

export async function cancelPaymentIntent(id) {
  const s = getStripe();
  if (!s) return null;
  try {
    return await s.paymentIntents.cancel(id);
  } catch {
    // already succeeded or cancelled, the caller checks the status
    return null;
  }
}

export function constructWebhookEvent(rawBody, signature) {
  return getStripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}
