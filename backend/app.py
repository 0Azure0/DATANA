from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime
import os
import uuid
import pandas as pd
import json
import requests
import re
import time
from bs4 import BeautifulSoup

# --- CẤU HÌNH ---
MY_GROQ_KEY = os.environ.get("GROQ_API_KEY", "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") 
GROQ_MODEL_ID = "llama-3.3-70b-versatile" 

app = Flask(__name__, static_folder="../frontend", static_url_path="/")

# --- KẾT NỐI GROQ ---
GROQ_AVAILABLE = False
client = None
try:
    from groq import Groq, RateLimitError
    if MY_GROQ_KEY and "gsk_" in MY_GROQ_KEY:
        client = Groq(api_key=MY_GROQ_KEY)
        GROQ_AVAILABLE = True
except: pass

# --- IMPORT MODULE ---
try: import analyzer
except: pass

app.config['SECRET_KEY'] = 'datana-super-secret' 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['UPLOAD_FOLDER'] = 'uploads'
CORS(app)
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)

class Analysis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    filename = db.Column(db.String(200))
    result_json = db.Column(db.Text)

@login_manager.user_loader
def load_user(uid): return db.session.get(User, int(uid))
if not os.path.exists(app.config['UPLOAD_FOLDER']): os.makedirs(app.config['UPLOAD_FOLDER'])
TEMP_SESSIONS = {}

# --- [FIX] HÀM TÌM KIẾM GOOGLE (THÊM VÀO ĐÂY) ---
def search_google_trends(keyword):
    if not keyword or keyword == "Không rõ": return "Không có thông tin."
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        res = requests.post(url, data={'q': f"thị trường {keyword} việt nam 2025"}, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        results = [r.get_text(strip=True) for r in soup.find_all('a', class_='result__a', limit=3)]
        return "\n".join(results) if results else "Không tìm thấy tin tức."
    except Exception as e: return f"Lỗi tìm kiếm: {str(e)}"

# --- GỌI AI ---
def call_ai_with_retry(sys_msg, usr_msg):
    if not GROQ_AVAILABLE: return "Lỗi kết nối AI."
    for _ in range(3):
        try:
            return client.chat.completions.create(
                model=GROQ_MODEL_ID,
                messages=[{"role":"system","content":sys_msg},{"role":"user","content":usr_msg}],
                temperature=0.6, max_tokens=2000
            ).choices[0].message.content
        except: time.sleep(1)
    return "AI đang bận."

# --- ROUTES ---
@app.route("/")
def index(): return send_from_directory(app.static_folder, "index.html")
@app.route("/pages/<path:p>")
def pages(p): return send_from_directory(os.path.join(app.static_folder, "pages"), p)
@app.route("/images/<path:p>")
def imgs(p): return send_from_directory(os.path.join(app.static_folder, "images"), p)
@app.route("/css/<path:p>")
def css(p): return send_from_directory(os.path.join(app.static_folder, "css"), p)
@app.route("/js/<path:p>")
def js(p): return send_from_directory(os.path.join(app.static_folder, "js"), p)

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    u = User.query.filter_by(username=data.get('username')).first()
    if u and check_password_hash(u.password, data.get('password')):
        login_user(u); return jsonify({"message":"OK","username":u.username})
    return jsonify({"error":"Fail"}),401

@app.route("/api/register", methods=["POST"])
def register():
    d=request.json
    if User.query.filter_by(username=d.get('username')).first(): return jsonify({"error":"Exist"}),400
    db.session.add(User(username=d.get('username'), password=generate_password_hash(d.get('password'))))
    db.session.commit(); return jsonify({"message":"OK"})

@app.route("/analyze", methods=["POST"])
def analyze_endpoint():
    try:
        f = request.files.get('file')
        if not f: return jsonify({"error":"No file"}),400
        path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(f.filename))
        f.save(path)
        
        if path.endswith('.csv'):
            try: df = pd.read_csv(path, encoding='utf-8')
            except: df = pd.read_csv(path, encoding='cp1258')
        else: df = pd.read_excel(path)
        os.remove(path)

        data = analyzer.analyze_data(df)
        res = {"statistics": data[0], "raw_data": data[8], "smart_summary": data[10]}
        
        sid = str(uuid.uuid4())
        if current_user.is_authenticated:
            db.session.add(Analysis(user_id=current_user.id, filename=f.filename, result_json=json.dumps(res)))
            db.session.commit()
            last = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.id.desc()).first()
            sid = f"db_{last.id}"
        else: TEMP_SESSIONS[sid] = res
            
        res['session_id'] = sid
        return jsonify(res)
    except Exception as e: return jsonify({"error":str(e)}),500

@app.route("/api/forecast", methods=["POST"])
def forecast_endpoint():
    try:
        # RESILIENT JSON HANDLING - Force decode and handle non-strict types
        data = request.get_json(force=True, silent=True)
        if not data or not isinstance(data, dict):
            return jsonify({"error": "Invalid JSON: Expected JSON object"}), 400
        
        sid = data.get("session_id")
        if not sid:
            return jsonify({"error": "Missing session_id parameter"}), 400
        
        # Retrieve analysis context
        ctx = {}
        try:
            if sid.startswith("db_") and current_user.is_authenticated:
                rec = db.session.get(Analysis, int(sid.split("_")[1]))
                if rec: ctx = json.loads(rec.result_json)
            else:
                ctx = TEMP_SESSIONS.get(sid, {})
        except Exception as ctx_err:
            return jsonify({"error": f"Session context error: {str(ctx_err)}"}), 400
        
        raw = ctx.get('raw_data', [])
        if not raw or len(raw) == 0:
            return jsonify({"error": "No analysis data found for this session"}), 400
        
        # Create DataFrame and perform advanced analysis
        try:
            df = pd.DataFrame(raw)
            
            top_p = "Sản phẩm"
            revenue_col = None
            product_col = None
            profit_col = None
            qty_col = None
            
            # Dynamic column discovery
            for col in df.columns:
                col_lower = str(col).lower()
                if 'revenue' in col_lower or 'doanh thu' in col_lower or 'sales' in col_lower:
                    revenue_col = col
                if 'product' in col_lower or 'name' in col_lower or 'sản phẩm' in col_lower or 'tên' in col_lower:
                    product_col = col
                if 'profit' in col_lower or 'lợi nhuận' in col_lower or 'margin' in col_lower:
                    profit_col = col
                if 'quantity' in col_lower or 'số lượng' in col_lower or 'qty' in col_lower:
                    qty_col = col
            
            # Calculate metrics for CDO-level analysis
            metrics = {}
            if revenue_col and product_col:
                df[revenue_col] = pd.to_numeric(df[revenue_col], errors='coerce').fillna(0)
                top_group = df.groupby(product_col)[revenue_col].sum().sort_values(ascending=False)
                if not top_group.empty:
                    top_p = str(top_group.index[0])
                    metrics['top_product'] = top_p
                    metrics['top_revenue'] = f"{top_group.iloc[0]:,.0f}"
            
            # Pareto Analysis (Concentration Risk)
            if revenue_col and product_col:
                total_revenue = df[revenue_col].sum()
                top_3_revenue = df.groupby(product_col)[revenue_col].sum().nlargest(3).sum()
                concentration = (top_3_revenue / total_revenue * 100) if total_revenue > 0 else 0
                metrics['concentration_risk'] = f"{concentration:.1f}%"
            
            # Margin Analysis
            if profit_col and revenue_col:
                df[profit_col] = pd.to_numeric(df[profit_col], errors='coerce').fillna(0)
                avg_margin = (df[profit_col].sum() / df[revenue_col].sum() * 100) if df[revenue_col].sum() > 0 else 0
                metrics['avg_margin'] = f"{avg_margin:.1f}%"
        
        except Exception as df_err:
            return jsonify({"error": f"DataFrame processing error: {str(df_err)}"}), 500
        
        # Search market trends
        news = search_google_trends(top_p)
        
        # ENHANCED SYSTEM PROMPT - CDO/CFO MODE (More explicit, structured)
        sys_msg = """Bạn là Chief Data Officer (CDO) và Chief Financial Officer (CFO) tư duy chiến lược cao cấp.
        Hãy phân tích dữ liệu bán hàng như một lãnh đạo: cung cấp một BÁO CÁO NGẮN GỌN nhưng CHÍNH XÁC, CÓ SỐ LIỆU HỖ TRỢ và KẾ HOẠCH THỰC THI.
        Yêu cầu đầu ra (bắt buộc):
        - Phần 1: Risk Assessment (Pareto) — liệt kê Top 5 sản phẩm theo doanh thu và cho biết % đóng góp của từng sản phẩm trên tổng doanh thu; tính % doanh thu của Top 3 và Top 5 (ví dụ: Top3 = 62.3%).
        - Phần 2: Pricing & Margin Strategy — chỉ ra các nhóm sản phẩm có margin thấp/không tương xứng so với giá, đề xuất 3 chiến lược giá cụ thể (ví dụ tăng giá có kiểm thử A/B, gói bundles, giảm chiết khấu cho kênh X).
        - Phần 3: Top 3 Actions — 3 hành động có thể đo lường trong 90 ngày; cho biết MỤC TIÊU (KPIs) và cách đo lường (metrics), ưu tiên (High/Medium/Low), và ước tính tác động đến doanh thu hoặc margin.

        Format đầu ra: TRẢ VỀ HTML SẠCH dùng thẻ <h3>, <h4>, <p>, <ul>, <li>, <strong>. KHÔNG dùng Markdown hoặc code blocks. Tránh văn phong vòng vo; đưa ra con số và hành động rõ ràng.
        """

        metrics_str = " | ".join([f"{k}: {v}" for k, v in metrics.items()])
        usr_msg = f"""Bạn có dữ liệu phân tích nội bộ sau:
        - Top Product: {top_p}
        - Metrics: {metrics_str}
        - Market Context / Recent News: {news}

        Yêu cầu cụ thể:
        1) Thực hiện Pareto concentration analysis (Top3, Top5 %) và liệt kê Top5 products với doanh thu tuyệt đối và %.
        2) Đánh giá pricing & margin — chỉ ra 2-3 cơ hội tối ưu hóa (ví dụ, tăng giá, giảm chiết khấu, thay đổi bundling).
        3) Đưa ra Top 3 hành động rõ ràng trong 90 ngày kèm KPI và cách đo lường.

        Trả lời bằng HTML theo định dạng đã nêu ở trên.
        """
        
        html = call_ai_with_retry(sys_msg, usr_msg)
        if not html:
            html = f"<div><h3>Phân tích CDO cho {top_p}</h3><p>Metrics: {metrics_str}</p><p>AI đang bận. Vui lòng thử lại sau.</p></div>"
        
        # Clean up any remaining markdown
        html = html.replace("```html", "").replace("```", "").strip()
        
        return jsonify({"html_content": html})

    except Exception as e:
        import traceback
        print(f"Forecast endpoint error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}"}), 500

if __name__ == "__main__":
    with app.app_context(): db.create_all()
    app.run(host="0.0.0.0", port=5000, debug=True)