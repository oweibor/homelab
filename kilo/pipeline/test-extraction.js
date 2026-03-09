'use strict';

const { extractProductsNode } = require('./src/services/scraper/langgraph/state');
const logger = require('./src/services/logger');

async function testExtraction() {
    const mockState = {
        extraction_type: 'product',
        current_url: 'https://example.com/product/123',
        products: [],
        extracted_count: 0,
        last_fetch_result: {
            html: `
                <html>
                <head>
                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org/",
                        "@type": "Product",
                        "name": "Super Variable T-Shirt",
                        "description": "A great shirt with many sizes.",
                        "sku": "SHIRT-001",
                        "brand": {
                            "@type": "Brand",
                            "name": "Homelab Styles"
                        },
                        "offers": [
                            {
                                "@type": "Offer",
                                "price": "19.99",
                                "priceCurrency": "USD",
                                "availability": "https://schema.org/InStock",
                                "sku": "SHIRT-RED-S"
                            },
                            {
                                "@type": "Offer",
                                "price": "21.99",
                                "priceCurrency": "USD",
                                "availability": "https://schema.org/InStock",
                                "sku": "SHIRT-BLUE-L"
                            }
                        ]
                    }
                    </script>
                </head>
                <body>
                    <h1>Product Page</h1>
                    <a href="/products/other-item">Other Item</a>
                </body>
                </html>
            `,
            links: [
                { text: 'Other Item', href: 'https://example.com/products/other-item' }
            ]
        }
    };

    const mockContext = {
        logger: {
            debug: (msg, data) => console.log('DEBUG:', msg, data),
            info: (msg, data) => console.log('INFO:', msg, data),
            warn: (msg, data) => console.log('WARN:', msg, data),
            error: (msg, data) => console.error('ERROR:', msg, data)
        }
    };

    console.log('--- Starting Test ---');
    const newState = await extractProductsNode(mockState, mockContext);

    console.log('--- Results ---');
    console.log('Total Products:', newState.products.length);
    console.log('Products:', JSON.stringify(newState.products, null, 2));

    const jsonLdProduct = newState.products.find(p => p.source === 'json-ld');
    if (jsonLdProduct && jsonLdProduct.variants.length === 2) {
        console.log('✅ SUCCESS: JSON-LD variable product extracted with 2 variants.');
    } else {
        console.log('❌ FAILURE: JSON-LD extraction failed or no variants found.');
    }

    if (newState.products.some(p => p.source === 'link')) {
        console.log('✅ SUCCESS: Fallback link extraction worked.');
    } else {
        console.log('❌ FAILURE: Fallback link extraction failed.');
    }
}

testExtraction().catch(err => {
    console.error('Test crashed:', err);
    process.exit(1);
});
