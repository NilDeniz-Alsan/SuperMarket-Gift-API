// Gerekli kütüphaneler
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify uygulama bilgileri
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

// Shopify'dan gelen webhook'ları doğrulamak için middleware
const verifyShopifyWebhook = (req, res, next) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const rawBody = req.body; // Bu artık bir Buffer!

  const hash = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

  if (hash === hmac) {
    try {
      req.body = JSON.parse(rawBody.toString('utf8')); // JSON'ı burada parse ediyoruz
      next();
    } catch (error) {
      console.error('❌ JSON parse hatası:', error);
      res.status(400).send('Bad Request');
    }
  } else {
    console.error('❌ Webhook doğrulaması başarısız.');
    res.status(401).send('Unauthorized');
  }
};

// Shopify'dan gelen /orders/paid webhook'unu karşılayan route
app.post('/webhooks/orders/paid', verifyShopifyWebhook, async (req, res) => {
  const order = req.body;
  console.log(`🧾 Order #${order.order_number} alındı.`);

  // convertToGiftCard attribute'u var mı kontrol et
  if (order.note_attributes && order.note_attributes.some(attr => attr.name === 'convertToGiftCard' && attr.value === 'true')) {
    console.log('🎁 Hediye kartı oluşturulacak.');

    const giftCardData = {
      gift_card: {
        note: `Order #${order.order_number} üzerinden oluşturuldu.`,
        initial_value: parseFloat(order.total_price),
        currency: order.currency,
        customer_id: order.customer ? order.customer.id : null,
      },
    };

    try {
      const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/gift_cards.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
        },
        body: JSON.stringify(giftCardData),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(JSON.stringify(responseData.errors));
      }

      console.log(`✅ Gift card oluşturuldu: ${responseData.gift_card.id}`);
    } catch (error) {
      console.error(`❌ Gift card oluşturulamadı:`, error);
    }
  } else {
    console.log('Normal sipariş, işlem yapılmadı.');
  }

  res.status(200).send('OK');
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
