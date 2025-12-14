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
        # Xử lý format VN/Euro: '.' là nghìn, ',' là thập phân
        if ',' in clean_str and '.' in clean_str: 
            clean_str = clean_str.replace('.', '') 
            clean_str = clean_str.replace(',', '.') 
        elif ',' in clean_str: clean_str = clean_str.replace(',', '.') 
        elif '.' in clean_str: 
            parts = clean_str.split('.')
            if len(parts) > 1 and len(parts[-1]) == 3 and len(parts) > 2: clean_str = clean_str.replace('.', '') 
        return float(clean_str) * multiplier
    except: 
        clean_str = re.sub(r'[^\d]', '', s)
        if clean_str: return float(clean_str) * multiplier
        return 0.0

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
        col_lower = str(col).lower().strip()
        if any(k in col_lower for k in keywords): return col
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

    date_col = find_column(cols, ['date', 'ngay', 'thời gian', 'năm', 'tháng'])
    product_col = find_column(cols, ['product', 'sản phẩm', 'tên hàng', 'mặt hàng', 'item', 'mã', 'name', 'tên'])
    quantity_col = find_column(cols, ['quantity', 'số lượng', 'sl', 'qty', 'vol', 'sold'])
    revenue_col = find_column(cols, ['revenue', 'doanh', 'sales', 'tien', 'amount', 'trị giá', 'thành tiền'])
    price_col = find_column(cols, ['price', 'giá'])
    cogs_col = find_column(cols, ['cogs', 'cost', 'gia_von', 'vốn'])
    profit_col = find_column(cols, ['profit', 'loinhuan', 'lợi nhuận', 'lãi'])
    region_col = find_column(cols, ['region', 'khu vực', 'tỉnh', 'thành phố', 'chi nhánh'])
    brand_col = find_column(cols, ['brand', 'thương hiệu', 'nhãn hiệu', 'hãng'])
    category_col = find_column(cols, ['category', 'danh mục', 'phân loại', 'loại', 'nhóm'])
    
    # 2. Làm sạch số liệu
    if revenue_col: df[revenue_col] = df[revenue_col].apply(clean_currency_text).fillna(0)
    if price_col: df[price_col] = df[price_col].apply(clean_currency_text).fillna(0)
    if cogs_col: df[cogs_col] = df[cogs_col].apply(clean_currency_text).fillna(0)
    if profit_col: df[profit_col] = df[profit_col].apply(clean_currency_text).fillna(0)
    if quantity_col: df[quantity_col] = pd.to_numeric(df[quantity_col], errors='coerce').fillna(0)

    # 2.5 FIX LỖI TÍNH DOANH THU THỰC TẾ (Sử dụng logic kinh doanh đúng)
    
    # Nếu không có cột Revenue (đã tính toán) rõ ràng, nhưng có Price và Quantity, tính tích.
    if not revenue_col and price_col and quantity_col:
        df['revenue_computed'] = df[quantity_col] * df[price_col]
        revenue_col = 'revenue_computed'
        cols = list(df.columns)
    elif revenue_col and price_col and quantity_col and str(revenue_col).lower() == 'price':
         # Nếu cột Price bị nhận diện là revenue_col (do từ khóa), tính tích để có doanh thu thực tế
         df['revenue_computed_final'] = df[quantity_col] * df[revenue_col]
         revenue_col = 'revenue_computed_final'
         cols = list(df.columns)


    if date_col:
        df[date_col] = parse_date_series(df[date_col])
        df['year_month'] = df[date_col].dt.to_period('M').astype(str)
    else:
        df['year_month'] = 'N/A'

    if not profit_col and revenue_col and cogs_col:
        df['profit_computed'] = df[revenue_col] - df[cogs_col]
        profit_col = 'profit_computed'

    # 3. TẠO UNIVERSAL DATA (Raw Data)
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
        record['brand'] = str(row[brand_col]) if brand_col and pd.notnull(row[brand_col]) else 'N/A'
        record['category'] = str(row[category_col]) if category_col and pd.notnull(row[category_col]) else 'N/A'
        
        record['revenue'] = float(row[revenue_col]) if revenue_col and revenue_col in row else 0
        record['profit'] = float(row[profit_col]) if profit_col and profit_col in row else 0
        record['quantity'] = float(row[quantity_col]) if quantity_col else 0
        
        clean_record = {k: ("" if pd.isna(v) else v) for k,v in record.items()}
        universal_data.append(clean_record)

    # 4. TÍNH TOÁN KPI
    total_rev = float(df[revenue_col].sum()) if revenue_col and revenue_col in df.columns else 0
    total_prof = float(df[profit_col].sum()) if profit_col and profit_col in df.columns else 0
    total_qty = int(df[quantity_col].sum()) if quantity_col else 0

    statistics = {
        'total_revenue': total_rev,
        'total_profit': total_prof,
        'total_quantity': total_qty
    }

    # Top Products Simple
    top_products_simple = []
    if product_col and revenue_col and revenue_col in df.columns:
        grp = df.groupby(product_col)[revenue_col].sum().nlargest(5)
        for p, v in grp.items():
            top_products_simple.append({'name': str(p), 'revenue': float(v)})

    # --- 5. TẠO SMART SUMMARY (QUAN TRỌNG: ĐỔI TÊN CỘT VỀ CHUẨN) ---
    smart_summary = {}
    
    if revenue_col and brand_col and revenue_col in df.columns:
        brand_analysis = df.groupby(brand_col)[revenue_col].sum().nlargest(5).to_dict()
        smart_summary['brand'] = {str(k): float(v) for k,v in brand_analysis.items()}
        
    if revenue_col and category_col and revenue_col in df.columns:
        category_analysis = df.groupby(category_col)[revenue_col].sum().nlargest(5).to_dict()
        smart_summary['category'] = {str(k): float(v) for k,v in category_analysis.items()}
    
    product_details = []
    if product_col and quantity_col and revenue_col and revenue_col in df.columns:
        agg_dict = {quantity_col: 'sum', revenue_col: 'sum'}
        if profit_col: agg_dict[profit_col] = 'sum'
            
        prod_grp = df.groupby(product_col).agg(agg_dict).reset_index()
        
        # --- FIX: Đổi tên tất cả cột về chuẩn key (revenue, quantity, profit) ---
        rename_map = {
            product_col: 'product',
            revenue_col: 'revenue', 
            quantity_col: 'quantity'
        }
        if profit_col: rename_map[profit_col] = 'profit'
        
        prod_grp = prod_grp.rename(columns=rename_map)
        # -----------------------------------------------------------------------
        
        if brand_col:
            brand_map = df.groupby(product_col)[brand_col].first()
            prod_grp['brand'] = prod_grp['product'].map(brand_map)
        
        if category_col:
            cat_map = df.groupby(product_col)[category_col].first()
            prod_grp['category'] = prod_grp['product'].map(cat_map)
        
        # Sort bằng key chuẩn 'revenue'
        product_details = prod_grp.nlargest(10, 'revenue').to_dict('records')
    
    smart_summary['product_details'] = product_details
    average_margin = (total_prof / total_rev * 100) if total_rev > 0 else 0
    smart_summary['average_margin'] = float(average_margin)
    
    # 6. TẠO CÁC BẢNG (Dùng tên cột chuẩn cho dễ render)
    product_inventory = []
    sales_summary = []
    profit_analysis = []
    category_overview = []
    brand_performance = []

    def safe_rename(dframe, old, new):
        if old in dframe.columns: return dframe.rename(columns={old: new})
        return dframe

    if product_col and revenue_col and quantity_col and revenue_col in df.columns:
        inv = df.groupby(product_col).agg({quantity_col:'sum', revenue_col:'sum'}).reset_index()
        inv = safe_rename(inv, product_col, 'Product')
        # Chuẩn hóa tên cột
        inv = safe_rename(inv, quantity_col, 'Quantity')
        inv = safe_rename(inv, revenue_col, 'Revenue')
        product_inventory = inv.to_dict('records')

        group_keys = [product_col]
        if category_col: group_keys.append(category_col)
        sales = df.groupby(group_keys).agg({quantity_col:'sum', revenue_col:'sum'}).reset_index()
        sales = safe_rename(sales, product_col, 'Product')
        if category_col: sales = safe_rename(sales, category_col, 'Category')
        sales = safe_rename(sales, quantity_col, 'Quantity')
        sales = safe_rename(sales, revenue_col, 'Revenue')
        sales_summary = sales.to_dict('records')

        if profit_col and profit_col in df.columns:
            prof = df.groupby(product_col).agg({revenue_col:'sum', profit_col:'sum'}).reset_index()
            # Đảm bảo cột Revenue đã được đổi tên để tính toán Margin
            prof = prof.rename(columns={revenue_col: 'Revenue'})
            prof['Margin'] = (prof[profit_col]/prof['Revenue']*100).fillna(0).round(1)
            prof = safe_rename(prof, product_col, 'Product')
            prof = safe_rename(prof, profit_col, 'Profit')
            profit_analysis = prof.to_dict('records')

    if category_col and revenue_col and revenue_col in df.columns:
        cat = df.groupby(category_col).agg({revenue_col:'sum', quantity_col:'sum'}).reset_index()
        cat = safe_rename(cat, category_col, 'Category')
        cat = safe_rename(cat, revenue_col, 'Revenue')
        cat = safe_rename(cat, quantity_col, 'Quantity')
        category_overview = cat.to_dict('records')

    if brand_col and revenue_col and revenue_col in df.columns:
        br = df.groupby(brand_col).agg({revenue_col:'sum', quantity_col:'sum'}).reset_index()
        br = safe_rename(br, brand_col, 'Brand')
        br = safe_rename(br, revenue_col, 'Revenue')
        br = safe_rename(br, quantity_col, 'Quantity')
        brand_performance = br.to_dict('records')

    smart_summary['product_inventory_table'] = product_inventory
    smart_summary['sales_summary_table'] = sales_summary
    smart_summary['profit_analysis_table'] = profit_analysis
    smart_summary['category_overview_table'] = category_overview
    smart_summary['brand_performance_table'] = brand_performance

    return (statistics, {}, {}, {}, {}, top_products_simple, {}, {}, universal_data, list(df.columns), smart_summary)