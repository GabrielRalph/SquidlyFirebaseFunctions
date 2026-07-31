const { refPath } = require("../../Shared/shared.js");


const STRIPE_API_KEY_LIVE = process.env[`STRIPE_API_KEY_LIVE`]
const STRIPE_API_KEY_TEST= process.env[`STRIPE_API_KEY_TEST`]
function getStripe(STRIPE_API_KEY = STRIPE_API_KEY_LIVE) {
    const stripe = require("stripe")(STRIPE_API_KEY);
    return stripe;
}

function formatPrice({lookup_key, unit_amount, id, currency, recurring, nickname}) {
    return {
        id: id,
        amount: unit_amount/100,
        currency: currency,
        name: nickname || "unknown",
        interval: recurring ? recurring.interval : null,
        lookup_key
    };
}

function formatProduct({prices, id, name, unit_label, marketing_features, metadata: { attributes, userGuide, tierID, public, keyName, trialPeriod, forceTrial}, description}) {
    prices = prices.map(formatPrice);
    prices.sort((a, b) => a.amount - b.amount);
    tierID = typeof tierID === "string" ? parseInt(tierID) : 0;
    userGuide = typeof userGuide === "string" ? userGuide : null;
    attributes = typeof attributes === "string" ? attributes.split(",") : null;
    trialPeriod = typeof trialPeriod === "string" ? parseInt(trialPeriod) : null;
    forceTrial = typeof forceTrial === "string" && forceTrial === "true";
    return [
        id, {
            id: id,
            userGuide,
            displayName: name,
            tierID,
            name: keyName,
            trialPeriod,
            description: description || "",
            public: public === "true",
            features: marketing_features.map(f => f.name),
            unit: unit_label || "items",
            prices,
            forceTrial,
            attributes: attributes ? attributes.map(a => a.trim()) : null,
        }
    ]
}

async function getPricesForProduct(productId, stripe) {
  const prices = await stripe.prices.list({
    product: productId,
    limit: 100, // Optional: default is 10
  });

  return prices.data;
}

async function getAllProducts(stripe) {
  let products = [];
  let hasMore = true;
  let startingAfter = null;
  while (hasMore) {
    const response = await stripe.products.list({
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    });

    let resProducts = response.data
    await Promise.all(resProducts.map(async p => {
        p.prices = await getPricesForProduct(p.id, stripe);
    }));

    products = products.concat(resProducts);

    hasMore = response.has_more;
    if (hasMore) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }

  return products;
}

async function getPriceByLookupKey(lookupKey, stripe) {
    let price = null;
    const prices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        limit: 1,
    });
    if (prices.data.length > 0) {
        price = prices.data[0];
    }

    return price;
}

async function syncStripeProducts() {
    const stripeLive = getStripe();
    const stripeTest = getStripe(STRIPE_API_KEY_TEST);
    let productsList = await getAllProducts(stripeLive);
    let products = {};
    await Promise.all(productsList.map(async product => {
        let [id, productData] = formatProduct(product);
        if (!Number.isNaN(productData.tierID)) {
            await Promise.all(productData.prices.map(async (price) => {
                let testPrice = await getPriceByLookupKey(price.lookup_key, stripeTest);
                if (testPrice) {
                    price.testID = testPrice.id;
                }
            }));
            products[id] = productData;
        }
    }));

    let priceToTier = {};
    for (let productID in products) {
        let product = products[productID];
        product.prices.forEach((price, priceIndex) => {
            let {tierID} = product;
            priceToTier[price.id] = {tierID,productID,isTest: false, priceIndex};
            if (price.testID) {
                priceToTier[price.testID] = {tierID,productID,isTest: true, priceIndex};
            }
        });
    }
    await Promise.all([
        refPath("licences-settings", ["price-to-tier"]).set(priceToTier),
        refPath("licences-settings", ["tier-info"]).set(products)
    ]);
}

module.exports = {
    syncStripeProducts,
};