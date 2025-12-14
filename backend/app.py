from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime, UTC # IMPORT MỚI
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
MY_GROQ_KEY = os.environ.get("GROQ_API_KEY", "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") 
GROQ_MODEL_ID = "llama-3.3-70b-versatile" 
GROQ_TITLE_MODEL_ID = "llama-3.1-8b-instant" 

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

CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5000", "http://127.0.0.1:5001", "http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    },
    r"/analyze": {
        "origins": ["http://localhost:5000", "http://127.0.0.1:5001", "http://localhost:3000"],
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
    title = db.Column(db.String(255), nullable=False, default='Phân tích Dữ liệu Mới')
    # FIX: Sử dụng datetime.now(UTC) thay cho utcnow()
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(UTC)) 

class ChatHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) 
    session_id = db.Column(db.String(255), nullable=False) 
    sender = db.Column(db.String(10), nullable=False) 
    message = db.Column(db.Text, nullable=False)
    # FIX: Sử dụng datetime.now(UTC) thay cho utcnow()
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(UTC))

@login_manager.user_loader
def load_user(uid): return db.session.get(User, int(uid))

if not os.path.exists(app.config['UPLOAD_FOLDER']): os.makedirs(app.config['UPLOAD_FOLDER'])

TEMP_SESSIONS = {}
TEMP_CHAT_HISTORY = {} 

# --- HÀM TÌM KIẾM GOOGLE (THÊM VÀO ĐÂY) ---
def search_google_trends(keyword):
    if not keyword or keyword == "Không rõ": return "Không có thông tin."
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        res = requests.post(url, data={'q': f"phân tích thị trường {keyword} việt nam 2025"}, headers=headers, timeout=10) 
        soup = BeautifulSoup(res.text, 'html.parser')
        
        results = []
        for a in soup.find_all('a', class_='result__a', limit=3):
            title = a.get_text(strip=True)
            results.append(title)
            
        return "\n".join(results) if results else "Không tìm thấy tin tức cụ thể."
    except Exception as e: return f"Lỗi tìm kiếm: Lỗi hệ thống khi tìm kiếm tin tức."

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

# Hàm gọi AI để tóm tắt tiêu đề
def generate_chat_title(chat_history_messages):
    """Sử dụng mô hình AI để tóm tắt lịch sử trò chuyện thành tiêu đề ngắn."""
    if not GROQ_AVAILABLE: return "Phiên trò chuyện mới"
    
    recent_messages = chat_history_messages[-10:] 
    context = "\n".join([f"{m['sender']}: {m['message']}" for m in recent_messages])
    
    sys_msg = """Bạn là một chuyên gia tóm tắt. Dựa vào lịch sử trò chuyện được cung cấp, hãy tạo ra một TIÊU ĐỀ NGẮN GỌN (tối đa 6 từ, bằng tiếng Việt) để mô tả nội dung chính của phiên thảo luận. 
    Tiêu đề PHẢI liên quan đến phân tích kinh doanh.
    Ví dụ: 'Phân tích Doanh số Q3', 'Chiến lược Thương hiệu X', 'Dự báo Lợi nhuận'.
    Chỉ trả lời bằng tiêu đề, không thêm bất kỳ văn bản giải thích nào khác."""
    
    try:
        title = client.chat.completions.create(
            model=GROQ_TITLE_MODEL_ID, 
            messages=[
                {"role":"system","content":sys_msg},
                {"role":"user","content":f"Lịch sử trò chuyện:\n{context}"}
            ],
            temperature=0.3, max_tokens=20
        ).choices[0].message.content.strip().replace('"', '')
        return title
    except Exception as e:
        print(f"Error generating title: {e}")
        return "Phiên trò chuyện Mới"

# Hàm lấy và cập nhật thông tin phiên
def get_session_metadata(session_id):
    """Lấy bản ghi Analysis hoặc data dict của Guest và tiêu đề hiện tại."""
    if session_id.startswith("db_") and current_user.is_authenticated:
        analysis_id = int(session_id.split("_")[1])
        rec = db.session.get(Analysis, analysis_id)
        if rec:
            return rec, rec.title, rec.filename
    elif session_id in TEMP_SESSIONS:
        session_data = TEMP_SESSIONS.get(session_id, {})
        title = session_data.get('title', 'Phân tích Dữ liệu Mới')
        filename = session_data.get('filename', 'Tệp chưa tên')
        return session_data, title, filename
    return None, 'Phân tích Dữ liệu Mới', 'Tệp chưa tên'

def set_session_title(session_id, new_title):
    """Cập nhật tiêu đề phiên (cho DB hoặc TEMP_SESSIONS)."""
    if session_id.startswith("db_") and current_user.is_authenticated:
        analysis_id = int(session_id.split("_")[1])
        rec = db.session.get(Analysis, analysis_id)
        if rec:
            rec.title = new_title
            db.session.commit()
    elif session_id in TEMP_SESSIONS:
        TEMP_SESSIONS[session_id]['title'] = new_title

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

# --- ROUTE MỚI: TẠO PHIÊN TRÒ CHUYỆN MỚI ---
@app.route("/api/new_session", methods=["POST"])
def new_session_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        # Lấy session ID cũ để biết context của file nào đang được sử dụng
        old_session_id = data.get("current_session_id", None)
        
        if not old_session_id:
            return jsonify({"error": "Missing current_session_id"}), 400

        # Lấy bản ghi Analysis hoặc data dict của session cũ
        old_rec_or_data, _, old_filename = get_session_metadata(old_session_id)
        
        if not old_rec_or_data:
            return jsonify({"error": "Session ID cũ không hợp lệ hoặc hết hạn"}), 404

        new_session_id = str(uuid.uuid4())
        initial_title = f"Phân tích: {old_filename}"
        
        if current_user.is_authenticated and old_session_id.startswith("db_"):
            # Lấy Analysis Record cũ
            old_analysis_id = int(old_session_id.split("_")[1])
            old_analysis_rec = db.session.get(Analysis, old_analysis_id)
            
            # Tạo bản ghi Analysis mới bằng cách CLONE dữ liệu phân tích (result_json)
            new_analysis = Analysis(
                user_id=current_user.id,
                filename=old_analysis_rec.filename,
                result_json=old_analysis_rec.result_json, # Giữ nguyên dữ liệu phân tích
                title=initial_title, # Reset tiêu đề
                timestamp=datetime.now(UTC) # FIX: Sử dụng datetime.now(UTC)
            )
            db.session.add(new_analysis)
            db.session.commit()
            
            new_session_id = f"db_{new_analysis.id}"
            
            # Xóa tất cả ChatHistory cũ của session mới tạo (nếu có)
            # Không cần, vì ChatHistory chỉ được tạo sau khi chat.
            
        else:
            # Xử lý Guest: Clone dữ liệu phân tích (result_json) sang session mới
            # TEMP_SESSIONS[sid] lưu trữ dict chứa native types (đã chuyển đổi từ result_json)
            new_session_data = old_rec_or_data.copy()
            new_session_data['title'] = initial_title
            new_session_data['filename'] = old_filename
            
            TEMP_SESSIONS[new_session_id] = new_session_data
            
            # Đảm bảo xóa lịch sử chat cũ của session mới này
            if new_session_id in TEMP_CHAT_HISTORY:
                del TEMP_CHAT_HISTORY[new_session_id]

        return jsonify({
            "success": True, 
            "new_session_id": new_session_id,
            "title": initial_title
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Lỗi tạo phiên mới: {str(e)}"}), 500
# -----------------------------------------------------

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
        
        smart_summary = data_tuple[10]
        # FIX TYPO: Thay thế smart_sum bằng smart_summary
        brand_analysis = smart_summary.get('brand', {})
        category_analysis = smart_summary.get('category', {})
        product_details = smart_summary.get('product_details', [])
        
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
            "tables": {
                "product_inventory": product_inventory_table,
                "sales_summary": sales_summary_table,
                "profit_analysis": profit_analysis_table,
                "category_overview": category_overview_table,
                "brand_performance": brand_performance_table
            }
        }
        
        sid = str(uuid.uuid4())
        json_res = json.dumps(res, cls=CustomJsonEncoder) 
        
        initial_title = f"Phân tích: {f.filename}"
        
        if current_user.is_authenticated:
            db.session.add(Analysis(
                user_id=current_user.id, 
                filename=f.filename, 
                result_json=json_res,
                title=initial_title, 
                timestamp=datetime.now(UTC) # FIX: Sử dụng datetime.now(UTC)
            ))
            db.session.commit()
            last = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.id.desc()).first()
            sid = f"db_{last.id}"
            res['title'] = last.title 
        else: 
            res_dict = json.loads(json_res)
            res_dict['title'] = initial_title 
            res_dict['filename'] = f.filename 
            TEMP_SESSIONS[sid] = res_dict 
            res['title'] = res_dict['title']
            
        res['session_id'] = sid
        return jsonify(res)
    except Exception as e: 
        traceback.print_exc()
        return jsonify({"error":str(e)}),500

# --- CHAT ENDPOINT (CẬP NHẬT: TẠO VÀ CẬP NHẬT TIÊU ĐỀ) ---
@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        if not data: return jsonify({"error": "No JSON data provided"}), 400
        
        message = data.get("message", "").strip()
        session_id = data.get("session_id", "")
        
        if not message: return jsonify({"error": "Message is empty"}), 400
        
        is_authenticated = current_user.is_authenticated
        user_id = current_user.id if is_authenticated else None

        context = {}
        try:
            if session_id.startswith("db_") and is_authenticated:
                rec = db.session.get(Analysis, int(session_id.split("_")[1]))
                if rec:
                    context = json.loads(rec.result_json)
            else:
                context = TEMP_SESSIONS.get(session_id, {})
        except:
            pass

        # 1. LƯU TIN NHẮN NGƯỜI DÙNG
        if is_authenticated:
            db.session.add(ChatHistory(user_id=user_id, session_id=session_id, sender='user', message=message))
            db.session.commit()
        elif session_id:
            if session_id not in TEMP_CHAT_HISTORY:
                TEMP_CHAT_HISTORY[session_id] = []
            TEMP_CHAT_HISTORY[session_id].append({'sender': 'user', 'message': message, 'timestamp': datetime.now(UTC).isoformat()}) # FIX: Sử dụng datetime.now(UTC)
        
        current_history = []
        if is_authenticated:
            history_records = ChatHistory.query.filter_by(session_id=session_id).order_by(ChatHistory.timestamp.asc()).all()
            current_history = [{'sender': r.sender, 'message': r.message} for r in history_records]
            current_history.append({'sender': 'user', 'message': message}) 
        elif session_id:
            current_history = TEMP_CHAT_HISTORY.get(session_id, [])

        
        # --- LOGIC RAG VÀ THỊ TRƯỜNG ---
        smart_sum = context.get('smart_summary', {})
        statistics = context.get('statistics', {})
        brand_analysis = smart_sum.get('brand', {})
        category_analysis = smart_sum.get('category', {})
        tables = context.get('tables', {})
        top_products = smart_sum.get('product_details', [])[:3]
        
        search_keyword = "thị trường kinh doanh"
        if top_products:
            search_keyword = top_products[0]['product']
        market_trends = search_google_trends(search_keyword)

        top_sales_info = ""
        sales_summary = tables.get('sales_summary', [])
        if sales_summary:
            for i, row in enumerate(sales_summary[:3]):
                try:
                    product = row.get('Product Name') or row.get('Product') or row.get('Item') or 'N/A'
                    revenue = row.get('Total Revenue') or row.get('Revenue') or row.get('Doanh thu') or 'N/A'
                    if isinstance(revenue, (int, float)):
                        revenue_formatted = f"{revenue:,.0f} VNĐ"
                    else:
                        revenue_formatted = str(revenue)
                    if product != 'N/A':
                        top_sales_info += f"- SP: {product}. Doanh thu: {revenue_formatted}\n"
                except:
                    continue
        
        if top_sales_info:
            top_sales_info = "\nTOP 3 SẢN PHẨM BÁN CHẠY (RAG):\n" + top_sales_info
        
        # --- SYSTEM PROMPT TỐI ƯU (EXPERT ROLE + CHAIN OF THOUGHT) ---
        system_prompt = f"""Bạn là Chuyên gia Tư vấn Chiến lược Kinh doanh Cao cấp (Senior Business Strategist).
Ngôn ngữ phản hồi: Tiếng Việt.
Nhiệm vụ: Cung cấp phân tích chiến lược, chính xác và có bằng chứng dựa trên Dữ liệu Nội bộ và Xu hướng Thị trường.

QUY TẮC TƯ DUY VÀ ĐẦU RA (Đảm bảo độ chuẩn xác cao nhất):
1. PHÂN TÍCH VAI TRÒ: Khi người dùng hỏi, hãy lập tức xác định xem câu hỏi liên quan đến Dữ liệu Nội bộ, Xu hướng Thị trường, hay cả hai.
2. SỬ DỤNG DỮ LIỆU: Luôn trả lời dựa trên thông tin trong các thẻ <DỮ_LIỆU_NỘI_BỘ> và <TIN_TỨC_THỊ_TRƯỜNG>. Tuyệt đối không suy đoán hay bịa đặt.
3. CHUẨN XÁC: Phân tích sâu sắc, sử dụng các số liệu (Tổng doanh thu, Biên lợi nhuận, TOP Performers) để làm bằng chứng cho nhận định của bạn.
4. ĐỊNH DẠNG: Phản hồi PHẢI được định dạng bằng Markdown (ví dụ: dùng **in đậm**, - danh sách) để dễ đọc.

TIN TỨC VÀ XU HƯỚNG THỊ TRƯỜNG LIÊN QUAN ĐẾN SẢN PHẨM "{search_keyword}":
<TIN_TỨC_THỊ_TRƯỜNG>
{market_trends}
</TIN_TỨC_THỊ_TRƯỜNG>

DỮ LIỆU NỘI BỘ TÓNG HỢP:
<DỮ_LIỆU_NỘI_BỘ>
- Tổng doanh thu: {statistics.get('total_revenue', 'N/A'):,.0f}
- Tổng lợi nhuận: {statistics.get('total_profit', 'N/A'):,.0f}
- Biên lợi nhuận: {smart_sum.get('average_margin', 'N/A')}%
- Top Brand: {', '.join(list(brand_analysis.keys())[:3]) if brand_analysis else 'N/A'}
- Top Category: {', '.join(list(category_analysis.keys())[:3]) if category_analysis else 'N/A'}
{top_sales_info}
</DỮ_LIỆU_NỘI_BỘ>
"""
        
        # Gọi AI
        response = call_ai_with_retry(system_prompt, message)

        # 2. LƯU TIN NHẮN TỪ AI
        if is_authenticated:
            db.session.add(ChatHistory(user_id=user_id, session_id=session_id, sender='ai', message=response))
            db.session.commit()
        elif session_id:
            TEMP_CHAT_HISTORY[session_id].append({'sender': 'ai', 'message': response, 'timestamp': datetime.now(UTC).isoformat()}) # FIX: Sử dụng datetime.now(UTC)
        
        # Cập nhật lịch sử (thêm tin nhắn AI vừa trả lời)
        if not is_authenticated and session_id:
             current_history = TEMP_CHAT_HISTORY.get(session_id, [])
        else:
             current_history.append({'sender': 'ai', 'message': response}) 

        # --- LOGIC TẠO TIÊU ĐỀ (CHỦ YẾU CHO LẦN CHAT ĐẦU TIÊN) ---
        rec_or_data, current_title, filename = get_session_metadata(session_id)
        
        is_default_title = current_title.startswith("Phân tích:") or current_title.startswith("Phiên trò chuyện")
        
        # Chỉ tạo tiêu đề nếu có ít nhất 2 cặp tin nhắn (User 1 + AI 1) và tiêu đề vẫn là mặc định
        if len(current_history) >= 2 and is_default_title: 
            new_title = generate_chat_title(current_history)
            if new_title and new_title != current_title:
                set_session_title(session_id, new_title)
                current_title = new_title 

        return jsonify({
            "assistant": response,
            "response": response,
            "session_id": session_id,
            "session_title": current_title 
        })
    
    except Exception as e:
        print(f"Chat error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# --- CẬP NHẬT ROUTE: CHAT HISTORY ENDPOINT ---
@app.route("/api/chat_history", methods=["POST"])
def chat_history_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        session_id_request = data.get("session_id", None) 
        
        response_sessions = []
        current_messages = []
        
        if current_user.is_authenticated:
            user_id = current_user.id
            
            analysis_records = Analysis.query.filter_by(user_id=user_id).order_by(Analysis.id.desc()).all()
            
            for record in analysis_records:
                response_sessions.append({
                    'session_id': f"db_{record.id}",
                    'title': record.title,
                    'filename': record.filename,
                    'created_at': record.timestamp.isoformat() if record.timestamp else None
                })
            
            if session_id_request and session_id_request.startswith("db_"):
                 current_messages = ChatHistory.query.filter_by(session_id=session_id_request).order_by(ChatHistory.timestamp.asc()).all()
                 current_messages = [{
                    'sender': record.sender,
                    'message': record.message,
                    'timestamp': record.timestamp.isoformat()
                } for record in current_messages]
                
            
        elif session_id_request:
            session_data = TEMP_SESSIONS.get(session_id_request, {})
            title = session_data.get('title', 'Phân tích Dữ liệu Mới')
            filename = session_data.get('filename', 'Tệp chưa tên')
            
            current_messages = TEMP_CHAT_HISTORY.get(session_id_request, [])
            
            response_sessions.append({
                'session_id': session_id_request,
                'title': title,
                'filename': filename,
                'created_at': datetime.now(UTC).isoformat() # FIX: Sử dụng datetime.now(UTC)
            })
        
        return jsonify({"sessions": response_sessions, "history": current_messages})

    except Exception as e:
        print(f"Chat History error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
# ----------------------------------------


@app.route("/api/forecast", methods=["POST"])
def forecast_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        if not data: return jsonify({"error": "Invalid JSON"}), 400
        
        sid = data.get("session_id")
        if not sid: return jsonify({"error": "Missing session_id"}), 400
        
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
        
        total_rev = statistics.get('total_revenue', 0)
        total_profit = statistics.get('total_profit', 0)
        margin = smart_sum.get('average_margin', 0)
        top_products = smart_sum.get('product_details', [])[:8] 
        
        sample_prods = ", ".join([p['product'] for p in top_products[:3]])

        if top_products:
            search_keyword = top_products[0]['product']
        else:
            search_keyword = "thị trường kinh doanh"
            
        market_trends = search_google_trends(search_keyword) 
        
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

        usr_msg = json.dumps({
            "Tổng doanh thu": total_rev,
            "Tổng lợi nhuận": total_profit,
            "Biên lợi nhuận (%)": margin,
            "Top sản phẩm chủ lực": top_products
        }, ensure_ascii=False, cls=CustomJsonEncoder)

        html_response = client.chat.completions.create(
            model=GROQ_MODEL_ID,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": f"Dữ liệu chi tiết:\n{usr_msg}"}
            ],
            temperature=0.7, 
            max_tokens=2500
        ).choices[0].message.content

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

@app.route("/api/tables", methods=["POST"])
def tables_endpoint():
    try:
        data = request.get_json(force=True, silent=True)
        if not data: return jsonify({"error": "No JSON data provided"}), 400
        
        session_id = data.get("session_id", "")
        table_type = data.get("table_type", "all") 
        
        if not session_id: return jsonify({"error": "Missing session_id parameter"}), 400
        
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
        
        if not tables: return jsonify({"error": "No tables data found for this session"}), 400
        
        if table_type == "all":
            return jsonify({
                "product_inventory": tables.get('product_inventory', []),
                "sales_summary": tables.get('sales_summary', []),
                "profit_analysis": tables.get('profit_analysis', []),
                "category_overview": tables.get('category_overview', []),
                "brand_performance": tables.get('brand_performance', [])
            })
        else:
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