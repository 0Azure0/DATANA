import pandas as pd
import numpy as np
import re
from datetime import datetime

def clean_currency_text(val):
    if isinstance(val, (int, float, np.number)): return float(val)
    s = str(val).lower().strip()
    if not s or s in ['nan', 'none', 'null', '']: return 0.0
    
    multiplier = 1
    if 'ty' in s or 'tỷ' in s or 'b' in s: multiplier = 1_000_000_000
    elif 'tr' in s or 'triệu' in s or 'm' in s: multiplier = 1_000_000
    elif 'k' in s or 'nghìn' in s: multiplier = 1_000
    
    clean_str = re.sub(r'[^\d.,-]', '', s)
    if not clean_str: return 0.0
    
    try:
        if ',' in clean_str and '.' in clean_str:
            if clean_str.rfind(',') > clean_str.rfind('.'): 
                clean_str = clean_str.replace('.', '').replace(',', '.')
            else:
                clean_str = clean_str.replace(',', '')
        elif ',' in clean_str:
            if len(clean_str.split(',')[-1]) == 3 and len(clean_str) > 4:
                clean_str = clean_str.replace(',', '')
            else:
                clean_str = clean_str.replace(',', '.')
        elif '.' in clean_str:
            parts = clean_str.split('.')
            if len(parts[-1]) == 3 and len(parts) > 1:
                clean_str = clean_str.replace('.', '')
        return float(clean_str) * multiplier
    except: return 0.0

def smart_preprocess(df):
    df.columns = [str(c).strip() for c in df.columns]
    keywords = ['ngày', 'date', 'sản phẩm', 'product', 'doanh thu', 'revenue', 'số lượng', 'quantity', 'khu vực', 'region']
    best_header_idx = -1
    max_matches = 0
    
    current_matches = sum(1 for c in df.columns if any(k in str(c).lower() for k in keywords))
    if current_matches >= 2: return df
    
    for idx, row in df.head(10).iterrows():
        row_str = " ".join([str(val).lower() for val in row.values])
        matches = sum(1 for k in keywords if k in row_str)
        if matches > max_matches and matches >= 2:
            max_matches = matches
            best_header_idx = idx
            
    if best_header_idx != -1:
        new_header = df.iloc[best_header_idx]
        df = df[best_header_idx + 1:]
        df.columns = new_header
        df.reset_index(drop=True, inplace=True)
    return df

# --- THUẬT TOÁN DỰ BÁO (NEW) ---
def calculate_trend_forecast(df, date_col, rev_col):
    """Dự báo doanh thu 3 kỳ tiếp theo bằng Linear Regression đơn giản"""
    try:
        if not date_col or not rev_col: return None
        
        # Chuẩn bị dữ liệu time series
        ts_df = df.copy()
        ts_df[date_col] = pd.to_datetime(ts_df[date_col], dayfirst=True, errors='coerce')
        ts_df = ts_df.dropna(subset=[date_col])
        
        # Group theo tháng
        ts_df['period'] = ts_df[date_col].dt.to_period('M')
        monthly_data = ts_df.groupby('period')[rev_col].sum().reset_index()
        monthly_data['timestamp'] = monthly_data['period'].dt.to_timestamp()
        
        # Cần ít nhất 3 điểm dữ liệu để dự báo
        if len(monthly_data) < 3: return None
        
        # Tạo biến X (thời gian dạng số) và Y (doanh thu)
        monthly_data['x'] = np.arange(len(monthly_data))
        x = monthly_data['x'].values
        y = monthly_data[rev_col].values
        
        # Fit đường thẳng (y = mx + c)
        m, c = np.polyfit(x, y, 1)
        
        # Dự báo 3 tháng tới
        future_x = np.arange(len(monthly_data), len(monthly_data) + 3)
        future_y = m * future_x + c
        
        # Format dữ liệu trả về cho Frontend
        history_labels = monthly_data['period'].astype(str).tolist()
        history_values = monthly_data[rev_col].tolist()
        
        last_period = monthly_data['period'].iloc[-1]
        future_labels = [(last_period + i).strftime('%Y-%m') for i in range(1, 4)]
        future_values = [max(0, val) for val in future_y] # Không để số âm
        
        return {
            'labels': history_labels + future_labels,
            'history': history_values + [None]*3, # Phần lịch sử
            'forecast': [None]*(len(history_values)-1) + [history_values[-1]] + future_values, # Phần dự báo (nối tiếp điểm cuối)
            'trend_slope': m # Hệ số góc (để biết đang tăng hay giảm)
        }
    except Exception as e:
        print(f"Forecast Error: {e}")
        return None

def analyze_data(df):
    try:
        df = smart_preprocess(df)
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        col_map = {
            'product': ['product', 'tên hàng', 'sản phẩm', 'sku', 'name'],
            'revenue': ['revenue', 'doanh thu', 'thành tiền', 'total', 'sales'],
            'profit': ['profit', 'lợi nhuận', 'lãi', 'margin'],
            'quantity': ['quantity', 'số lượng', 'sl', 'qty'],
            'date': ['date', 'ngày', 'thời gian', 'time'],
            'category': ['category', 'nhóm', 'loại', 'ngành'],
            'brand': ['brand', 'thương hiệu', 'hãng'],
            'region': ['region', 'khu vực', 'tỉnh', 'thành']
        }
        
        detected = {}
        for key, keywords in col_map.items():
            detected[key] = None
            for col in df.columns:
                if any(k in col for k in keywords):
                    detected[key] = col
                    break

        p_col, r_col = detected['product'], detected['revenue']
        q_col, pr_col = detected['quantity'], detected['profit']
        
        if r_col: df[r_col] = df[r_col].apply(clean_currency_text)
        if pr_col: df[pr_col] = df[pr_col].apply(clean_currency_text)
        if q_col: df[q_col] = pd.to_numeric(df[q_col], errors='coerce').fillna(0)
        
        if not r_col and q_col:
             price_col = None
             for col in df.columns:
                 if any(k in col for k in ['price', 'giá', 'đơn giá']):
                     price_col = col; break
             if price_col:
                 df[price_col] = df[price_col].apply(clean_currency_text)
                 df['calc_revenue'] = df[q_col] * df[price_col]
                 r_col = 'calc_revenue'

        # --- TÍNH TOÁN DỰ BÁO ---
        forecast_data = calculate_trend_forecast(df, detected['date'], r_col)

        universal_data = []
        export_df = df.head(3000).fillna('')
        for _, row in export_df.iterrows():
            rev = float(row[r_col]) if r_col and pd.notnull(row[r_col]) else 0
            prof = float(row[pr_col]) if pr_col and pd.notnull(row[pr_col]) else 0
            qty = float(row[q_col]) if q_col and pd.notnull(row[q_col]) else 0
            
            # Smart Tags Logic
            tags = []
            if prof < 0: tags.append('LỖ')
            elif prof > 0 and (prof/rev > 0.3): tags.append('LÃI CAO')
            
            item = {
                'product': str(row[p_col]) if p_col else 'Unknown',
                'revenue': rev, 'profit': prof, 'quantity': qty,
                'category': str(row[detected['category']]) if detected['category'] else 'Khác',
                'brand': str(row[detected['brand']]) if detected['brand'] else 'Khác',
                'region': str(row[detected['region']]) if detected['region'] else 'Khác',
                'month': str(row[detected['date']]) if detected['date'] else 'N/A',
                'tags': tags
            }
            universal_data.append(item)

        total_rev = sum(x['revenue'] for x in universal_data)
        total_prof = sum(x['profit'] for x in universal_data)
        total_qty = sum(x['quantity'] for x in universal_data)
        
        stats = {'total_revenue': total_rev, 'total_profit': total_prof, 'total_quantity': total_qty}
        
        def get_group(k):
            grp = {}
            for x in universal_data:
                key = x.get(k, 'Khác')
                if key not in grp: grp[key] = {'rev':0, 'qty':0, 'prof':0}
                grp[key]['rev'] += x['revenue']
                grp[key]['qty'] += x['quantity']
                grp[key]['prof'] += x['profit']
            return grp

        smart_summary = {
            'average_margin': (total_prof / total_rev * 100) if total_rev > 0 else 0,
            'forecast_data': forecast_data, # Dữ liệu dự báo mới
            'product_details': sorted([{'product': k, 'revenue': v['rev'], 'profit': v['prof'], 'quantity': v['qty']} for k,v in get_group('product').items()], key=lambda x: x['revenue'], reverse=True)[:15],
            'brand': {k: v['rev'] for k,v in get_group('brand').items()},
            'category': {k: v['rev'] for k,v in get_group('category').items()},
            'product_inventory_table': [{'Product':k, 'Revenue':v['rev'], 'Quantity':v['qty']} for k,v in get_group('product').items()],
            'sales_summary_table': [{'Product':k, 'Revenue':v['rev'], 'Quantity':v['qty']} for k,v in get_group('product').items()],
            'profit_analysis_table': [{'Product':k, 'Revenue':v['rev'], 'Profit':v['prof']} for k,v in get_group('product').items()],
            'category_overview_table': [{'Category':k, 'Revenue':v['rev'], 'Quantity':v['qty']} for k,v in get_group('category').items()],
            'brand_performance_table': [{'Brand':k, 'Revenue':v['rev'], 'Quantity':v['qty']} for k,v in get_group('brand').items()]
        }

        return (stats, {}, {}, {}, {}, [], {}, {}, universal_data, list(df.columns), smart_summary)
    except Exception as e:
        print(f"Analyzer Error: {e}")
        return ({}, {}, {}, {}, {}, [], {}, {}, [], [], {})