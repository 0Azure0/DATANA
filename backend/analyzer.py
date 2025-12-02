import pandas as pd
import numpy as np
import re

def clean_currency_text(val):
    if isinstance(val, (int, float)): return float(val)
    s = str(val).lower().strip()
    if not s or s == 'nan': return 0.0
    multiplier = 1
    if 'k' in s or 'nghìn' in s: multiplier = 1000
    elif 'tr' in s or 'triệu' in s or 'm' in s: multiplier = 1000000
    elif 'tỷ' in s or 'b' in s: multiplier = 1000000000
    clean_str = re.sub(r'[^\d.,]', '', s)
    if not clean_str: return 0.0
    try:
        if ',' in clean_str and '.' in clean_str: clean_str = clean_str.replace(',', '') 
        elif ',' in clean_str: clean_str = clean_str.replace(',', '.') 
        elif '.' in clean_str: 
            parts = clean_str.split('.')
            if len(parts) > 1 and len(parts[-1]) == 3 and len(parts) > 2: clean_str = clean_str.replace('.', '') 
        return float(clean_str) * multiplier
    except: return 0.0

def smart_preprocess(df):
    keywords = ['ngày', 'date', 'sản phẩm', 'product', 'doanh thu', 'revenue', 'số lượng', 'quantity', 'khu vực', 'region']
    best_header_idx = 0
    max_matches = 0
    current_cols = [str(c).lower() for c in df.columns]
    
    if sum(1 for c in current_cols if any(k in c for k in keywords)) < 2:
        for idx, row in df.head(10).iterrows():
            row_str = " ".join([str(val).lower() for val in row.values])
            matches = sum(1 for k in keywords if k in row_str)
            if matches > max_matches:
                max_matches = matches
                best_header_idx = idx + 1 
        if best_header_idx > 0:
            new_header = df.iloc[best_header_idx - 1]
            df = df[best_header_idx:]
            df.columns = new_header
            df.reset_index(drop=True, inplace=True)

    df = df.dropna(how='all', axis=0).dropna(how='all', axis=1)
    for col in df.columns:
        try: pd.to_numeric(df[col].dropna().iloc[:10])
        except: df[col] = df[col].ffill()
    return df

def find_column(cols, keywords):
    for col in cols:
        if any(k in str(col).lower() for k in keywords): return col
    return None

def parse_date_series(series):
    try: return pd.to_datetime(series, errors='coerce')
    except Exception: return pd.to_datetime(series.astype(str), errors='coerce')

def analyze_data(df):
    # 1. Dọn dẹp & Nhận diện
    df = smart_preprocess(df)
    original_cols = list(df.columns)
    df = df.rename(columns={c: str(c).strip() for c in original_cols})
    cols = list(df.columns)

    # Tìm cột cốt lõi
    date_col = find_column(cols, ['date', 'ngay', 'thời gian', 'năm', 'tháng'])
    product_col = find_column(cols, ['product', 'sản phẩm', 'tên hàng', 'mặt hàng', 'item', 'mã'])
    quantity_col = find_column(cols, ['quantity', 'số lượng', 'sl', 'qty', 'vol'])
    revenue_col = find_column(cols, ['revenue', 'doanh', 'sales', 'tien', 'amount', 'giá', 'trị giá'])
    cogs_col = find_column(cols, ['cogs', 'cost', 'gia_von', 'vốn'])
    profit_col = find_column(cols, ['profit', 'loinhuan', 'lợi nhuận', 'lãi'])
    region_col = find_column(cols, ['region', 'khu vực', 'tỉnh', 'thành phố', 'chi nhánh'])
    
    # 2. Làm sạch số liệu
    if revenue_col: df[revenue_col] = df[revenue_col].apply(clean_currency_text).fillna(0)
    if cogs_col: df[cogs_col] = df[cogs_col].apply(clean_currency_text).fillna(0)
    if profit_col: df[profit_col] = df[profit_col].apply(clean_currency_text).fillna(0)
    if quantity_col: df[quantity_col] = pd.to_numeric(df[quantity_col], errors='coerce').fillna(0)

    # Xử lý ngày tháng
    if date_col:
        df[date_col] = parse_date_series(df[date_col])
        df['year_month'] = df[date_col].dt.to_period('M').astype(str)
    else:
        df['year_month'] = 'N/A'

    if not profit_col and revenue_col and cogs_col:
        df['profit_computed'] = df[revenue_col] - df[cogs_col]
        profit_col = 'profit_computed'
    elif not profit_col:
        df['profit_computed'] = 0
        profit_col = 'profit_computed'

    # 3. TẠO UNIVERSAL DATA (FULL CONTEXT)
    universal_data = []
    export_df = df.head(5000).copy()
    
    for col in export_df.columns:
        if pd.api.types.is_datetime64_any_dtype(export_df[col]):
            export_df[col] = export_df[col].dt.strftime('%Y-%m-%d')

    for _, row in export_df.iterrows():
        record = row.to_dict()
        record['date'] = str(row[date_col]) if date_col and pd.notnull(row[date_col]) else ''
        record['month'] = str(row['year_month'])
        record['region'] = str(row[region_col]) if region_col and pd.notnull(row[region_col]) else 'Khác'
        record['product'] = str(row[product_col]) if product_col and pd.notnull(row[product_col]) else 'Unknown'
        
        record['revenue'] = float(row[revenue_col]) if revenue_col else 0
        record['profit'] = float(row[profit_col]) if profit_col else 0
        record['quantity'] = float(row[quantity_col]) if quantity_col else 0
        
        clean_record = {k: ("" if pd.isna(v) else v) for k,v in record.items()}
        universal_data.append(clean_record)

    # 4. TÍNH TOÁN KPI CƠ BẢN
    statistics = {
        'total_revenue': float(df[revenue_col].sum()) if revenue_col else 0,
        'total_profit': float(df[profit_col].sum()) if profit_col else 0,
        'total_quantity': int(df[quantity_col].sum()) if quantity_col else 0
    }

    # Top Products
    top_products = []
    if product_col and revenue_col:
        grp = df.groupby(product_col)[revenue_col].sum().nlargest(5)
        for p, v in grp.items():
            top_products.append({'name': str(p), 'revenue': float(v)})

    # --- 5. TẠO SMART SUMMARY (Đây là cái thứ 11 mà app.py đang chờ) ---
    smart_summary = {}
    if revenue_col:
        exclude = [date_col, product_col, quantity_col, revenue_col, cogs_col, profit_col, region_col, 'year_month', 'profit_computed']
        potential_cats = [c for c in df.columns if c not in exclude and df[c].dtype == 'object']
        
        for col in potential_cats:
            if df[col].nunique() < 50:
                summary = df.groupby(col)[revenue_col].sum().nlargest(5).to_dict()
                smart_summary[col] = {str(k): float(v) for k,v in summary.items()}

    # Trả về 11 giá trị (smart_summary nằm cuối)
    return (statistics, {}, {}, {}, {}, top_products, {}, {}, universal_data, list(df.columns), smart_summary)