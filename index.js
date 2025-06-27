const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

// 🔐 Webhook doğrulama middleware
const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  let rawBody = '';

  req.on('data', chunk => {
    rawBody += chunk.toString();
  });

  req.on('end', () => {
    console.log("🔍 typeof rawBody:", typeof rawBody);
    console.log("🔍 rawBody instanceof Buffer:", rawBody instanceof Buffer);

    const generatedHmac = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');

    console.log("🧪 HMAC from Shopify:", hmacHeader);
    console.log("🧪 HMAC you generated:", generatedHmac);
    console.log("🔎 Karşılaştırma sonucu:", generatedHmac === hmacHeader);

    if (generatedHmac === hmacHeader) {
      try {
        req.body = JSON.parse(rawBody);
        console.log("✅ HMAC doğrulandı, JSON parse başarılı.");
        return next();
      } catch (err) {
        console.error("❌ JSON parse hatası:", err);
        return res.status(400).send("JSON parse failed.");
      }
    } else {
      console.error("❌ Webhook doğrulaması başarısız.");
      return res.status(401).send("Unauthorized");
    }
  });
};

// 📩 Webhook endpoint
app.post('/webhooks/orders/paid', verifyShopifyWebhook, async (req, res) => {
  const order = req.body;
  console.log(`📦 Sipariş alındı: Order #${order.order_number}, Toplam: ${order.total_price} ${order.currency}`);

  const convertGift = order.note_attributes?.some(
    attr => attr.name === 'convertToGiftCard' && attr.value === 'true'
  );

  if (convertGift) {
    console.log('🎁 Hediye kartı oluşturulacak.');

    const giftCardData = {
      gift_card: {
        note: `Order #${order.order_number} üzerinden oluşturuldu.`,
        initial_value: parseFloat(order.total_price),
        currency: order.currency,
        customer_id: order.customer ? order.customer.id : null,
      },
    };

    if (!giftCardData.gift_card.customer_id) {
      console.warn('⚠️ Müşteri ID yok, hediye kartı e-posta ile gönderilemez.');
    }

    try {
      const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/gift_cards.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
        },
        body: JSON.stringify(giftCardData),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("❌ Hediye kartı API hatası:", data.errors);
        throw new Error(JSON.stringify(data.errors));
      }

      console.log(`✅ Hediye kartı oluşturuldu: ID ${data.gift_card.id}`);
    } catch (err) {
      console.error("❌ Gift card oluşturulamadı:", err.message);
    }
  } else {
    console.log('ℹ️ Bu sipariş için hediye kartı oluşturulmayacak.');
  }

  res.status(200).send('OK');
});

// 🚀 Server başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
