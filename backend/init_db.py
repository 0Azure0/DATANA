from app import app, db
import os

# Đảm bảo tạo thư mục instance nếu chưa có
if not os.path.exists('instance'):
    os.makedirs('instance')

with app.app_context():
    db.create_all()
    print("✅ Đã tạo file database.db thành công!")
    print(f"File nằm tại: {os.path.join(os.getcwd(), 'instance', 'database.db')}")