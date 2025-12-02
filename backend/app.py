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

# ==============================================================================
# --- CẤU HÌNH API KEY & MODEL ---
# ==============================================================================
MY_GEMINI_KEY = "AIzaSyCtG7w6Yk4ubvbom83Nwm7e5txmCXLFpb8"
GEMINI_MODEL_ID = "gemini-2.0-flash" 

app = Flask(__name__, static_folder="../frontend", static_url_path="/")

# --- KẾT NỐI GEMINI AI ---
GEMINI_AVAILABLE = False
client = None

try:
    from google import genai
    final_api_key = MY_GEMINI_KEY or os.environ.get("GEMINI_API_KEY")
    
    if final_api_key:
        client = genai.Client(api_key=final_api_key)
        GEMINI_AVAILABLE = True
        print(f">>> Google GenAI (New SDK) Active! Model: {GEMINI_MODEL_ID}")
    else:
        print(">>> Chưa cấu hình Gemini Key.")
except ImportError:
    print(">>> Lỗi: Chưa cài thư viện 'google-genai'.")
except Exception as e:
    print(f"Lỗi khởi tạo Gemini: {e}")

# --- IMPORT MODULE LOGIC ---
try:
    import analyzer
    import recommendations
except ImportError:
    print("Cảnh báo: Thiếu file analyzer.py hoặc recommendations.py")

# --- CẤU HÌNH APP ---
app.config['SECRET_KEY'] = 'datana-super-secret-key' 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024 

CORS(app)
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- DATABASE MODELS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)

class Analysis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    filename = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    result_json = db.Column(db.Text)

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

TEMP_SESSIONS = {}
ALLOWED_EXTENSIONS = {'csv', 'xlsx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ==============================================================================
# --- ROUTES HỆ THỐNG ---
# ==============================================================================
@app.route("/")
def index(): return send_from_directory(app.static_folder, "index.html")
@app.route("/pages/<path:path>")
def serve_pages(path): return send_from_directory(os.path.join(app.static_folder, "pages"), path)
@app.route("/images/<path:path>")
def serve_images(path): return send_from_directory(os.path.join(app.static_folder, "images"), path)
@app.route("/css/<path:path>")
def serve_css(path): return send_from_directory(os.path.join(app.static_folder, "css"), path)
@app.route("/js/<path:path>")
def serve_js(path): return send_from_directory(os.path.join(app.static_folder, "js"), path)

@app.route("/api/sample")
def download_sample():
    sample_path = os.path.join(app.config['UPLOAD_FOLDER'], 'sample_data.csv')
    if not os.path.exists(sample_path):
        try:
            with open(sample_path, 'w', encoding='utf-8') as f:
                f.write("Ngày,Sản phẩm,Khu vực,Doanh thu,Lợi nhuận,Số lượng\n")
                f.write("2025-01-01,Áo Thun,Hà Nội,500000,200000,5\n")
                f.write("2025-01-02,Quần Jean,HCM,1200000,600000,3\n")
        except: pass
    if os.path.exists(sample_path): return send_file(sample_path, as_attachment=True, download_name="DATANA_Sample.csv")
    return "Not found", 404

# ==============================================================================
# --- ROUTES AUTH ---
# ==============================================================================
@app.route("/api/register", methods=["POST"])
def register():
    try:
        data = request.json
        if User.query.filter_by(username=data.get('username')).first():
            return jsonify({"error": "Tên đăng nhập tồn tại"}), 400
        hashed = generate_password_hash(data.get('password'), method='pbkdf2:sha256')
        new_user = User(username=data.get('username'), password=hashed)
        db.session.add(new_user); db.session.commit()
        return jsonify({"message": "OK"}), 200
    except: return jsonify({"error": "Error"}), 500

@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.json
        user = User.query.filter_by(username=data.get('username')).first()
        if user and check_password_hash(user.password, data.get('password')):
            login_user(user)
            return jsonify({"message": "OK", "username": user.username}), 200
        return jsonify({"error": "Fail"}), 401
    except: return jsonify({"error": "Error"}), 500

@app.route("/api/logout")
def logout(): logout_user(); return jsonify({"message": "OK"}), 200

@app.route("/api/user_info")
def user_info():
    if current_user.is_authenticated: return jsonify({"logged_in": True, "username": current_user.username})
    return jsonify({"logged_in": False})

# ==============================================================================
# --- CORE: PHÂN TÍCH ---
# ==============================================================================
@app.route("/analyze", methods=["POST"])
def analyze_endpoint():
    df = None; filename = "data"
    try:
        sheet_url = request.form.get('sheet_url'); file = request.files.get('file')
        
        if sheet_url:
            match = re.search(r'/d/([a-zA-Z0-9-_]+)', sheet_url)
            if match:
                csv_url = f"https://docs.google.com/spreadsheets/d/{match.group(1)}/export?format=csv"
                df = pd.read_csv(csv_url); filename = "GoogleSheet"
            else: return jsonify({"error": "Link Google Sheet không hợp lệ"}), 400
            
        elif file and file.filename:
            filename = secure_filename(file.filename)
            path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(path)
            if filename.lower().endswith('.csv'): df = pd.read_csv(path)
            else: df = pd.read_excel(path)
            os.remove(path) 
        
        if df is None or df.empty: return jsonify({"error": "Dữ liệu trống"}), 400

        (stats, time_ana, prod_ana, reg_ana, cust_ana, top, rev_m, prod_met, raw, cols, smart_sum) = analyzer.analyze_data(df)
        
        recs = recommendations.generate_recommendations(stats, reg_ana.get('revenue_by_region',{}), top, rev_m, prod_met)
        
        res_data = {
            "statistics": stats, "time_analysis": time_ana, "product_analysis": prod_ana,
            "region_analysis": reg_ana, "top_products": top, "recommendations": recs,
            "raw_data": raw, "columns": cols, "filename": filename,
            "smart_summary": smart_sum,
            "analyzed_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        }
        
        sid = str(uuid.uuid4())
        if current_user.is_authenticated:
            db.session.add(Analysis(user_id=current_user.id, filename=filename, result_json=json.dumps(res_data)))
            db.session.commit()
            last_rec = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.id.desc()).first()
            sid = f"db_{last_rec.id}"
        else:
            TEMP_SESSIONS[sid] = res_data
            
        res_data['session_id'] = sid
        return jsonify(res_data), 200
    except Exception as e: 
        print(f"Analyze Error: {e}")
        return jsonify({"error": str(e)}), 500

# ==============================================================================
# --- API AI: DỰ BÁO & CHAT (ĐÃ FIX LỖI HTML THỪA) ---
# ==============================================================================

@app.route("/api/forecast", methods=["POST"])
def forecast_endpoint():
    try:
        data = request.json; sid = data.get("session_id")
        ctx = {}
        if sid:
            if sid.startswith("db_") and current_user.is_authenticated:
                rec = db.session.get(Analysis, int(sid.split("_")[1]))
                if rec: ctx = json.loads(rec.result_json)
            else: ctx = TEMP_SESSIONS.get(sid, {})
        
        raw = ctx.get('raw_data', [])
        if not raw: return jsonify({"error": "Không có dữ liệu"}), 400
        
        df = pd.DataFrame(raw)
        preview = df.head(5).to_string(index=False)
        
        if GEMINI_AVAILABLE and client:
            # Prompt chặt chẽ hơn: YÊU CẦU CHỈ TRẢ VỀ HTML
            prompt = f"""
            Bạn là CPO (Giám đốc chiến lược). Dựa vào 5 dòng mẫu:
            {preview}
            
            Hãy: 
            1. Dự đoán xu hướng. 
            2. Phân tích SWOT.
            
            QUAN TRỌNG:
            - Chỉ trả về mã HTML (các thẻ <h3>, <p>, <ul>, <li>, <b>).
            - KHÔNG được dùng Markdown (```html).
            - KHÔNG được có lời dẫn đầu hay kết thúc.
            - Chỉ trả về nội dung chính.
            """
            response = client.models.generate_content(model=GEMINI_MODEL_ID, contents=prompt)
            
            # Vệ sinh lại dữ liệu đầu ra (Xóa markdown nếu AI vẫn cố tình thêm vào)
            clean_html = response.text.replace("```html", "").replace("```", "").strip()
            
            return jsonify({"html_content": clean_html})
            
        return jsonify({"html_content": "AI chưa sẵn sàng."})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route("/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.json; msg = data.get("message", ""); sid = data.get("session_id")
        ctx = {}
        if sid:
            if sid.startswith("db_") and current_user.is_authenticated:
                rec = db.session.get(Analysis, int(sid.split("_")[1]))
                if rec: ctx = json.loads(rec.result_json)
            else: ctx = TEMP_SESSIONS.get(sid, {})
            
        raw_data = ctx.get('raw_data', [])
        stats = ctx.get('statistics', {})
        
        if not raw_data: return jsonify({"assistant": "⚠️ Chưa có dữ liệu."})

        df_preview = pd.DataFrame(raw_data).head(20)
        data_str = df_preview.to_string(index=False)
        total_rev = stats.get('total_revenue', 0)
        
        if GEMINI_AVAILABLE and client:
            prompt = f"""
            Bạn là trợ lý dữ liệu. 
            Dữ liệu mẫu (20 dòng):
            {data_str}
            Tổng doanh thu: {total_rev:,.0f}
            
            Câu hỏi: "{msg}"
            Trả lời ngắn gọn, trực tiếp, dùng tiếng Việt. Không hiện code python.
            """
            response = client.models.generate_content(model=GEMINI_MODEL_ID, contents=prompt)
            return jsonify({"assistant": response.text})
            
        return jsonify({"assistant": "Offline mode."})
    except Exception as e: return jsonify({"assistant": str(e)})

if __name__ == "__main__":
    with app.app_context(): db.create_all()
    print(">>> Server DATANA đang chạy...")
    app.run(host="0.0.0.0", port=5000, debug=True)