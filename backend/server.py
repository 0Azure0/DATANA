"""
server.py — lightweight wrapper to run existing Flask app in `app.py`.
This file simply imports the Flask `app` from `backend/app.py` and runs it.
"""
from app import app

if __name__ == '__main__':
    # run on 0.0.0.0:5000 (same as before)
    app.run(debug=True, host='0.0.0.0', port=5000)
