from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import os
from werkzeug.utils import secure_filename
from analyzer import analyze_data
from recommendations import generate_recommendations

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'xlsx', 'csv', 'xls'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Last analysis stored server-side (no per-user sessions)
LAST_ANALYSIS = None

# Server limits
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_session(req):
    return None, None

def require_auth(req):
    return None


# Login/register/logout removed. App no longer requires auth for analyze/chat.


@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        # No auth required: accept file and analyze

        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({'error': 'Không có file trong request'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'File không có tên'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'Định dạng file không hỗ trợ. Chỉ chấp nhận .xlsx, .csv, .xls'}), 400

        # Save file
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # Read and analyze data
        try:
            if filename.lower().endswith('.csv'):
                df = pd.read_csv(filepath)
            else:
                df = pd.read_excel(filepath)
        except Exception as e:
            # cleanup
            try:
                os.remove(filepath)
            except Exception:
                pass
            return jsonify({'error': f'Lỗi đọc file: {str(e)}'}), 400

        # Analyze data (returns expanded structures)
        (statistics,
         time_analysis,
         product_analysis,
         region_analysis,
         customer_analysis,
         top_products,
         revenue_by_month,
         product_metrics,
         raw_data,
         columns) = analyze_data(df)

        # Generate recommendations (pass expanded data)
        recommendations = generate_recommendations(
            statistics,
            region_analysis.get('revenue_by_region', {}),
            top_products,
            revenue_by_month,
            product_metrics
        )
        # Store last analysis in server memory for chat access
        global LAST_ANALYSIS
        LAST_ANALYSIS = {
            'statistics': statistics,
            'time_analysis': time_analysis,
            'product_analysis': product_analysis,
            'region_analysis': region_analysis,
            'customer_analysis': customer_analysis,
            'top_products': top_products,
            'revenue_by_month': revenue_by_month,
            'product_metrics': product_metrics
        }
        # Clean up uploaded file
        try:
            os.remove(filepath)
        except Exception:
            pass

        return jsonify({
            'statistics': statistics,
            'time_analysis': time_analysis,
            'product_analysis': product_analysis,
            'region_analysis': region_analysis,
            'customer_analysis': customer_analysis,
            'top_products': top_products,
            'revenue_by_month': revenue_by_month,
            'product_metrics': product_metrics,
            'recommendations': recommendations,
            'raw_data': raw_data,
            'columns': columns
        })

    except Exception as e:
        return jsonify({'error': f'Lỗi server: {str(e)}'}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'OK'}), 200


@app.route('/chat', methods=['POST'])
def chat():
    """Simple rule-based chat over the last analysis stored in session.

    Expects JSON {"message": "..."} and Authorization header.
    Returns {"reply": "..."}
    """
    try:
        payload = request.get_json(force=True)
        msg = (payload.get('message') or '').strip()
        if not msg:
            return jsonify({'reply': 'Vui lòng nhập câu hỏi.'}), 400

        analysis = LAST_ANALYSIS
        # If no analysis available
        if not analysis:
            return jsonify({'reply': 'Chưa có dữ liệu phân tích. Vui lòng tải file lên và phân tích trước khi hỏi.'}), 200

        # Very simple intent parsing
        q = msg.lower()
        reply = ''

        # Check revenue month question
        if 'doanh thu' in q and 'tháng' in q:
            import re
            m = re.search(r'tháng\s*(\d{1,2})', q)
            months = analysis.get('revenue_by_month', {})
            if m and months:
                mm = m.group(1).zfill(2)
                # try to find month key ending with -MM
                cand = None
                for k in months.keys():
                    if k.endswith('-'+mm) or k.endswith('/'+mm) or k == mm:
                        cand = k
                if cand:
                    val = months.get(cand, 0)
                    # compare to previous
                    keys = list(months.keys())
                    if cand in keys:
                        idx = keys.index(cand)
                        if idx > 0:
                            prevk = keys[idx-1]
                            prevv = months.get(prevk,0)
                            if prevv>0:
                                change = (val - prevv)/prevv*100
                                reply = f"Doanh thu {cand} là {int(val):,} VNĐ, {'tăng' if change>=0 else 'giảm'} {abs(change):.0f}% so với {prevk}."
                            else:
                                reply = f"Doanh thu {cand} là {int(val):,} VNĐ."   
                        else:
                            reply = f"Doanh thu {cand} là {int(val):,} VNĐ."
                else:
                    # fallback: give last month
                    if months:
                        k = list(months.keys())[-1]
                        v = months[k]
                        reply = f"Doanh thu gần nhất ({k}) là {int(v):,} VNĐ." 
            else:
                reply = 'Không tìm thấy dữ liệu doanh thu theo tháng.'

        # Ask about why revenue dropped
        elif ('tại sao' in q or 'tại sao doanh thu' in q or 'tại sao' in q) and 'giảm' in q:
            months = analysis.get('revenue_by_month', {})
            if len(months) >= 2:
                keys = list(months.keys())
                last = months[keys[-1]]
                prev = months[keys[-2]]
                change = (last - prev)/prev*100 if prev>0 else 0
                # try to find region causing drop
                region = analysis.get('region_analysis', {}).get('revenue_by_region', {})
                worst_region = None
                if region:
                    sorted_r = sorted(region.items(), key=lambda x: x[1])
                    worst_region = sorted_r[0][0]
                reasons = []
                if change < -5:
                    reasons.append(f"Doanh thu giảm {abs(change):.0f}% so với tháng trước.")
                if worst_region:
                    reasons.append(f"Doanh thu giảm chủ yếu ở khu vực {worst_region}.")
                reasons.append('Nguyên nhân có thể: giảm nhu cầu mùa vụ, chiến dịch quảng cáo kết thúc, hoặc vấn đề tồn kho.')
                reply = ' '.join(reasons)
            else:
                reply = 'Không đủ dữ liệu thời gian để xác định nguyên nhân giảm doanh thu.'

        # Ask which product to advertise
        elif ('quảng cáo' in q or 'chạy qc' in q or 'nên chạy' in q) and 'sản phẩm' in q:
            tops = analysis.get('top_products', [])
            if tops:
                p = tops[0]
                reply = f"Nên tập trung quảng cáo cho '{p.get('name')}', hiện đứng top về doanh thu ({int(p.get('revenue',0)):,} VNĐ). Thử tăng budget cho campaigns liên quan đến sản phẩm này." 
            else:
                reply = 'Không có dữ liệu sản phẩm để gợi ý.'

        # Ask for product suggestions
        elif 'sản phẩm' in q or 'top sản phẩm' in q:
            tops = analysis.get('top_products', [])
            if tops:
                names = [t.get('name') for t in tops[:5]]
                reply = f"Top sản phẩm: {', '.join(names)}. Có thể ưu tiên tồn kho và marketing cho các sản phẩm này." 
            else:
                reply = 'Không có dữ liệu sản phẩm.'

        else:
            # generic fallback: summarize top 3 insights from recommendations
            recs = generate_recommendations(
                analysis.get('statistics', {}),
                analysis.get('region_analysis', {}).get('revenue_by_region', {}),
                analysis.get('top_products', []),
                analysis.get('revenue_by_month', {}),
                analysis.get('product_metrics', {})
            )
            # pick a few short lines
            picks = []
            for key in ['overall_strategy','marketing_suggestions','product_suggestions','region_suggestions']:
                arr = recs.get(key, [])
                if arr:
                    picks.append(arr[0])
            if picks:
                reply = ' '.join(picks[:3])
            else:
                reply = 'Mình chưa thể trả lời chính xác. Vui lòng hỏi cụ thể hơn về doanh thu, sản phẩm hoặc khu vực.'

        return jsonify({'reply': reply}), 200

    except Exception as e:
        return jsonify({'reply': f'Lỗi server: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
