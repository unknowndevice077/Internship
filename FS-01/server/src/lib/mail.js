import nodemailer from 'nodemailer';
import config from '../config.js';
import logger from './logger.js';

// With no SMTP_URL, mail is logged instead of sent (and kept in `outbox` for tests).
export const outbox = [];

let transport;
function getTransport() {
  if (!transport) {
    transport = config.mail.smtpUrl
      ? nodemailer.createTransport(config.mail.smtpUrl)
      : nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

export async function sendMail(to, { subject, text }) {
  const message = { from: config.mail.from, to, subject, text };
  if (!config.mail.smtpUrl) {
    outbox.push(message);
    if (outbox.length > 50) outbox.shift();
    logger.info({ to, subject }, 'mail (not sent, no SMTP_URL)');
    logger.debug(text);
  }
  return getTransport().sendMail(message);
}

const money = (n) => `$${Number(n).toFixed(2)}`;
const link = (path) => `${config.clientUrl}${path}`;

export const templates = {
  verifyEmail: (user, token) => ({
    subject: 'Confirm your Vendora email',
    text: `Hi ${user.name},\n\nConfirm your email by opening this link:\n${link(`/verify-email?token=${token}`)}\n\nThe link works for 24 hours.`,
  }),

  resetPassword: (user, token) => ({
    subject: 'Reset your Vendora password',
    text: `Hi ${user.name},\n\nSomeone asked to reset your password. If that was you, open this link:\n${link(`/reset-password?token=${token}`)}\n\nIt works for 1 hour. If it wasn't you, you can ignore this email.`,
  }),

  orderPlaced: (user, orders) => {
    const lines = orders.flatMap((o) =>
      o.items.map((i) => `  ${i.quantity} x ${i.title}  ${money(i.price * i.quantity)}`),
    );
    const total = orders.reduce((s, o) => s + o.total, 0);
    return {
      subject: `Order confirmed: ${orders.map((o) => o.orderNumber).join(', ')}`,
      text: `Hi ${user.name},\n\nThanks for your order.\n\n${lines.join('\n')}\n\nTotal paid: ${money(total)}\n\nTrack it here: ${link('/orders')}`,
    };
  },

  orderShipped: (user, order) => ({
    subject: `Your order ${order.orderNumber} has shipped`,
    text: `Hi ${user.name},\n\nGood news, ${order.orderNumber} is on its way.\n\nDetails: ${link(`/orders/${order._id}`)}`,
  }),

  storeApproved: (user, vendor) => ({
    subject: `${vendor.storeName} is approved`,
    text: `Hi ${user.name},\n\nYour store ${vendor.storeName} has been approved. Connect your payout account and start listing products:\n${link('/vendor')}`,
  }),
};
