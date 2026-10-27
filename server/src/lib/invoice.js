import PDFDocument from 'pdfkit';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// Streams a simple invoice PDF for one vendor order into `stream` (usually the response).
export function writeInvoice(stream, { order, vendor, customer }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  doc.fontSize(22).text('Vendora', { continued: true }).fontSize(10).text('  marketplace invoice');
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`Invoice #: ${order.orderNumber}`);
  doc.text(`Date: ${new Date(order.payment?.paidAt || order.createdAt).toDateString()}`);
  doc.text(`Status: ${order.status}`);
  doc.moveDown();

  const top = doc.y;
  doc.font('Helvetica-Bold').text('Sold by', 50, top).font('Helvetica');
  doc.text(vendor.storeName, 50);
  doc.font('Helvetica-Bold').text('Bill to', 300, top).font('Helvetica');
  doc.text(customer.name, 300).text(customer.email, 300);
  const a = order.shippingAddress || {};
  if (a.line1) doc.text(`${a.line1}, ${a.city || ''} ${a.postalCode || ''}`, 300).text(a.country || '', 300);
  doc.moveDown(2);

  const cols = { item: 50, qty: 330, price: 390, total: 470 };
  const row = (y, cells, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(cells[0], cols.item, y, { width: 270 });
    doc.text(cells[1], cols.qty, y);
    doc.text(cells[2], cols.price, y);
    doc.text(cells[3], cols.total, y);
  };

  let y = doc.y;
  row(y, ['Item', 'Qty', 'Price', 'Total'], true);
  doc.moveTo(50, y + 15).lineTo(545, y + 15).stroke();
  y += 25;
  for (const item of order.items) {
    row(y, [item.title, String(item.quantity), money(item.price), money(item.price * item.quantity)]);
    y += 22;
  }
  doc.moveTo(50, y).lineTo(545, y).stroke();
  y += 10;

  const totals = [
    ['Subtotal', money(order.subtotal)],
    ...(order.discount ? [[`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `-${money(order.discount)}`]] : []),
    ['Total paid', money(order.total)],
  ];
  for (const [label, value] of totals) {
    doc.font(label === 'Total paid' ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, cols.price - 60, y).text(value, cols.total, y);
    y += 18;
  }

  doc.font('Helvetica').fontSize(8).fillColor('#666');
  doc.text('Thanks for shopping on Vendora. Payments are processed in test mode.', 50, 760, { align: 'center' });
  doc.end();
}
