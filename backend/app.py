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
import traceback
import numpy as np # IMPORT MỚI: Cần thiết cho JSON Encoder

# --- CẤU HÌNH ---
# FIXED: Khóa GROQ đã được cập nhật
MY_GROQ_KEY = os.environ.get("GROQ_API_KEY", "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") 
GROQ_MODEL_ID = "llama-3.3-70b-versatile" 

# --- JSON ENCODER FIX QUAN TRỌNG ---
class CustomJsonEncoder(json.JSONEncoder):
    """Buộc các kiểu dữ liệu NumPy phải chuyển đổi sang Python gốc."""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, datetime):
            return obj.isoformat()
        return super(CustomJsonEncoder, self).default(obj)

# --- KHỞI TẠO FLASK ---
app = Flask(__name__, static_folder="../frontend", static_url_path="/")
# Cấu hình Flask JSON encoder cho Flask 2.2+
try:
    # Flask 2.2+
    from flask.json.provider import DefaultJSONProvider
    class CustomJSONProvider(DefaultJSONProvider):
        def default(self, obj):
            if isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, datetime):
                return obj.isoformat()
            return super().default(obj)
    app.json = CustomJSONProvider(app)
except ImportError:
    # Fallback cho Flask < 2.2
    app.json_encoder = CustomJsonEncoder 


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

# Cấu hình CORS chi tiết
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5000", "http://127.0.0.1:5000", "http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    },
    r"/analyze": {
        "origins": ["http://localhost:5000", "http://127.0.0.1:5000", "http://localhost:3000"],
        "methods": ["POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
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

# --- HÀM TÌM KIẾM GOOGLE (THÊM VÀO ĐÂY) ---
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

# --- ROUTES (Giữ nguyên các route phụ) ---
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
        login_user(u)
        return jsonify({"message":"OK","username":u.username, "success": True})
    return jsonify({"error":"Fail", "success": False}),401

@app.route("/api/register", methods=["POST"])
def register():
    d=request.json
    if User.query.filter_by(username=d.get('username')).first(): 
        return jsonify({"error":"Exist", "success": False}),400
    db.session.add(User(username=d.get('username'), password=generate_password_hash(d.get('password'))))
    db.session.commit()
    return jsonify({"message":"OK", "success": True})


# FIXED: Analyze Endpoint - Sử dụng Custom Encoder cho DB và Response
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

        data_tuple = analyzer.analyze_data(df)
        
        # CHỈNH SỬA: Đảm bảo output JSON đầy đủ và dễ dùng cho frontend
        # Trích xuất Brand & Category từ smart_summary
        smart_summary = data_tuple[10]
        brand_analysis = smart_summary.get('brand', {})
        category_analysis = smart_summary.get('category', {})
        product_details = smart_summary.get('product_details', [])
        
        # Trích xuất các bảng phân tích
        product_inventory_table = smart_summary.get('product_inventory_table', [])
        sales_summary_table = smart_summary.get('sales_summary_table', [])
        profit_analysis_table = smart_summary.get('profit_analysis_table', [])
        category_overview_table = smart_summary.get('category_overview_table', [])
        brand_performance_table = smart_summary.get('brand_performance_table', [])
        
        res = {
            "statistics": data_tuple[0], 
            "time_analysis": data_tuple[1],
            "product_analysis": {
                "products": data_tuple[5],
                "details": product_details
            },
            "region_analysis": data_tuple[3],
            "brand_analysis": brand_analysis,
            "category_analysis": category_analysis,
            "raw_data": data_tuple[8], 
            "smart_summary": smart_summary,
            "columns": data_tuple[9],
            # Thêm các bảng phân tích
            "tables": {
                "product_inventory": product_inventory_table,
                "sales_summary": sales_summary_table,
                "profit_analysis": profit_analysis_table,
                "category_overview": category_overview_table,
                "brand_performance": brand_performance_table
            }
        }
        
        sid = str(uuid.uuid4())
        # SỬ DỤNG CUSTOM ENCODER KHI LƯU VÀO DB
        json_res = json.dumps(res, cls=CustomJsonEncoder) 
        
        if current_user.is_authenticated:
            db.session.add(Analysis(user_id=current_user.id, filename=f.filename, result_json=json_res))
            db.session.commit()
            last = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.id.desc()).first()
            sid = f"db_{last.id}"
        else: 
            # Dữ liệu trong TEMP_SESSIONS vẫn phải là dict chứa native types (do CustomJsonEncoder xử lý)
            TEMP_SESSIONS[sid] = json.loads(json_res) 
            
        res['session_id'] = sid
        # SỬ DỤNG jsonify (đã gán Custom Encoder) để trả về Response sạch
        return jsonify(res)
    except Exception as e: 
        traceback.print_exc()
        return jsonify({"error":str(e)}),500

# --- CHAT ENDPOINT (ĐÃ CẬP NHẬT: Thêm logic tìm kiếm thị trường) ---
@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    """
    Chat endpoint: Nhận tin nhắn người dùng + session_id, trả về response từ AI
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        message = data.get("message", "").strip()
        session_id = data.get("session_id", "")
        
        if not message:
            return jsonify({"error": "Message is empty"}), 400
        
        # Lấy context từ session hoặc database
        context = {}
        try:
            if session_id.startswith("db_") and current_user.is_authenticated:
                rec = db.session.get(Analysis, int(session_id.split("_")[1]))
                if rec:
                    context = json.loads(rec.result_json)
            else:
                context = TEMP_SESSIONS.get(session_id, {})
        except:
            pass
        
        # --- BỔ SUNG LOGIC THỊ TRƯỜNG ---
        smart_sum = context.get('smart_summary', {})
        statistics = context.get('statistics', {})
        top_products = smart_sum.get('product_details', [])[:3]
        
        search_keyword = "thị trường kinh doanh"
        if top_products:
            search_keyword = top_products[0]['product']
        market_trends = search_google_trends(search_keyword)

        # Xây dựng prompt dựa trên context
        brand_analysis = smart_sum.get('brand', {})
        category_analysis = smart_sum.get('category', {})
        tables = context.get('tables', {})
        
        system_prompt = f"""Bạn là trợ lý phân tích dữ liệu kinh doanh thông minh.
        Nhiệm vụ: Phân tích dữ liệu nội bộ và kết hợp với bối cảnh thị trường để trả lời.
        
        QUY TẮC:
        1. Trả lời các câu hỏi của người dùng dựa trên dữ liệu phân tích được cung cấp.
        2. Nếu câu hỏi liên quan đến xu hướng, chiến lược, hoặc tương lai, hãy SỬ DỤNG THÔNG TIN THỊ TRƯỜNG để đưa ra câu trả lời sắc bén, không chỉ dựa trên dữ liệu lịch sử.
        3. Hãy trả lời ngắn gọn, có sắc thái, và cung cấp thông tin hữu ích.
        
        TIN TỨC VÀ XU HƯỚNG THỊ TRƯỜNG LIÊN QUAN ĐẾN SẢN PHẨM "{search_keyword}":
        <MARKET_NEWS>
        {market_trends}
        </MARKET_NEWS>
        
        DỮ LIỆU NỘI BỘ TÓNG HỢP:
        - Tổng doanh thu: {statistics.get('total_revenue', 'N/A'):,.0f}
        - Tổng lợi nhuận: {statistics.get('total_profit', 'N/A'):,.0f}
        - Biên lợi nhuận: {smart_sum.get('average_margin', 'N/A')}%

        TOP PERFORMERS:
        - Top Brand: {list(brand_analysis.keys())[:3] if brand_analysis else 'N/A'}
        - Top Category: {list(category_analysis.keys())[:3] if category_analysis else 'N/A'}
        """
        
        # Ghi đè system_prompt bằng prompt đã có thêm bối cảnh thị trường
        # system_prompt += context_info # Đã tích hợp vào khối trên
        
        # Gọi AI
        response = call_ai_with_retry(system_prompt, message)
        
        return jsonify({
            "assistant": response,
            "response": response,
            "session_id": session_id
        })
    
    except Exception as e:
        print(f"Chat error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# (Forecast Endpoint giữ nguyên)
# --- CẬP NHẬT TRONG FILE app.py ---

@app.route("/api/forecast", methods=["POST"])
def forecast_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        if not data: return jsonify({"error": "Invalid JSON"}), 400
        
        sid = data.get("session_id")
        if not sid: return jsonify({"error": "Missing session_id"}), 400
        
        # Lấy Context
        ctx = {}
        try:
            if sid.startswith("db_") and current_user.is_authenticated:
                rec = db.session.get(Analysis, int(sid.split("_")[1]))
                if rec: ctx = json.loads(rec.result_json)
            else:
                ctx = TEMP_SESSIONS.get(sid, {})
        except: pass
        
        smart_sum = ctx.get('smart_summary', {})
        statistics = ctx.get('statistics', {})
        
        # Lấy dữ liệu cốt lõi
        total_rev = statistics.get('total_revenue', 0)
        total_profit = statistics.get('total_profit', 0)
        margin = smart_sum.get('average_margin', 0)
        top_products = smart_sum.get('product_details', [])[:8] # Lấy 8 SP đầu
        
        # --- NÂNG CẤP 1: TỰ ĐỘNG NHẬN DIỆN NGÀNH HÀNG ---
        # AI sẽ nhìn vào tên 3 sản phẩm đầu tiên để đoán xem công ty này bán gì
        sample_prods = ", ".join([p['product'] for p in top_products[:3]])

        # --- NÂNG CẤP 2: TÌM KIẾM BỐI CẢNH THỊ TRƯỜNG THỰC TẾ (MỚI) ---
        # Gọi AI để nhận diện ngành hàng (sử dụng model nhanh hơn nếu cần)
        # Tạm thời, ta cho AI đoán luôn trong System Prompt, sau đó dùng top product để tìm kiếm
        if top_products:
            # Lấy tên sản phẩm bán chạy nhất để tìm kiếm xu hướng
            search_keyword = top_products[0]['product']
        else:
            search_keyword = "thị trường kinh doanh"
            
        market_trends = search_google_trends(search_keyword) 
        
        # --- NÂNG CẤP 3: SYSTEM PROMPT "TƯ DUY THỊ TRƯỜNG" VÀ GẮN CONTEXT NGOÀI ---
        sys_msg = f"""
        Bạn là Chuyên gia Chiến lược Thị trường Cấp cao (Senior Market Strategist) tại Việt Nam.
        Nhiệm vụ: Phân tích dữ liệu kinh doanh dưới góc độ xu hướng thị trường, tâm lý người tiêu dùng và bối cảnh vĩ mô.

        QUY TẮC TƯ DUY (CHAIN OF THOUGHT):
        1. NHẬN DIỆN: Dựa vào tên sản phẩm "{sample_prods}...", hãy xác định đây là ngành hàng gì (Ví dụ: Công nghệ, Thời trang, F&B...)?
        2. BỐI CẢNH: Ngành hàng này tại Việt Nam hiện nay có xu hướng gì (Trend)?
        3. LIÊN KẾT: Tại sao sản phẩm Top 1 lại bán chạy? (Do thương hiệu, giá, hay trend?). Tại sao biên lợi nhuận lại ở mức {margin:.1f}%? (Cao hay thấp so với trung bình ngành?).

        TIN TỨC THỊ TRƯỜNG (Dùng để đưa ra khuyến nghị):
        <MARKET_NEWS>
        {market_trends}
        </MARKET_NEWS>

        YÊU CẦU ĐẦU RA (HTML FORMAT):
        Trả về kết quả dưới dạng HTML (không markdown), chia làm 3 phần sâu sắc:
        
        <div class="ai-analysis-container">
            <h3 style="color: #a855f7;">🔍 Nhận định Bối cảnh & Xu hướng</h3>
            <p>[Đoạn văn phân tích ngành hàng này tại VN. SỬ DỤNG DỮ LIỆU TỪ MARKET_NEWS. Ví dụ: Nếu là iPhone, hãy nói về xu hướng chuộng hàng Apple của người Việt, sự cạnh tranh với Samsung, hoặc thời điểm ra mắt mẫu mới...]</p>
            
            <h3 style="color: #4ade80;">💎 Giải mã Hiệu suất Kinh doanh</h3>
            <p>[Phân tích tại sao doanh thu đạt {total_rev:,.0f}. Nhận xét về biên lợi nhuận {margin:.1f}%. Chỉ ra các "Ngôi sao" trong danh mục sản phẩm và lý do chúng thành công.]</p>
            
            <h3 style="color: #f43f5e;">🚀 Dự báo & Khuyến nghị Chiến lược</h3>
            <ul>
                <li><strong>Ngắn hạn:</strong> [Hành động cụ thể dựa trên tồn kho và trend hiện tại, ví dụ: đẩy mạnh marketing sản phẩm X do tin tức thị trường tốt]</li>
                <li><strong>Dài hạn:</strong> [Đề xuất mở rộng hoặc cắt giảm dựa trên xu hướng thị trường 2024-2025]</li>
                <li><strong>Rủi ro:</strong> [Cảnh báo rủi ro cụ thể của ngành hàng này, ví dụ: rủi ro cạnh tranh từ đối thủ mới, hoặc rủi ro vĩ mô]</li>
            </ul>
        </div>
        """

        # Chuẩn bị dữ liệu gửi cho AI
        usr_msg = json.dumps({
            "Tổng doanh thu": total_rev,
            "Tổng lợi nhuận": total_profit,
            "Biên lợi nhuận (%)": margin,
            "Top sản phẩm chủ lực": top_products
        }, ensure_ascii=False, cls=CustomJsonEncoder)

        # Gọi AI (Tăng nhiệt độ lên 0.7 để AI sáng tạo hơn)
        html_response = client.chat.completions.create(
            model=GROQ_MODEL_ID,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": f"Dữ liệu chi tiết:\n{usr_msg}"}
            ],
            temperature=0.7, # Sáng tạo hơn, bớt máy móc
            max_tokens=2500
        ).choices[0].message.content

        # Làm sạch output
        html_response = html_response.replace("```html", "").replace("```", "").strip()
        
        return jsonify({"html_content": html_response})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/user_info", methods=["GET"])
def user_info():
    if current_user.is_authenticated:
        return jsonify({"authenticated": True, "username": current_user.username})
    return jsonify({"authenticated": False})

# --- TABLES API ENDPOINT ---
@app.route("/api/tables", methods=["POST"])
def tables_endpoint():
    """
    API để lấy các bảng phân tích chi tiết từ session
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        session_id = data.get("session_id", "")
        table_type = data.get("table_type", "all")  # all, product_inventory, sales_summary, profit_analysis, category_overview, brand_performance
        
        if not session_id:
            return jsonify({"error": "Missing session_id parameter"}), 400
        
        # Lấy context từ session hoặc database
        context = {}
        try:
            if session_id.startswith("db_") and current_user.is_authenticated:
                rec = db.session.get(Analysis, int(session_id.split("_")[1]))
                if rec:
                    context = json.loads(rec.result_json)
            else:
                context = TEMP_SESSIONS.get(session_id, {})
        except Exception as ctx_err:
            return jsonify({"error": f"Session context error: {str(ctx_err)}"}), 400
        
        tables = context.get('tables', {})
        
        if not tables:
            return jsonify({"error": "No tables data found for this session"}), 400
        
        # Trả về bảng yêu cầu
        if table_type == "all":
            return jsonify({
                "product_inventory": tables.get('product_inventory', []),
                "sales_summary": tables.get('sales_summary', []),
                "profit_analysis": tables.get('profit_analysis', []),
                "category_overview": tables.get('category_overview', []),
                "brand_performance": tables.get('brand_performance', [])
            })
        else:
            # Lấy bảng cụ thể
            table_data = tables.get(table_type, [])
            if not table_data:
                return jsonify({"error": f"Table '{table_type}' not found"}), 404
            
            return jsonify({
                table_type: table_data
            })
    
    except Exception as e:
        print(f"Tables endpoint error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/logout", methods=["POST"])
def logout_endpoint():
    logout_user()
    return jsonify({"message": "Logged out"})

if __name__ == "__main__":
    with app.app_context(): db.create_all()
    app.run(host="0.0.0.0", port=5000, debug=True)