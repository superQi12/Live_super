import os
import tempfile
import time
import logging
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
from werkzeug.utils import secure_filename

# إعداد التطبيق
app = Flask(__name__)
CORS(app)  # السماح بالطلبات من أي مصدر

# إعداد السجلات
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# إعدادات التطبيق
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 ميجابايت
ALLOWED_EXTENSIONS = {"webm", "mp4", "avi", "mov"}
TELEGRAM_API_BASE = "https://api.telegram.org/bot"

def allowed_file(filename):
    """التحقق من امتداد الملف المسموح"""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def send_to_telegram(bot_token, chat_id, file_path, caption=""):
    """إرسال ملف فيديو إلى تليجرام"""
    try:
        url = f"{TELEGRAM_API_BASE}{bot_token}/sendVideo"
        
        with open(file_path, "rb") as video_file:
            files = {"video": video_file}
            data = {
                "chat_id": chat_id,
                "caption": caption,
                "supports_streaming": True
            }
            
            response = requests.post(url, files=files, data=data, timeout=30)
            
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                return True, "تم إرسال الفيديو بنجاح"
            else:
                return False, result.get("description", "خطأ غير معروف من تليجرام")
        else:
            return False, f"HTTP {response.status_code}: {response.text}"
            
    except requests.exceptions.Timeout:
        return False, "انتهت مهلة الاتصال مع تليجرام"
    except requests.exceptions.RequestException as e:
        return False, f"خطأ في الشبكة: {str(e)}"
    except Exception as e:
        return False, f"خطأ غير متوقع: {str(e)}"

def test_telegram_connection(bot_token, chat_id):
    """اختبار الاتصال مع بوت تليجرام"""
    try:
        # اختبار صحة البوت
        url = f"{TELEGRAM_API_BASE}{bot_token}/getMe"
        response = requests.get(url, timeout=10)
        
        if response.status_code != 200:
            return False, "رمز البوت غير صحيح"
            
        bot_info = response.json()
        if not bot_info.get("ok"):
            return False, "رمز البوت غير صالح"
        
        # اختبار إرسال رسالة
        url = f"{TELEGRAM_API_BASE}{bot_token}/sendMessage"
        data = {
            "chat_id": chat_id,
            "text": "🎥 تم اختبار الاتصال بنجاح! البوت جاهز لاستقبال البث المباشر."
        }
        
        response = requests.post(url, data=data, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                bot_name = bot_info["result"]["first_name"]
                return True, f"تم الاتصال بالبوت \'{bot_name}\' بنجاح"
            else:
                return False, result.get("description", "معرف المحادثة غير صحيح")
        else:
            return False, f"فشل في إرسال رسالة اختبار: HTTP {response.status_code}"
            
    except requests.exceptions.Timeout:
        return False, "انتهت مهلة الاتصال مع تليجرام"
    except requests.exceptions.RequestException as e:
        return False, f"خطأ في الشبكة: {str(e)}"
    except Exception as e:
        return False, f"خطأ غير متوقع: {str(e)}"

@app.route("/")
def index():
    """الصفحة الرئيسية"""
    return jsonify({
        "message": "خادم البث المباشر للشاشة إلى تليجرام",
        "status": "active",
        "version": "1.0.0",
        "endpoints": {
            "upload_chunk": "/api/stream/upload_chunk",
            "test_connection": "/api/stream/test_connection",
            "stream_status": "/api/stream/stream_status"
        }
    })

@app.route("/api/stream/stream_status", methods=["GET"])
def stream_status():
    """الحصول على حالة الخادم"""
    return jsonify({
        "success": True,
        "status": "active",
        "server_time": datetime.now().isoformat(),
        "max_file_size_mb": MAX_FILE_SIZE / (1024 * 1024),
        "supported_formats": list(ALLOWED_EXTENSIONS)
    })

@app.route("/api/stream/test_connection", methods=["POST"])
def test_connection():
    """اختبار الاتصال مع بوت تليجرام"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "error": "لم يتم إرسال بيانات JSON"
            }), 400
        
        bot_token = data.get("bot_token", "").strip()
        chat_id = data.get("chat_id", "").strip()
        
        if not bot_token or not chat_id:
            return jsonify({
                "success": False,
                "error": "رمز البوت ومعرف المحادثة مطلوبان"
            }), 400
        
        success, message = test_telegram_connection(bot_token, chat_id)
        
        if success:
            logger.info(f"اختبار اتصال ناجح للبوت: {bot_token[:10]}...")
            return jsonify({
                "success": True,
                "message": message
            })
        else:
            logger.warning(f"فشل اختبار الاتصال: {message}")
            return jsonify({
                "success": False,
                "error": message
            }), 400
            
    except Exception as e:
        logger.error(f"خطأ في اختبار الاتصال: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"خطأ في الخادم: {str(e)}"
        }), 500

@app.route("/api/stream/upload_chunk", methods=["POST"])
def upload_chunk():
    """استقبال ومعالجة جزء فيديو من البث المباشر"""
    try:
        # التحقق من وجود الملف
        if "video_chunk" not in request.files:
            return jsonify({
                "success": False,
                "error": "لم يتم إرسال ملف فيديو"
            }), 400
        
        file = request.files["video_chunk"]
        if file.filename == "":
            return jsonify({
                "success": False,
                "error": "لم يتم اختيار ملف"
            }), 400
        
        # الحصول على البيانات الإضافية
        chunk_id = request.form.get("chunk_id", "unknown")
        bot_token = request.form.get("bot_token", "").strip()
        chat_id = request.form.get("chat_id", "").strip()
        timestamp = request.form.get("timestamp", str(int(time.time())))
        
        if not bot_token or not chat_id:
            return jsonify({
                "success": False,
                "error": "رمز البوت ومعرف المحادثة مطلوبان"
            }), 400
        
        # التحقق من حجم الملف
        file.seek(0, 2)  # الانتقال إلى نهاية الملف
        file_size = file.tell()
        file.seek(0)  # العودة إلى بداية الملف
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({
                "success": False,
                "error": f"حجم الملف كبير جداً. الحد الأقصى: {MAX_FILE_SIZE / (1024 * 1024):.1f} ميجابايت"
            }), 400
        
        if file_size == 0:
            return jsonify({
                "success": False,
                "error": "الملف فارغ"
            }), 400
        
        # التحقق من نوع الملف
        if not allowed_file(file.filename):
            return jsonify({
                "success": False,
                "error": f"نوع الملف غير مدعوم. الأنواع المدعومة: {", ".join(ALLOWED_EXTENSIONS)}"
            }), 400
        
        # حفظ الملف مؤقتاً
        filename = secure_filename(file.filename)
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"chunk_{chunk_id}_{timestamp}_{filename}")
        
        try:
            file.save(temp_path)
            logger.info(f"تم حفظ الجزء {chunk_id} مؤقتاً: {temp_path} ({file_size / 1024:.1f} KB)")
            
            # إرسال إلى تليجرام
            caption = f"🎥 جزء البث #{chunk_id}\n📅 {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n📊 الحجم: {file_size / 1024:.1f} KB"
            
            success, message = send_to_telegram(bot_token, chat_id, temp_path, caption)
            
            if success:
                logger.info(f"تم إرسال الجزء {chunk_id} إلى تليجرام بنجاح")
                return jsonify({
                    "success": True,
                    "message": f"تم إرسال الجزء {chunk_id} بنجاح",
                    "chunk_id": chunk_id,
                    "file_size": file_size,
                    "timestamp": timestamp
                })
            else:
                logger.error(f"فشل إرسال الجزء {chunk_id} إلى تليجرام: {message}")
                return jsonify({
                    "success": False,
                    "error": f"فشل في إرسال الجزء إلى تليجرام: {message}"
                }), 500
                
        finally:
            # حذف الملف المؤقت
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    logger.info(f"تم حذف الملف المؤقت: {temp_path}")
            except Exception as e:
                logger.warning(f"فشل في حذف الملف المؤقت {temp_path}: {str(e)}")
        
    except Exception as e:
        logger.error(f"خطأ في معالجة الجزء: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"خطأ في الخادم: {str(e)}"
        }), 500

@app.errorhandler(413)
def request_entity_too_large(error):
    """معالج خطأ حجم الطلب الكبير"""
    return jsonify({
        "success": False,
        "error": f"حجم الملف كبير جداً. الحد الأقصى: {MAX_FILE_SIZE / (1024 * 1024):.1f} ميجابايت"
    }), 413

@app.errorhandler(404)
def not_found(error):
    """معالج خطأ الصفحة غير موجودة"""
    return jsonify({
        "success": False,
        "error": "الصفحة المطلوبة غير موجودة"
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """معالج خطأ الخادم الداخلي"""
    return jsonify({
        "success": False,
        "error": "خطأ داخلي في الخادم"
    }), 500

if __name__ == "__main__":
    # تشغيل التطبيق
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)


