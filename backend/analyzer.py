import pandas as pd
import numpy as np


def find_column(cols, keywords):
    for col in cols:
        name = str(col).lower()
        if any(k in name for k in keywords):
            return col
    return None


def parse_date_series(series):
    try:
        return pd.to_datetime(series, errors='coerce')
    except Exception:
        return pd.to_datetime(series.astype(str), errors='coerce')


def analyze_data(df):
    """
    Analyze business data. Returns:
    statistics, revenue_by_region, top_products, revenue_by_month, product_metrics, raw_data, columns
    """
    # Normalize column names but keep original mapping
    original_cols = list(df.columns)
    df = df.rename(columns={c: str(c).strip() for c in original_cols})
    cols = list(df.columns)

    # Detect important columns
    date_col = find_column(cols, ['date', 'ngay'])
    product_col = find_column(cols, ['product_id', 'product id', 'product', 'ma_san_pham', 'ma_sp', 'mã_sp', 'mã', 'ten'])
    quantity_col = find_column(cols, ['quantity', 'so_luong', 'soluong', 'qty', 'số_lượng'])
    revenue_col = find_column(cols, ['revenue', 'doanh', 'sales', 'tien', 'amount'])
    cogs_col = find_column(cols, ['cogs', 'cost', 'gia_von', 'chi_phi'])
    profit_col = find_column(cols, ['profit', 'loinhuan', 'lợi_nhuận', 'loi_nhuan'])
    region_col = find_column(cols, ['region', 'khu_vuc', 'branch', 'chi_nhanh', 'tinh', 'area', 'location'])
    salesperson_col = find_column(cols, ['salesperson', 'nhan_vien', 'seller', 'nhân_viên'])
    category_col = find_column(cols, ['category', 'nhom', 'loai', 'segment'])

    # Clean and coerce numeric columns
    if revenue_col is not None:
        df[revenue_col] = pd.to_numeric(df[revenue_col], errors='coerce').fillna(0)
    if quantity_col is not None:
        df[quantity_col] = pd.to_numeric(df[quantity_col], errors='coerce').fillna(0)
    if cogs_col is not None:
        df[cogs_col] = pd.to_numeric(df[cogs_col], errors='coerce').fillna(0)
    if profit_col is not None:
        df[profit_col] = pd.to_numeric(df[profit_col], errors='coerce')

    # Parse date
    if date_col is not None:
        df[date_col] = parse_date_series(df[date_col])
        df['year_month'] = df[date_col].dt.to_period('M').astype(str)
    else:
        df['year_month'] = 'unknown'

    # If profit missing but revenue and cogs present, compute profit
    if profit_col is None and revenue_col is not None and cogs_col is not None:
        df['profit_computed'] = df[revenue_col] - df[cogs_col]
        profit_col = 'profit_computed'
    elif profit_col is None:
        df['profit_computed'] = 0
        profit_col = 'profit_computed'

    # Basic statistics / General Summary
    statistics = {}
    total_revenue = float(df[revenue_col].sum()) if revenue_col is not None else 0.0
    total_quantity = int(df[quantity_col].sum()) if quantity_col is not None else 0
    total_profit = float(df[profit_col].sum()) if profit_col is not None else 0.0
    avg_margin = (total_profit / total_revenue) if total_revenue else 0.0

    statistics['total_revenue'] = total_revenue
    statistics['total_quantity'] = total_quantity
    statistics['total_profit'] = total_profit
    statistics['average_margin'] = avg_margin
    statistics['row_count'] = int(len(df))
    statistics['column_count'] = int(len(df.columns))

    # Revenue by region
    revenue_by_region = {}
    if region_col is not None and revenue_col is not None:
        rev_reg = df.groupby(region_col)[revenue_col].sum().sort_values(ascending=False)
        revenue_by_region = {str(k): float(v) for k, v in rev_reg.items()}

    # Time-based analysis: by day/month/quarter, monthly growth, trend
    revenue_by_month = {}
    revenue_by_day = {}
    revenue_by_quarter = {}
    monthly_growth = {}
    trend = {}
    if revenue_col is not None:
        rev_month = df.groupby('year_month')[revenue_col].sum().sort_index()
        revenue_by_month = {str(k): float(v) for k, v in rev_month.items()}

        # daily
        if date_col is not None:
            rev_day = df.groupby(date_col)[revenue_col].sum().sort_index()
            revenue_by_day = {str(k): float(v) for k, v in rev_day.items()}

        # quarter
        if date_col is not None:
            df['year_quarter'] = df[date_col].dt.to_period('Q').astype(str)
            rev_q = df.groupby('year_quarter')[revenue_col].sum().sort_index()
            revenue_by_quarter = {str(k): float(v) for k, v in rev_q.items()}

        # monthly growth (%)
        months = list(rev_month.index)
        vals = list(rev_month.values)
        for i in range(1, len(vals)):
            prev = vals[i-1]
            cur = vals[i]
            growth = ((cur - prev) / prev * 100) if prev else None
            monthly_growth[str(months[i])] = float(growth) if growth is not None else None

        # simple trend: linear regression slope on monthly revenue
        try:
            import numpy as _np
            if len(vals) >= 2:
                x = _np.arange(len(vals))
                y = _np.array(vals)
                slope, intercept = _np.polyfit(x, y, 1)
                trend = {'slope': float(slope), 'intercept': float(intercept)}
        except Exception:
            trend = {}

    # Product analysis
    top_products = []
    product_metrics = {}
    product_summary = {}
    if product_col is not None:
        grp = df.groupby(product_col).agg({
            quantity_col: 'sum' if quantity_col is not None else (revenue_col and 'sum'),
            revenue_col: 'sum' if revenue_col is not None else (quantity_col and 'sum'),
            profit_col: 'sum'
        }).fillna(0)

        # Build product metrics dict
        for prod, row in grp.iterrows():
            qty = int(row.get(quantity_col, 0)) if quantity_col is not None else 0
            rev = float(row.get(revenue_col, 0.0)) if revenue_col is not None else 0.0
            prof = float(row.get(profit_col, 0.0)) if profit_col is not None else 0.0
            margin = (prof / rev) if rev else 0
            product_metrics[str(prod)] = {
                'quantity': qty,
                'revenue': rev,
                'profit': prof,
                'margin': margin
            }

        # product summary (top/bottom)
        prod_rev_series = grp[revenue_col].sort_values(ascending=False)
        product_summary['top_5_by_revenue'] = [str(p) for p in prod_rev_series.head(5).index]
        product_summary['bottom_5_by_revenue'] = [str(p) for p in prod_rev_series.tail(5).index]

        # top products list by revenue
        try:
            top_rev = grp[revenue_col].nlargest(5)
        except Exception:
            top_rev = grp[list(grp.columns)[0]].nlargest(5)

        for prod, val in top_rev.items():
            prod_key = str(prod)
            pm = product_metrics.get(prod_key, {})
            top_products.append({
                'name': prod_key,
                'quantity': pm.get('quantity', 0),
                'revenue': float(pm.get('revenue', 0.0)),
                'profit': float(pm.get('profit', 0.0)),
                'margin': float(pm.get('margin', 0.0))
            })

    # Region analysis
    region_analysis = {}
    if region_col is not None and revenue_col is not None:
        region_rev = df.groupby(region_col)[revenue_col].sum().sort_values(ascending=False)
        region_analysis['revenue_by_region'] = {str(k): float(v) for k, v in region_rev.items()}
        # growth per region month-over-month (simple)
        try:
            region_month = df.groupby([region_col, 'year_month'])[revenue_col].sum().unstack(fill_value=0)
            region_growth = {}
            for r in region_month.index:
                s = region_month.loc[r]
                if len(s) >= 2:
                    prev = s.iloc[-2]; cur = s.iloc[-1]
                    region_growth[str(r)] = float(((cur - prev) / prev * 100) if prev else 0)
            region_analysis['region_growth_percent'] = region_growth
        except Exception:
            region_analysis['region_growth_percent'] = {}

    # Customer segmentation
    customer_analysis = {}
    if 'customer_segment' in [c.lower() for c in cols]:
        seg_col = find_column(cols, ['customer_segment', 'segment', 'customer_type'])
        if seg_col is not None and revenue_col is not None:
            seg_grp = df.groupby(seg_col).agg({revenue_col: 'sum', date_col: 'count' if date_col is not None else 'size'})
            cust_summary = {}
            for seg, row in seg_grp.iterrows():
                revenue_seg = float(row[revenue_col])
                freq = int(row[date_col]) if date_col is not None else int(row.iloc[0])
                avg_order = revenue_seg / freq if freq else 0
                cust_summary[str(seg)] = {'revenue': revenue_seg, 'frequency': freq, 'avg_order_value': avg_order}
            customer_analysis = cust_summary

    # Raw data (limit 200 rows)
    raw_data = df.head(200).fillna('').to_dict('records')
    columns = list(df.columns)

    # Product analysis wrapper
    product_analysis = {
        'product_metrics': product_metrics,
        'product_summary': product_summary,
        'top_products': top_products
    }

    time_analysis = {
        'by_day': revenue_by_day,
        'by_month': revenue_by_month,
        'by_quarter': revenue_by_quarter,
        'monthly_growth_percent': monthly_growth,
        'trend': trend
    }

    region_analysis_out = region_analysis

    return statistics, time_analysis, product_analysis, region_analysis_out, customer_analysis, top_products, revenue_by_month, product_metrics, raw_data, columns
