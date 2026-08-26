const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/routing', (req, res) => {
    const sku = req.query.sku;
    const batch = req.query.batch;
    
    // Check if the user is an authenticated admin/staff
    // For this example, we assume auth is handled via a cookie 'auth_token'
    // This could also be a check against the DB session
    const isAuthenticated = !!req.cookies.auth_token;

    if (isAuthenticated) {
      // Redirect to the internal POS or Inventory view
      // This allows the custom POS app scanner to handle it or the browser to open the internal view
      if (sku) {
        res.redirect(`/app/pos?add_sku=${encodeURIComponent(sku)}`);
      } else if (batch) {
        res.redirect(`/app/inventory?view_batch=${encodeURIComponent(batch)}`);
      } else {
        res.redirect('/app/product-list');
      }
    } else {
      // Unauthenticated - redirect to public product info page
      if (sku) {
        res.redirect(`/public/product/${encodeURIComponent(sku)}?showSimilar=true`);
      } else if (batch) {
        res.redirect(`/public/batch/${encodeURIComponent(batch)}`);
      } else {
        res.redirect('/');
      }
    }
  });

  // Example shortlink implementation
  router.get('/:shortId', (req, res) => {
    // In a real implementation, you would look up the shortId in the database
    // For now, we just pass the query parameters to the routing logic
    const sku = req.query.sku;
    const batch = req.query.batch;
    
    // Redirect to the smart routing logic
    let url = '/q/routing';
    if (sku) url += `?sku=${encodeURIComponent(sku)}`;
    else if (batch) url += `?batch=${encodeURIComponent(batch)}`;
    
    res.redirect(url);
  });

  return router;
};
