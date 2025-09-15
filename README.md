# Shopify Gift Card Payment Gateway

Bu proje, Shopify **orders/paid** webhook’unu dinleyerek sipariş notlarında `convertToGiftCard=true` varsa ödenen tutarı tanımlı **hediye kartı kupürlerine** bölüp Shopify **Admin API** üzerinden **gift card** oluşturur.

---

## ✨ Özellikler
- 🔐 HMAC (X-Shopify-Hmac-Sha256) ile webhook doğrulama  
- 💳 Otomatik gift card oluşturma (greedy kupür bölme)  
- 🧾 Müşteri ile ilişkilendirme (`customer_id`)  
- 🪵 Ayrıntılı loglar  

---

## 📦 Kurulum

```bash
git clone https://github.com/NilDeniz-Alsan/Shopify-Payment-Gateway.git
cd Shopify-Payment-Gateway
npm install
```

`.env` dosyası (örnek):

```env
PORT=3000
SHOPIFY_API_SECRET=shpss_************
SHOPIFY_ADMIN_API_TOKEN=shpat_************
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

> ⚠️ `.env` ve `node_modules/` repoya gönderilmez (`.gitignore` dosyasında listelenmeli).

---

## ▶️ Çalıştırma

```bash
npm start
# çıktıda: "🚀 Sunucu 3000 portunda çalışıyor"
```

---

## 🛒 Shopify Ayarları

### Webhook
- Topic: `orders/paid`  
- URL: `https://<host>/webhooks/orders/paid`  
- Format: **JSON**  
- Secret: App Signing Secret  

### Admin API
- Gift cards için **read/write** izni  
- Access token `.env` içine eklenir  

---

## 📡 Endpoint

`POST /webhooks/orders/paid`  
- HMAC doğrulaması yapılır  
- `note_attributes` içinde `convertToGiftCard=true` ise tutar kupürlere bölünür ve gift cardlar oluşturulur  

---

## 🧮 Kupür Mantığı (örnek)

Kod büyükten küçüğe doğru şu kupürleri dener:  

```
100, 50, 20, 10, 5, 1, 0.50, 0.10, 0.05, 0.01
```

Her başarılı oluşturma sonrası kalan tutar 2 ondalığa yuvarlanır.  

---

## 📝 Lisans
MIT
