#!/usr/bin/env python3
"""
Meny Product Search & Cart Builder
====================================
Searches the Meny (NorgesGruppen) API for products and builds shopping carts.

Usage:
    python3 meny_extractor.py search "soyasaus"              # Search products
    python3 meny_extractor.py search "kokosmelk" --store 7080001150488
    python3 meny_extractor.py ingredients "soyasaus,kokosmelk,ris,lime"
    python3 meny_extractor.py stores                          # List all stores
    python3 meny_extractor.py categories                      # List categories
"""

import json
import sys
import argparse
import urllib.request
import urllib.parse

API_BASE = "https://platform-rest-prod.ngdata.no"
FRONTEND_API = "https://meny.no/api"
CHAIN_ID = "1300"
DEFAULT_STORE = "7080001150488"  # MENY Bryn

IMAGE_BASE = "https://bilder.ngdata.no"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "fwc-chain-id": CHAIN_ID,
    "Content-Type": "application/json",
    "Origin": "https://meny.no",
    "Referer": "https://meny.no/",
}


def fetch_json(url: str, method: str = "GET", data: bytes = None) -> dict | list:
    """Fetch JSON from a URL with Meny headers."""
    req = urllib.request.Request(url, headers=HEADERS, method=method, data=data)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def get_image_url(ean: str) -> str:
    """Build the product image URL from its EAN."""
    return f"{IMAGE_BASE}/{ean}/meny/large.jpg"


def search_products(query: str, store_id: str = DEFAULT_STORE, page_size: int = 20) -> dict:
    """Search for products at a specific Meny store."""
    params = urllib.parse.urlencode({
        "search": query,
        "page_size": page_size,
        "store_id": store_id,
        "full_response": "true",
    })
    url = f"{API_BASE}/api/episearch/{CHAIN_ID}/products?{params}"
    return fetch_json(url)


def list_stores() -> list:
    """List all available Meny stores."""
    url = f"{API_BASE}/api/handoveroptions/{CHAIN_ID}"
    data = fetch_json(url)
    stores = []
    for option in data:
        if option.get("handoverType") == "BUTIKK":
            for loc in option.get("locations", []):
                store = loc.get("store", {})
                stores.append({
                    "gln": store.get("gln"),
                    "name": store.get("name", ""),
                    "address": store.get("address", ""),
                    "city": store.get("city", ""),
                    "county": store.get("county", ""),
                })
    return stores


def list_categories() -> list:
    """List all product categories."""
    url = f"{FRONTEND_API}/categories"
    return fetch_json(url)


def parse_product(hit: dict) -> dict:
    """Parse a search hit into a clean product dict."""
    source = hit.get("contentData", {}).get("_source", {})
    return {
        "ean": source.get("ean", ""),
        "title": source.get("title", ""),
        "subtitle": source.get("subtitle", ""),
        "brand": source.get("brand", ""),
        "price": source.get("pricePerUnit"),
        "compare_price": source.get("comparePricePerUnit"),
        "compare_unit": source.get("compareUnit", ""),
        "unit": source.get("unit", ""),
        "weight_kg": source.get("weight"),
        "category": source.get("categoryName", ""),
        "shopping_list_group": source.get("shoppingListGroupName", ""),
        "in_stock": not source.get("isOutOfStock", True),
        "is_offer": source.get("isOffer", False),
        "image_url": get_image_url(source.get("ean", "")),
        "product_url": f"https://meny.no/varer{source.get('slugifiedUrl', '')}",
        "vendor": source.get("vendor", ""),
    }


def build_cart_payload(products: list[dict]) -> list[dict]:
    """Build a Meny cart payload from a list of parsed products."""
    return [
        {
            "id": p["ean"],
            "ean": p["ean"],
            "quantity": p.get("quantity", 1),
            "__type__": "CART_PRODUCT",
        }
        for p in products
    ]


def find_best_match_for_ingredient(ingredient: str, store_id: str = DEFAULT_STORE) -> dict | None:
    """Search for an ingredient and return the best (top) match."""
    data = search_products(ingredient, store_id=store_id, page_size=5)
    hits = data.get("hits", {}).get("hits", [])
    if not hits:
        return None
    return parse_product(hits[0])


def cmd_search(args):
    """Handle the search command."""
    data = search_products(args.query, store_id=args.store, page_size=args.limit)
    total = data.get("hits", {}).get("total", 0)
    hits = data.get("hits", {}).get("hits", [])
    
    print(f"🔍 Search: \"{args.query}\" at store {args.store}")
    print(f"📊 Total results: {total}, showing top {len(hits)}\n")
    
    products = []
    for h in hits:
        p = parse_product(h)
        products.append(p)
        stock = "✅" if p["in_stock"] else "❌"
        offer = " 🏷️ TILBUD" if p["is_offer"] else ""
        print(f"  {stock} {p['title']} — {p['subtitle']}")
        print(f"     💰 {p['price']} kr | EAN: {p['ean']} | {p['brand']}{offer}")
        print(f"     📁 {p['category']} > {p['shopping_list_group']}")
        print(f"     🖼️  {p['image_url']}")
        print()
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(products, f, ensure_ascii=False, indent=2)
        print(f"💾 Saved to {args.output}")


def cmd_ingredients(args):
    """Handle the ingredients command - find best match for each ingredient."""
    ingredients = [i.strip() for i in args.ingredients.split(",")]
    
    print(f"🍳 Finding products for {len(ingredients)} ingredients...\n")
    
    found = []
    not_found = []
    
    for ing in ingredients:
        product = find_best_match_for_ingredient(ing, store_id=args.store)
        if product:
            product["searched_ingredient"] = ing
            product["quantity"] = 1
            found.append(product)
            stock = "✅" if product["in_stock"] else "❌"
            print(f"  {stock} {ing} → {product['title']} ({product['subtitle']}) — {product['price']} kr")
        else:
            not_found.append(ing)
            print(f"  ❌ {ing} → NOT FOUND")
    
    total_price = sum(p["price"] for p in found if p.get("price"))
    
    print(f"\n{'='*60}")
    print(f"📊 Found: {len(found)}/{len(ingredients)}")
    print(f"💰 Estimated total: {total_price:.2f} kr")
    
    if not_found:
        print(f"⚠️  Missing: {', '.join(not_found)}")
    
    # Build cart
    cart = build_cart_payload(found)
    print(f"\n🛒 Cart payload ({len(cart)} items):")
    print(json.dumps(cart, indent=2, ensure_ascii=False))
    
    if args.output:
        output = {
            "ingredients": ingredients,
            "products": found,
            "not_found": not_found,
            "total_price": total_price,
            "cart_payload": cart,
        }
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"\n💾 Saved to {args.output}")


def cmd_stores(args):
    """Handle the stores command."""
    stores = list_stores()
    print(f"🏪 Found {len(stores)} Meny stores:\n")
    for s in stores:
        print(f"  {s['name']} | {s['address']}, {s['city']} ({s['county']}) | GLN: {s['gln']}")


def cmd_categories(args):
    """Handle the categories command."""
    cats = list_categories()
    print(f"📁 {len(cats)} categories:\n")
    for c in cats:
        print(f"  {c['categoryName']} (ID={c['categoryId']})")
        groups = c.get("shoppingListGroups", [])
        for g in groups[:5]:
            print(f"    └── {g.get('name', g.get('shoppingListGroupName', '?'))}")
        if len(groups) > 5:
            print(f"    └── ... and {len(groups)-5} more")


def main():
    parser = argparse.ArgumentParser(description="Meny Product Search & Cart Builder")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Search
    sp_search = subparsers.add_parser("search", help="Search for products")
    sp_search.add_argument("query", type=str, help="Search query")
    sp_search.add_argument("--store", type=str, default=DEFAULT_STORE, help="Store GLN")
    sp_search.add_argument("--limit", type=int, default=10, help="Max results")
    sp_search.add_argument("--output", type=str, help="Save results to JSON file")
    sp_search.set_defaults(func=cmd_search)
    
    # Ingredients
    sp_ing = subparsers.add_parser("ingredients", help="Find products for recipe ingredients")
    sp_ing.add_argument("ingredients", type=str, help="Comma-separated list of ingredients")
    sp_ing.add_argument("--store", type=str, default=DEFAULT_STORE, help="Store GLN")
    sp_ing.add_argument("--output", type=str, help="Save results to JSON file")
    sp_ing.set_defaults(func=cmd_ingredients)
    
    # Stores
    sp_stores = subparsers.add_parser("stores", help="List all Meny stores")
    sp_stores.set_defaults(func=cmd_stores)
    
    # Categories
    sp_cats = subparsers.add_parser("categories", help="List categories")
    sp_cats.set_defaults(func=cmd_categories)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
