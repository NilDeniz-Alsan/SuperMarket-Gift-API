require('dotenv').config();
const express = require('express');
const { shopifyApi } = require('@shopify/shopify-api');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify API konfigürasyonu
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  hostName: process.env.SHOPIFY_STORE_DOMAIN,
  adminApiAccessToken: process.env.SHOPIFY_ADMIN_API_TOKEN,
  apiVersion: '2024-04',
  isEmbeddedApp: false,
});

// Webhook doğrulama middleware
const verifyShopifyWebhook = (req, res, next) => {
  try {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const topic = req.get('X-Shopify-Topic');
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const rawBody = req.body;

    if (!hmacHeader || !rawBody) {
      console.error("❌ HMAC header veya body eksik");
      return res.status(401).send('Unauthorized');
    }

    // HMAC oluştur
    const generatedHmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(rawBody)
      .digest('base64');

    // Timing safe comparison
    const shopifyHmacBuffer = Buffer.from(hmacHeader, 'base64');
    const generatedHmacBuffer = Buffer.from(generatedHmac, 'base64');
    
    if (!crypto.timingSafeEqual(shopifyHmacBuffer, generatedHmacBuffer)) {
      console.error("❌ Webhook doğrulaması başarısız.");
      return res.status(401).send('Unauthorized');
    }

    // Body'yi parse et
    req.body = JSON.parse(rawBody.toString('utf8'));
    req.shopDomain = shopDomain;
    next();
  } catch (err) {
    console.error("❌ Webhook doğrulama hatası:", err);
    return res.status(400).send('Webhook validation failed');
  }
};

// Webhook endpoint
app.post(
  '/webhooks/orders/paid',
  express.raw({ type: 'application/json' }),
  verifyShopifyWebhook,
  async (req, res) => {
    try {
      const order = req.body;
      const shopDomain = req.shopDomain;
      
      console.log(`🧾 Order #${order.order_number} alındı.`);

      const shouldConvert = order.note_attributes?.some(
        attr => attr.name === 'convertToGiftCard' && attr.value === 'true'
      );

      if (shouldConvert) {
        console.log('🎁 Hediye kartı oluşturulacak.');

        const session = shopify.session.customAppSession(shopDomain);
        const client = new shopify.clients.Rest({ session });

        const giftCardData = {
          gift_card: {
            note: `Order #${order.order_number} üzerinden oluşturuldu.`,
            initial_value: parseFloat(order.total_price),
            currency: order.currency,
            customer_id: order.customer?.id || null,
          },
        };

        const response = await client.post({
          path: 'gift_cards',
          data: giftCardData,
        });

        console.log(`✅ Gift card oluşturuldu: ${response.body.gift_card.id}`);
        console.log(`🔗 Gift card URL: https://${shopDomain}/admin/gift_cards/${response.body.gift_card.id}`);
      } else {
        console.log('ℹ️ Normal sipariş, işlem yapılmadı.');
      }

      res.status(200).send('OK');
    } catch (err) {
      console.error('❌ Hata:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Kök dizin kontrolü
app.get('/', (req, res) => {
  res.send('Shopify Gift Card App Çalışıyor');
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
  console.log(`🔧 Kullanılan Shopify API Sürümü: 2024-04`);
  console.log(`🏪 Mağaza: ${process.env.SHOPIFY_STORE_DOMAIN}`);
});
