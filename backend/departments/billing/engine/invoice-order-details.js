function findLinkedOrderDetails(db, customerId, invoiceNumber) {
  return db.prepare(`
    SELECT
      order_number AS order_no,
      order_date,
      lr_no,
      lr_date,
      transport,
      cases
    FROM orders
    WHERE customer_id = ?
      AND LOWER(TRIM(bill_reference)) = LOWER(TRIM(?))
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(customerId, invoiceNumber) || null;
}

module.exports = { findLinkedOrderDetails };
