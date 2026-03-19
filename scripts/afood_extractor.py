#!/usr/bin/env python3
"""
A-Food Market Product Extractor (v2 — Fast)
=============================================
Uses THREE complementary endpoints for maximum speed and completeness:

1. WP REST API (`/wp-json/wp/v2/product`) → catalog listing with pagination (no prices)
2. Flatsome AJAX search → JSON with prices, names, URLs, images (up to 100 results/query)
3. Category pages → server-rendered HTML with prices (30 products/page, for bulk)

The fastest approach for recipe use:
  → Use the Flatsome AJAX endpoint to search by ingredient name
  → Returns ID, name, URL, image, and price in a single request

Usage:
    python3 afood_extractor.py search "soy sauce"         # Fast search with prices
    python3 afood_extractor.py search "coconut milk"       # Fast search with prices
    python3 afood_extractor.py catalog --output all.json   # Full catalog dump
    python3 afood_extractor.py categories                  # Show category tree
"""

import json
import re
import sys
import time
import html
import argparse
import urllib.request
import urllib.parse

BASE_URL = "https://afoodmarket.no"
API_URL = f"{BASE_URL}/wp-json/wp/v2"
AJAX_URL = f"{BASE_URL}/wp-admin/admin-ajax.php"
PER_PAGE = 100
DELAY = 0.3


def fetch_json(url: str, method: str = "GET", data: bytes = None, headers: dict = None) -> dict | list:
    """Fetch JSON from a URL."""
    hdrs = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs, method=method, data=data)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def parse_price_html(price_html: str) -> float | None:
    """Parse a WooCommerce price HTML string into a float.
    
    Examples of input:
      '<span class="woocommerce-Price-amount amount"><bdi>29,90&nbsp;
       <span class="woocommerce-Price-currencySymbol">&#107;&#114;</span></bdi></span>'
    """
    if not price_html:
        return None
    # Decode HTML entities first
    decoded = html.unescape(price_html)
    # Extract the number (format: "29,90" or "1 049,90")
    match = re.search(r'(\d[\d\s]*,\d{2})', decoded)
    if match:
        price_str = match.group(1).replace(' ', '').replace(',', '.')
        return float(price_str)
    # Try integer price
    match = re.search(r'(\d[\d\s]+)', decoded)
    if match:
        return float(match.group(1).replace(' ', ''))
    return None


# ─── FAST SEARCH (Flatsome AJAX) ─────────────────────────────────────────────

def ajax_search(query: str) -> list[dict]:
    """
    Search A-Food Market using the Flatsome AJAX endpoint.
    Returns JSON with id, name, url, image, and price.
    Up to ~100 results per query. FAST — single HTTP request.
    """
    post_data = urllib.parse.urlencode({
        "action": "flatsome_ajax_search_products",
        "query": query,
    }).encode()
    
    data = fetch_json(
        AJAX_URL,
        method="POST",
        data=post_data,
        headers={
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded",
        }
    )
    
    results = []
    for s in data.get("suggestions", []):
        if s.get("type") != "Product":
            continue
        results.append({
            "id": s["id"],
            "name": s["value"],
            "url": s["url"],
            "image": s.get("img", ""),
            "price": parse_price_html(s.get("price", "")),
            "price_html": s.get("price", ""),
        })
    return results


# ─── FULL CATALOG (WP REST API) ──────────────────────────────────────────────

def fetch_categories() -> dict[int, dict]:
    """Fetch all product categories."""
    categories = {}
    page = 1
    while True:
        url = f"{API_URL}/product_cat?per_page=100&page={page}"
        data = fetch_json(url)
        if not data:
            break
        for cat in data:
            categories[cat["id"]] = {
                "name": cat["name"],
                "parent": cat.get("parent", 0),
                "slug": cat.get("slug", ""),
                "count": cat.get("count", 0),
            }
        if len(data) < 100:
            break
        page += 1
        time.sleep(DELAY)
    return categories


def fetch_catalog(categories: dict) -> list[dict]:
    """Fetch entire product catalog via WP REST API (no prices)."""
    req = urllib.request.Request(
        f"{API_URL}/product?per_page={PER_PAGE}",
        headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req) as resp:
        total_pages = int(resp.headers.get("X-WP-TotalPages", 0))
        total = int(resp.headers.get("X-WP-Total", 0))
    
    print(f"📊 Total products: {total} across {total_pages} pages")
    products = []
    
    for page in range(1, total_pages + 1):
        url = f"{API_URL}/product?per_page={PER_PAGE}&page={page}"
        print(f"   Fetching page {page}/{total_pages}...")
        data = fetch_json(url)
        
        for p in data:
            cat_ids = p.get("product_cat", [])
            cat_names = [categories[c]["name"] for c in cat_ids if c in categories]
            
            class_list = p.get("class_list", {})
            classes = list(class_list.values()) if isinstance(class_list, dict) else class_list
            
            products.append({
                "id": p["id"],
                "name": p["title"]["rendered"],
                "slug": p["slug"],
                "url": p["link"],
                "category_ids": cat_ids,
                "category_names": cat_names,
                "featured_media_id": p.get("featured_media", 0),
                "in_stock": "instock" in classes,
            })
        time.sleep(DELAY)
    
    return products


def enrich_with_prices(products: list[dict]) -> list[dict]:
    """
    Enrich catalog products with prices by using the AJAX search endpoint.
    Groups products and searches by name fragments to fetch prices in bulk.
    """
    # Build a lookup by product ID
    by_id = {p["id"]: p for p in products}
    enriched = 0
    
    # Strategy: search by first word of each unique first-word to batch
    first_words = set()
    for p in products:
        words = re.sub(r'[^\w\s]', '', html.unescape(p["name"])).split()
        if words:
            first_words.add(words[0].lower())
    
    print(f"\n💰 Enriching prices using {len(first_words)} search batches...")
    
    for i, word in enumerate(sorted(first_words)):
        if len(word) < 2:
            continue
        results = ajax_search(word)
        for r in results:
            if r["id"] in by_id and "price" not in by_id[r["id"]]:
                by_id[r["id"]]["price"] = r["price"]
                by_id[r["id"]]["image"] = r.get("image", "")
                enriched += 1
        
        if (i + 1) % 20 == 0:
            print(f"   Processed {i+1}/{len(first_words)} batches, {enriched} prices found...")
        time.sleep(DELAY)
    
    print(f"   ✅ Enriched {enriched}/{len(products)} products with prices")
    return products


# ─── COMMANDS ─────────────────────────────────────────────────────────────────

def cmd_search(args):
    """Fast search with prices via AJAX."""
    results = ajax_search(args.query)
    
    print(f"🔍 Search: \"{args.query}\"")
    print(f"📊 Found: {len(results)} products\n")
    
    for r in results:
        price_str = f"{r['price']:.2f} kr" if r['price'] else "N/A"
        img = "🖼️ " if r["image"] else "   "
        print(f"  {img} {r['name']}")
        print(f"     💰 {price_str} | ID: {r['id']}")
        print(f"     🔗 {r['url']}")
        if r["image"]:
            print(f"     📷 {r['image']}")
        print()
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"💾 Saved to {args.output}")


def cmd_catalog(args):
    """Full catalog dump."""
    print("📦 Fetching categories...")
    categories = fetch_categories()
    print(f"   Found {len(categories)} categories")
    
    products = fetch_catalog(categories)
    
    if args.with_prices:
        products = enrich_with_prices(products)
    
    output = args.output or "afood_catalog.json"
    with open(output, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    
    priced = sum(1 for p in products if "price" in p)
    print(f"\n✅ Exported {len(products)} products → {output}")
    if priced:
        prices = [p["price"] for p in products if p.get("price")]
        print(f"   With prices: {priced}, range: {min(prices):.2f} – {max(prices):.2f} kr")


def cmd_categories(args):
    """Display category tree."""
    categories = fetch_categories()
    top_level = {k: v for k, v in categories.items() if v["parent"] == 0}
    for cat_id, cat in sorted(top_level.items(), key=lambda x: x[1]["name"]):
        print(f"\n📁 {cat['name']} (ID={cat_id}, {cat['count']} products)")
        children = {k: v for k, v in categories.items() if v["parent"] == cat_id}
        for cid, child in sorted(children.items(), key=lambda x: x[1]["name"]):
            print(f"   └── {child['name']} (ID={cid}, {child['count']} products)")


def main():
    parser = argparse.ArgumentParser(description="A-Food Market Product Extractor")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Search (fast, with prices)
    sp = subparsers.add_parser("search", help="Fast search with prices")
    sp.add_argument("query", type=str)
    sp.add_argument("--output", type=str)
    sp.set_defaults(func=cmd_search)
    
    # Full catalog  
    sp = subparsers.add_parser("catalog", help="Export full product catalog")
    sp.add_argument("--output", type=str, default="afood_catalog.json")
    sp.add_argument("--with-prices", action="store_true")
    sp.set_defaults(func=cmd_catalog)
    
    # Categories
    sp = subparsers.add_parser("categories", help="Show category tree")
    sp.set_defaults(func=cmd_categories)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
