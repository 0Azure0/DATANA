from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import os
import uuid
import pandas as pd
import json

# ==============================================================================
# --- CẤU HÌNH NGƯỜI DÙNG (BẠN CHỈ CẦN SỬA Ở ĐÂY) ---
# ==============================================================================

# BƯỚC 1: Dán API Key Gemini của bạn vào giữa hai dấu ngoặc kép bên dưới.
# Lấy key tại: https://aistudio.google.com/app/apikey
# Ví dụ: MY_GEMINI_KEY = "AIzaSy..."
MY_GEMINI_KEY = "AIzaSyCKQOVgJGK15b1_qzOzgQBZqphHvZI5qjk" 

# ==============================================================================

app = Flask(__name__, static_folder="../frontend", static_url_path="/")

# --- IMPORT MODULE PHÂN TÍCH ---
try:
    import analyzer
    import recommendations
except ImportError:
    print("CẢNH BÁO: Thiếu file analyzer.py hoặc recommendations.py")

# --- CẤU HÌNH KẾT NỐI AI (GOOGLE GEMINI) ---
try:
    import google.generativeai as genai
    
    # Ưu tiên lấy key từ biến cấu hình ở trên, nếu không có thì thử tìm trong biến môi trường
    final_api_key = MY_GEMINI_KEY if "DÁN_KEY" not in MY_GEMINI_KEY else os.environ.get("GEMINI_API_KEY")

    # Kiểm tra xem Key có hợp lệ không
    if not final_api_key or "DÁN_KEY" in final_api_key:
        print("\n" + "="*50)
        print(" THÔNG BÁO: CHƯA CÓ API KEY GEMINI")
        print(" -> Hệ thống sẽ chạy ở chế độ OFFLINE (Trả lời theo kịch bản).")
        print(" -> Để bật AI: Hãy dán Key vào dòng 17 trong file app.py")
        print("="*50 + "\n")
        model = None
        GEMINI_AVAILABLE = False
    else:
        # Cấu hình thành công
        genai.configure(api_key=final_api_key)
        # Sử dụng model Gemini 1.5 Flash (nhanh và hiệu quả) hoặc Gemini Pro
        model = genai.GenerativeModel('gemini-1.5-flash')
        GEMINI_AVAILABLE = True
        print(f">>> Đã kết nối Google Gemini thành công! (Key starts with {final_api_key[:8]}...)")

except Exception as e:
    print(f"Lỗi khởi tạo Gemini: {e}")
    print("Gợi ý: Hãy chạy 'pip install google-generativeai'")
    model = None
    GEMINI_AVAILABLE = False

# --- CẤU HÌNH APP ---
app.config['SECRET_KEY'] = 'datana-secret-key-123' 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

CORS(app)
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- DATABASE MODEL ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    # Cập nhật cú pháp mới cho SQLAlchemy 2.0+ (db.session.get)
    return db.session.get(User, int(user_id))

# --- KHỞI TẠO THƯ MỤC ---
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

USER_SESSIONS = {}
ALLOWED_EXTENSIONS = {'csv', 'xlsx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- ROUTES GIAO DIỆN ---
@app.route("/")
def index():
    if not os.path.exists(os.path.join(app.static_folder, "index.html")):
        return "Frontend chưa được build hoặc sai đường dẫn static_folder", 404
    return send_from_directory(app.static_folder, "index.html")

@app.route("/pages/<path:path>")
def serve_pages(path):
    return send_from_directory(os.path.join(app.static_folder, "pages"), path)

# --- ROUTES AUTH ---
@app.route("/api/register", methods=["POST"])
def register():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Tên đăng nhập đã tồn tại"}), 400

        hashed_pw = generate_password_hash(password, method='pbkdf2:sha256')
        new_user = User(username=username, password=hashed_pw)
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": "Đăng ký thành công!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password, password):
            login_user(user)
            return jsonify({"message": "Đăng nhập thành công", "username": user.username}), 200
        return jsonify({"error": "Sai tên đăng nhập hoặc mật khẩu"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Đã đăng xuất"}), 200

@app.route("/api/user_info")
def user_info():
    if current_user.is_authenticated:
        return jsonify({"logged_in": True, "username": current_user.username})
    return jsonify({"logged_in": False})

# --- ROUTES PHÂN TÍCH ---
@app.route("/analyze", methods=["POST"])
def analyze_endpoint():
    if 'file' not in request.files: return jsonify({"error": "Missing file"}), 400
    file = request.files['file']
    if file.filename == '' or not allowed_file(file.filename): return jsonify({"error": "Invalid file"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    try:
        if filename.lower().endswith('.csv'): df = pd.read_csv(filepath)
        else: df = pd.read_excel(filepath)
        
        # Gọi module phân tích
        (statistics, time_analysis, product_analysis, region_analysis,
         customer_analysis, top_products, revenue_by_month,
         product_metrics, raw_data, columns) = analyzer.analyze_data(df)

        # Gọi module gợi ý
        recs = recommendations.generate_recommendations(
            statistics,
            region_analysis.get('revenue_by_region', {}),
            top_products,
            revenue_by_month,
            product_metrics
        )
        
        # Lưu Session
        session_id = str(uuid.uuid4())
        USER_SESSIONS[session_id] = {
            "statistics": statistics,
            "time_analysis": time_analysis,
            "top_products": top_products,
            "revenue_by_month": revenue_by_month,
            "recommendations": recs,
            "filename": filename
        }
        
        try: os.remove(filepath)
        except: pass

        return jsonify({
            "session_id": session_id,
            "statistics": statistics,
            "time_analysis": time_analysis,
            "product_analysis": product_analysis, 
            "region_analysis": region_analysis,
            "customer_analysis": customer_analysis,
            "top_products": top_products,
            "revenue_by_month": revenue_by_month,
            "product_metrics": product_metrics,
            "recommendations": recs,
            "raw_data": raw_data,
            "columns": columns
        }), 200

    except Exception as e:
        print(f"Lỗi phân tích: {e}")
        return jsonify({"error": f"Lỗi server: {str(e)}"}), 500

# --- ROUTES CHAT (SỬ DỤNG GEMINI) ---
@app.route("/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.json
        message = data.get("message", "").strip()
        session_id = data.get("session_id")
        
        if not message:
            return jsonify({"assistant": "Vui lòng nhập câu hỏi."}), 400
            
        # Lấy dữ liệu Context
        session_data = USER_SESSIONS.get(session_id, {})
        data_stats = session_data.get("statistics", {}) 
        top_products = session_data.get("top_products", [])
        recs = session_data.get("recommendations", [])

        # --- XỬ LÝ RECS (Nếu là Dictionary thì gộp lại thành list) ---
        final_recs_list = []
        if isinstance(recs, dict):
            for content in recs.values():
                if isinstance(content, list):
                    final_recs_list.extend(content)
                elif isinstance(content, str):
                    final_recs_list.append(content)
        elif isinstance(recs, list):
            final_recs_list = recs
        
        # 1. ƯU TIÊN GỌI GEMINI API (ONLINE MODE)
        if GEMINI_AVAILABLE and model:
            try:
                # Tạo chuỗi context ngắn gọn cho AI
                context_str = f"""
                Dữ liệu kinh doanh hiện tại:
                - Tổng doanh thu: {data_stats.get('total_revenue', 0):,} VNĐ
                - Lợi nhuận: {data_stats.get('total_profit', 0):,} VNĐ
                - Top sản phẩm: {', '.join([str(p['name']) for p in top_products[:5]])}
                - Gợi ý đã có: {'; '.join(final_recs_list[:5]) if final_recs_list else 'Không có'}
                """
                
                # Cấu trúc prompt cho Gemini
                prompt = f"""
                Bạn là chuyên gia phân tích dữ liệu (Data Analyst). 
                Dựa vào thông tin sau:
                {context_str}
                
                Hãy trả lời câu hỏi của người dùng một cách ngắn gọn, súc tích và hữu ích.
                Câu hỏi: {message}
                """
                
                # Gọi Gemini API
                response = model.generate_content(prompt)
                ai_reply = response.text
                return jsonify({"assistant": ai_reply}), 200

            except Exception as e:
                print(f"Lỗi gọi Gemini API: {e}")
                # Nếu lỗi mạng hoặc hết quota -> Tự động trôi xuống phần Offline
                pass 
        
        # 2. FALLBACK (OFFLINE MODE)
        lower_msg = message.lower()
        
        # Từ khóa thông minh
        suggestion_keywords = ["làm gì", "gợi ý", "đề xuất", "cải thiện", "chiến lược", "kế hoạch", "tư vấn"]
        revenue_keywords = ["doanh thu", "tiền", "bán được"]
        product_keywords = ["sản phẩm", "bán chạy", "top"]
        profit_keywords = ["lợi nhuận", "lãi"]

        prefix = "(Chế độ Offline) " if not GEMINI_AVAILABLE else ""

        if any(k in lower_msg for k in revenue_keywords):
            rev = data_stats.get('total_revenue', 0)
            return jsonify({"assistant": f"{prefix}💰 Tổng doanh thu là: **{rev:,.0f} VNĐ**."}), 200
        
        elif any(k in lower_msg for k in product_keywords):
            prods = [str(p['name']) for p in top_products]
            return jsonify({"assistant": f"{prefix}🏆 Top sản phẩm bán chạy nhất: **{', '.join(prods)}**."}), 200
        
        elif any(k in lower_msg for k in profit_keywords):
            prof = data_stats.get('total_profit', 0)
            return jsonify({"assistant": f"{prefix}📈 Tổng lợi nhuận đạt được: **{prof:,.0f} VNĐ**."}), 200
        
        elif any(k in lower_msg for k in suggestion_keywords):
            if final_recs_list:
                # Hiển thị tối đa 5 gợi ý đầu tiên để tránh quá dài
                recs_text = "\n".join([f"- {r}" for r in final_recs_list[:5]])
                return jsonify({"assistant": f"{prefix}💡 Dựa trên dữ liệu, tôi đề xuất:\n{recs_text}"}), 200
            else:
                return jsonify({"assistant": f"{prefix}Tôi cần thêm dữ liệu để đưa ra lời khuyên cụ thể."}), 200
        
        return jsonify({"assistant": f"{prefix}Xin lỗi, tôi chưa hiểu ý bạn. Bạn có thể hỏi về: Doanh thu, Lợi nhuận, Sản phẩm bán chạy hoặc Gợi ý chiến lược."}), 200

    except Exception as e:
        print(f"Lỗi Chat Endpoint: {e}")
        return jsonify({"assistant": "Đã xảy ra lỗi hệ thống."}), 500

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        print(">>> Database ready!")
    app.run(host="0.0.0.0", port=5000, debug=True)