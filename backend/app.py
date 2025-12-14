from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime, timezone 
import os
import uuid
import pandas as pd
import json
import requests
import re
import time
from bs4 import BeautifulSoup
import traceback
import numpy as np 

# --- CẤU HÌNH ---
from dotenv import load_dotenv
load_dotenv()

# Lấy key từ file .env hoặc dùng key dự phòng (chỉ để test)
MY_GROQ_KEY = os.environ.get("GROQ_API_KEY", "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") 
GROQ_MODEL_ID = "llama-3.3-70b-versatile" 
GROQ_TITLE_MODEL_ID = "llama-3.1-8b-instant" 

# --- JSON ENCODER FIX QUAN TRỌNG ---
class CustomJsonEncoder(json.JSONEncoder):
    """Buộc các kiểu dữ liệu NumPy phải chuyển đổi sang Python gốc."""
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64)): return int(obj)
        elif isinstance(obj, (np.floating, np.float64)): return float(obj)
        elif isinstance(obj, np.ndarray): return obj.tolist()
        elif isinstance(obj, datetime): return obj.isoformat()
        return super(CustomJsonEncoder, self).default(obj)

app = Flask(__name__, static_folder="../frontend", static_url_path="/")
app.json_encoder = CustomJsonEncoder 

# Config cho Flask 2.2+ (Optional)
try:
    from flask.json.provider import DefaultJSONProvider
    class CustomJSONProvider(DefaultJSONProvider):
        def default(self, obj):
            if isinstance(obj, (np.integer, np.int64)): return int(obj)
            elif isinstance(obj, (np.floating, np.float64)): return float(obj)
            elif isinstance(obj, np.ndarray): return obj.tolist()
            elif isinstance(obj, datetime): return obj.isoformat()
            return super().default(obj)
    app.json = CustomJSONProvider(app)
except: pass

# --- KẾT NỐI AI ---
GROQ_AVAILABLE = False
client = None
try:
    from groq import Groq
    if MY_GROQ_KEY and "gsk_" in MY_GROQ_KEY:
        client = Groq(api_key=MY_GROQ_KEY)
        GROQ_AVAILABLE = True
        print("✅ Đã kết nối Groq AI")
except: pass

# --- IMPORT ANALYZER ---
try: import analyzer
except: print("⚠️ Chưa có module analyzer")

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'datana-super-secret-2025')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['UPLOAD_FOLDER'] = 'uploads'
CORS(app) 

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)

# --- MODELS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)

class Analysis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    filename = db.Column(db.String(200))
    result_json = db.Column(db.Text)
    title = db.Column(db.String(255), default='Phân tích mới')
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class ChatHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) 
    session_id = db.Column(db.String(255), nullable=False) 
    sender = db.Column(db.String(10), nullable=False) 
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

@login_manager.user_loader
def load_user(uid): return db.session.get(User, int(uid))

if not os.path.exists(app.config['UPLOAD_FOLDER']): os.makedirs(app.config['UPLOAD_FOLDER'])

TEMP_SESSIONS = {}
TEMP_CHAT_HISTORY = {} 

# --- HÀM TÌM KIẾM THÔNG MINH ---
def search_google_trends(keyword):
    """Tìm tin tức thị trường để bổ sung kiến thức cho AI"""
    if not keyword or len(keyword) < 2: return "Không có dữ liệu tìm kiếm cụ thể."
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        # Tìm kiếm tin tức tiếng Việt mới nhất 2024-2025
        res = requests.post(url, data={'q': f"thị trường {keyword} việt nam xu hướng 2025"}, headers=headers, timeout=4) 
        soup = BeautifulSoup(res.text, 'html.parser')
        
        results = []
        for a in soup.find_all('a', class_='result__a', limit=3):
            results.append(f"- {a.get_text(strip=True)}")
            
        return "\n".join(results) if results else "Không tìm thấy tin tức mới."
    except: return "Hệ thống tìm kiếm đang bảo trì."

# --- HÀM GỌI AI (CORE) ---
def call_ai_with_retry(sys_msg, usr_msg):
    if not GROQ_AVAILABLE: return "Lỗi: Chưa kết nối AI. Vui lòng kiểm tra API Key."
    for _ in range(3): # Thử lại 3 lần nếu lỗi mạng
        try:
            return client.chat.completions.create(
                model=GROQ_MODEL_ID,
                messages=[{"role":"system","content":sys_msg},{"role":"user","content":usr_msg}],
                temperature=0.6, 
                max_tokens=2500 # Tăng token để trả lời dài hơn
            ).choices[0].message.content
        except: time.sleep(1)
    return "AI đang quá tải, vui lòng thử lại sau giây lát."

# Hàm lấy dữ liệu phiên làm việc
def get_session_data(sid):
    if sid.startswith("db_") and current_user.is_authenticated:
        try:
            rec = db.session.get(Analysis, int(sid.split("_")[1]))
            if rec: return json.loads(rec.result_json), rec.title, rec.filename
        except: pass
    elif sid in TEMP_SESSIONS:
        sess = TEMP_SESSIONS[sid]
        return sess, sess.get('title'), sess.get('filename')
    return {}, "Phân tích mới", ""

# --- API ROUTES ---

# 1. API CHAT (NÂNG CẤP MẠNH MẼ)
@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        if not data: return jsonify({"error": "No data"}), 400
        
        msg = data.get("message", "").strip()
        sid = data.get("session_id")
        
        # 1. Lấy Dữ liệu từ File Excel của người dùng
        ctx, title, filename = get_session_data(sid)
        
        if not ctx: 
            return jsonify({"response": "⚠️ Tôi chưa thấy file dữ liệu nào. Vui lòng tải lên file Excel/CSV để tôi phân tích số liệu giúp bạn."})

        # Trích xuất các chỉ số quan trọng (KPIs)
        stats = ctx.get('statistics', {})
        smart_sum = ctx.get('smart_summary', {})
        
        # Lấy Top sản phẩm & Ngành hàng để AI hiểu ngữ cảnh
        top_products = smart_sum.get('product_details', [])[:5]
        top_categories = list(smart_sum.get('category', {}).keys())[:3]
        
        # Chuẩn bị dữ liệu dạng văn bản để "mớm" cho AI
        data_context = f"""
        [DỮ LIỆU TỪ FILE CỦA NGƯỜI DÙNG - {filename}]
        - Tổng doanh thu: {stats.get('total_revenue', 0):,.0f} VNĐ
        - Tổng lợi nhuận: {stats.get('total_profit', 0):,.0f} VNĐ
        - Tổng số lượng bán: {stats.get('total_quantity', 0):,.0f} sản phẩm
        - Biên lợi nhuận trung bình: {smart_sum.get('average_margin', 0):.1f}%
        
        [TOP SẢN PHẨM BÁN CHẠY NHẤT]
        {json.dumps([{ 'Tên': p['product'], 'Doanh thu': f"{p['revenue']:,.0f}", 'Lợi nhuận': f"{p['profit']:,.0f}" } for p in top_products], ensure_ascii=False)}
        
        [DANH MỤC CHÍNH]: {', '.join(top_categories)}
        """

        # 2. Tìm kiếm thông tin thị trường (Nếu câu hỏi liên quan)
        market_info = ""
        if any(kw in msg.lower() for kw in ['thị trường', 'xu hướng', 'trend', 'bên ngoài', 'đối thủ', 'tương lai', 'dự báo']):
            keyword = top_products[0]['product'] if top_products else "kinh doanh"
            news = search_google_trends(keyword)
            market_info = f"\n[TIN TỨC THỊ TRƯỜNG THỰC TẾ 2024-2025]\n{news}\n(Hãy kết hợp tin tức này với dữ liệu nội bộ để đưa ra lời khuyên)."

        # 3. System Prompt (Luật chơi cho AI)
        system_prompt = f"""Bạn là Chuyên gia Tư vấn Chiến lược Kinh doanh (Senior Business Analyst). 
        Bạn đang nói chuyện với chủ doanh nghiệp.
        
        NHIỆM VỤ CỦA BẠN:
        1. Trả lời câu hỏi dựa trên DỮ LIỆU THẬT từ file Excel (được cung cấp bên dưới).
        2. Luôn dẫn chứng bằng số liệu cụ thể (Ví dụ: thay vì nói "bán tốt", hãy nói "đạt doanh thu 500 triệu").
        3. Nếu người dùng hỏi về chiến lược, hãy kết hợp dữ liệu nội bộ với kiến thức thị trường.
        4. Phong cách: Chuyên nghiệp, sắc sảo, ngắn gọn, dùng định dạng Markdown (in đậm số liệu quan trọng).
        
        DỮ LIỆU CẦN PHÂN TÍCH:
        {data_context}
        {market_info}
        """

        # Gọi AI
        ai_response = call_ai_with_retry(system_prompt, msg)
        
        # Lưu lịch sử
        if current_user.is_authenticated and sid.startswith("db_"):
            db.session.add(ChatHistory(user_id=current_user.id, session_id=sid, sender='user', message=msg))
            db.session.add(ChatHistory(user_id=current_user.id, session_id=sid, sender='ai', message=ai_response))
            db.session.commit()
        elif sid:
            if sid not in TEMP_CHAT_HISTORY: TEMP_CHAT_HISTORY[sid] = []
            TEMP_CHAT_HISTORY[sid].append({'sender': 'user', 'message': msg, 'timestamp': datetime.now(timezone.utc).isoformat()})
            TEMP_CHAT_HISTORY[sid].append({'sender': 'ai', 'message': ai_response, 'timestamp': datetime.now(timezone.utc).isoformat()})

        # Tự động đặt tiêu đề phiên nếu chưa có
        session_title = title
        if title == "Phân tích mới" and len(msg) > 5:
            # Logic đơn giản: Lấy 5-6 từ đầu làm tiêu đề
            session_title = " ".join(msg.split()[:6]) + "..."
            if current_user.is_authenticated and sid.startswith("db_"):
                rec = db.session.get(Analysis, int(sid.split("_")[1]))
                if rec: 
                    rec.title = session_title
                    db.session.commit()
            elif sid in TEMP_SESSIONS:
                TEMP_SESSIONS[sid]['title'] = session_title

        return jsonify({
            "response": ai_response,
            "session_title": session_title
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# 2. API FORECAST (Dự báo chuyên sâu)
@app.route("/api/forecast", methods=["POST"])
def forecast_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        sid = data.get("session_id")
        ctx, _, _ = get_session_data(sid)
        
        if not ctx: return jsonify({"error": "Không tìm thấy dữ liệu phân tích."}), 404
        
        stats = ctx.get('statistics', {})
        smart_sum = ctx.get('smart_summary', {})
        top_prods = smart_sum.get('product_details', [])[:5]
        
        # Tìm tin tức thị trường cho sản phẩm Top 1
        keyword = top_prods[0]['product'] if top_prods else "bán lẻ"
        news = search_google_trends(keyword)
        
        # Prompt chuyên dụng cho Báo cáo HTML
        sys_msg = f"""Bạn là Giám đốc Chiến lược (CSO). Hãy viết một báo cáo HTML ngắn gọn (chỉ lấy phần body content) phân tích tình hình kinh doanh.
        
        DỮ LIỆU: 
        - Doanh thu: {stats.get('total_revenue',0):,.0f} | Lợi nhuận: {stats.get('total_profit',0):,.0f}
        - Top sản phẩm: {', '.join([p['product'] for p in top_prods])}
        - Tin thị trường ({keyword}): {news}
        
        YÊU CẦU ĐẦU RA (HTML):
        <div class="ai-report">
            <h3 style="color:#a855f7">📊 Hiện trạng & Xu hướng</h3>
            <p>...nhận định...</p>
            <h3 style="color:#3b82f6">💡 Cơ hội Tăng trưởng</h3>
            <ul>...các gạch đầu dòng...</ul>
            <h3 style="color:#ef4444">⚠️ Cảnh báo Rủi ro</h3>
            <p>...cảnh báo...</p>
        </div>
        """
        
        html = call_ai_with_retry(sys_msg, "Hãy phân tích ngay.")
        return jsonify({"html_content": html.replace("```html","").replace("```","").strip()})
    except Exception as e: return jsonify({"error":str(e)}), 500

# 3. CÁC API KHÁC (GIỮ NGUYÊN)
@app.route("/analyze", methods=["POST"])
def analyze_endpoint():
    try:
        f = request.files.get('file')
        if not f: return jsonify({"error":"No file"}),400
        path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(f.filename))
        f.save(path)
        
        try:
            if path.endswith('.csv'): 
                try: df = pd.read_csv(path, encoding='utf-8')
                except: df = pd.read_csv(path, encoding='cp1258')
            else: df = pd.read_excel(path)
        except: return jsonify({"error":"Lỗi đọc file"}),400
        finally: 
            if os.path.exists(path): os.remove(path)

        if not analyzer: return jsonify({"error":"Lỗi module analyzer"}), 500
        
        data_tuple = analyzer.analyze_data(df)
        smart_summary = data_tuple[10]
        
        res = {
            "statistics": data_tuple[0],
            "raw_data": data_tuple[8],
            "smart_summary": smart_summary,
            "tables": {
                "product_inventory": smart_summary.get('product_inventory_table', []),
                "sales_summary": smart_summary.get('sales_summary_table', []),
                "profit_analysis": smart_summary.get('profit_analysis_table', []),
                "category_overview": smart_summary.get('category_overview_table', []),
                "brand_performance": smart_summary.get('brand_performance_table', [])
            }
        }
        
        json_res = json.dumps(res, cls=CustomJsonEncoder)
        sid = str(uuid.uuid4())
        
        if current_user.is_authenticated:
            new_rec = Analysis(user_id=current_user.id, filename=f.filename, result_json=json_res, title=f"Phân tích: {f.filename}")
            db.session.add(new_rec)
            db.session.commit()
            sid = f"db_{new_rec.id}"
        else:
            res_dict = json.loads(json_res)
            res_dict['title'] = f"Phân tích: {f.filename}"
            res_dict['filename'] = f.filename
            TEMP_SESSIONS[sid] = res_dict
            
        res['session_id'] = sid
        return jsonify(res)
    except Exception as e: return jsonify({"error":str(e)}),500

@app.route("/api/new_session", methods=["POST"])
def new_session():
    return jsonify({"success": True, "new_session_id": str(uuid.uuid4())})

@app.route("/api/user_info", methods=["GET"])
def user_info():
    if current_user.is_authenticated:
        return jsonify({"authenticated": True, "username": current_user.username})
    return jsonify({"authenticated": False})

@app.route("/api/chat_history", methods=["POST"])
def chat_history():
    try:
        data = request.get_json(force=True)
        sid = data.get("session_id")
        
        sessions = []
        history = []
        
        if current_user.is_authenticated:
            recs = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.timestamp.desc()).all()
            sessions = [{'session_id': f"db_{r.id}", 'title': r.title, 'created_at': r.timestamp.isoformat()} for r in recs]
            
            if sid and sid.startswith("db_"):
                msgs = ChatHistory.query.filter_by(session_id=sid).order_by(ChatHistory.timestamp).all()
                history = [{'sender': m.sender, 'message': m.message} for m in msgs]
        
        return jsonify({"history": history, "sessions": sessions})
    except: return jsonify({"history": [], "sessions": []})

@app.route("/api/login", methods=["POST"])
def login_ep():
    d = request.json
    u = User.query.filter_by(username=d.get('username')).first()
    if u and check_password_hash(u.password, d.get('password')):
        login_user(u)
        return jsonify({"success": True, "username": u.username})
    return jsonify({"error": "Fail"}), 401

@app.route("/api/register", methods=["POST"])
def register_ep():
    d = request.json
    if User.query.filter_by(username=d.get('username')).first(): return jsonify({"error": "Exist"}), 400
    db.session.add(User(username=d.get('username'), password=generate_password_hash(d.get('password'))))
    db.session.commit()
    return jsonify({"success": True})

@app.route("/api/logout", methods=["POST"])
def logout_ep():
    logout_user()
    return jsonify({"success": True})

@app.route("/")
def index(): return send_from_directory(app.static_folder, "index.html")
@app.route("/<path:path>")
def static_files(path): return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    with app.app_context(): db.create_all()
    # Chạy trên cổng 5001 để tránh xung đột
    app.run(host="0.0.0.0", port=5001, debug=True)