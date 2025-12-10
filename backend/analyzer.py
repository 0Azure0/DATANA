"""
Analyzer for DATANA: maps required sales columns, cleans numbers, and
computes revenue when missing.
Expected headers (case-insensitive):
  Name, Quantity Sold, Price, Profit, Brand, Category
Optional: Revenue, Date
"""
import re
import pandas as pd
import numpy as np

REQUIRED_MAP = {
    "product": ["name", "product", "product name", "tên", "sản phẩm", "item", "sku"],
    "quantity": ["quantity sold", "quantity", "qty", "units", "số lượng", "sl", "orders", "quantity_sold"],
    "price": ["price", "unit price", "unit_price", "giá", "đơn giá", "cost"],
    "profit": ["profit", "margin", "lợi nhuận", "lợi_nhuận", "lãi"],
    "brand": ["brand", "hãng", "thương hiệu", "thương_hiệu", "brand name"],
    "category": ["category", "ngành hàng", "danh mục", "danh_mục", "segment", "type"],
    "revenue": ["revenue", "sales", "amount", "doanh thu", "doanh_thu", "total"],
    "date": ["date", "ngày", "day", "month", "time", "order date", "order_date", "ngày_bán"]
}


def _norm(txt: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(txt).strip().lower())


def clean_number(val) -> float:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return 0.0
    s = str(val).strip()
    s = re.sub(r"[^\d,.\-]", "", s)
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        if s.count(",") > 1 or len(s.split(",")[-1]) == 3:
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0


def map_columns(df: pd.DataFrame):
    """
    Fuzzy match DataFrame columns to required fields.
    Handles case variations, underscores, spaces, and Vietnamese characters.
    """
    col_map = {}
    normalized = {_norm(c): c for c in df.columns}
    
    for target, keys in REQUIRED_MAP.items():
        found = False
        
        # First pass: exact normalized match
        for raw, original in normalized.items():
            for key in keys:
                if raw == _norm(key):
                    col_map[target] = original
                    found = True
                    break
            if found:
                break
        
        # Second pass: partial/substring match
        if not found:
            for raw, original in normalized.items():
                for key in keys:
                    norm_key = _norm(key)
                    if norm_key in raw or raw in norm_key:
                        col_map[target] = original
                        found = True
                        break
                if found:
                    break
    
    return col_map


def analyze_data(df: pd.DataFrame):
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    col_map = map_columns(df)

    universal = []
    revenue_by_month = {}
    product_metrics = {}

    for _, row in df.iterrows():
        name = str(row.get(col_map.get("product"), "Unknown")).strip()
        brand = str(row.get(col_map.get("brand"), "Other")).strip()
        cat = str(row.get(col_map.get("category"), "General")).strip()
        date_val = row.get(col_map.get("date")) if col_map.get("date") else None

        qty = clean_number(row.get(col_map.get("quantity"), 0))
        price = clean_number(row.get(col_map.get("price"), 0))
        revenue = clean_number(row.get(col_map.get("revenue"), 0))
        profit = clean_number(row.get(col_map.get("profit"), 0))

        if revenue == 0 and price and qty:
            revenue = price * qty
        if price == 0 and revenue and qty:
            price = revenue / qty if qty else 0

        if revenue == 0 and qty == 0 and price == 0 and profit == 0 and name == "Unknown":
            continue

        item = {
            "product": name or "Unknown",
            "brand": brand or "Other",
            "category": cat or "General",
            "date": str(date_val) if date_val is not None else "N/A",
            "quantity": float(qty or 0),
            "price": float(price or 0),
            "revenue": float(revenue or 0),
            "profit": float(profit or 0),
        }
        universal.append(item)

        pm = product_metrics.setdefault(name, {"revenue": 0, "profit": 0, "quantity": 0, "margin": 0})
        pm["revenue"] += item["revenue"]
        pm["profit"] += item["profit"]
        pm["quantity"] += item["quantity"]

        if date_val not in [None, "", "N/A"]:
            parsed = pd.to_datetime(date_val, errors="coerce")
            if pd.notna(parsed):
                mk = parsed.strftime("%Y-%m")
                revenue_by_month[mk] = revenue_by_month.get(mk, 0) + item["revenue"]

    for m in product_metrics.values():
        if m["revenue"] > 0:
            m["margin"] = (m["profit"] / m["revenue"]) * 100  # Margin as percentage
        else:
            m["margin"] = 0

    stats = {
        "total_revenue": sum(x["revenue"] for x in universal),
        "total_profit": sum(x["profit"] for x in universal),
        "total_quantity": sum(x["quantity"] for x in universal),
        "row_count": len(universal),
        "average_margin": (sum(x["profit"] for x in universal) / sum(x["revenue"] for x in universal) * 100) if sum(x["revenue"] for x in universal) > 0 else 0,
    }

    top_products = sorted(
        [{"name": n, "revenue": m["revenue"], "profit": m["profit"], "margin": m.get("margin", 0)} for n, m in product_metrics.items()],
        key=lambda x: x["revenue"],
        reverse=True
    )[:10]

    smart_sum = {
        "top_products": {p["name"]: p["revenue"] for p in top_products[:5]},
        "detected_columns": col_map,
    }

    time_analysis = {"revenue_by_month": revenue_by_month}
    region_analysis = {}
    product_analysis = {"top_products": top_products}
    customer_analysis = {}
    columns = list(col_map.values())

    return (
        stats,
        time_analysis,
        product_analysis,
        region_analysis,
        customer_analysis,
        top_products,
        revenue_by_month,
        product_metrics,
        universal,
        columns,
        smart_sum,
    )