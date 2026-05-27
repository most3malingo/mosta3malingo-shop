// ===========================
// 1. Firebase Configuration
// ===========================
const firebaseConfig = {
    apiKey: "AIzaSyBSQQBbrWoZfVlj-0TjHGj8uSuR6b7b-qM",
    authDomain: "most3malinjo.firebaseapp.com",
    projectId: "most3malinjo",
    messagingSenderId: "1080056902628",
    appId: "1:1080056902628:web:6ab1965773094d84314df1",
    measurementId: "G-BEWNQG7Z5J"
};

const IMGBB_API_KEY = "e8fa9eaa0f2c79d033eca70dfd2a45fd"; 

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// ===========================
// 2. State & User ID
// ===========================
const AppState = {
    products: [],
    adminLoggedIn: false,
    currentCompData: null 
};
let editingProductId = null;
let competitionInterval = null;

// إنشاء كود سري فريد لكل زائر لتحديد الفائز بدقة
let myUserId = localStorage.getItem('most3malinjo_uid');
if(!myUserId) {
    myUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('most3malinjo_uid', myUserId);
}

// ===========================
// 3. Helper Functions & Image Compression
// ===========================
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTimeDiff(diff) {
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// دالة ضغط الصور الذكية لتقليل الحجم إلى كيلوبايتات لتسريع الموقع
function compressImage(file, maxWidth = 800, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

// دالة رفع الصور المباشرة على ImgBB
async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
    const data = await response.json();
    if (data.success) return data.data.url;
    else throw new Error("فشل رفع الصورة، تأكد من اتصال الإنترنت");
}

// ===========================
// 4. Competition Logic 
// ===========================
function setupCompetitionListener() {
    db.collection("settings").doc("competition").onSnapshot((doc) => {
        const compSection = document.getElementById('competitionSection');
        if (!doc.exists) {
            compSection.style.display = 'none';
            return;
        }

        const data = doc.data();
        AppState.currentCompData = data;

        if (!data.active) {
            compSection.style.display = 'none';
            if(competitionInterval) clearInterval(competitionInterval);
            return;
        }

        compSection.style.display = 'block';
        document.getElementById('compMysteryImage').src = data.image; // إظهار الصورة في كل الحالات
        
        // تشغيل العداد وتحديث الشاشة بناءً على الوقت
        if(competitionInterval) clearInterval(competitionInterval);
        competitionInterval = setInterval(() => updateCompetitionUI(data), 1000);
        updateCompetitionUI(data); 
    });
}

function updateCompetitionUI(data) {
    const now = Date.now();
    const start = data.startTime;
    const end = data.endTime;

    document.querySelectorAll('.comp-state').forEach(el => el.style.display = 'none');

    if (now < start) {
        // قبل البداية
        document.getElementById('compPreStart').style.display = 'block';
        document.getElementById('compTimerStart').textContent = formatTimeDiff(start - now);
    } 
    else if (now >= start && now < end) {
        // وقت اللعب الفعلي (إخفاء النتيجة حتى لو شخص جاوب صح في الخلفية)
        document.getElementById('compActive').style.display = 'block';
        document.getElementById('compTimerEnd').textContent = formatTimeDiff(end - now);

        const initialBlur = data.initialBlur || 50; 
        const blurDropPerInterval = data.blurDrop || 5; 
        const minutesPassed = (now - start) / (1000 * 60);
        const intervalsPassed = Math.floor(minutesPassed / data.blurInterval);
        
        let currentBlur = initialBlur - (intervalsPassed * blurDropPerInterval);
        if (currentBlur < 0) currentBlur = 0; 

        document.getElementById('compMysteryImage').style.filter = `blur(${currentBlur}px)`;
    } 
    else if (now >= end) {
        // انتهى الوقت! الآن نظهر النتائج
        if(competitionInterval) clearInterval(competitionInterval);
        
        if (data.winnerName) {
            if(data.winnerUID === myUserId) {
                document.getElementById('compWinnerOnly').style.display = 'block';
                document.getElementById('winnerProductImg').src = data.image;
                document.getElementById('winnerProductNameOnly').textContent = data.winnerGuess;
                if(data.winnerImage) document.querySelector('.winner-action-box').style.display = 'none';
            } else {
                document.getElementById('compPublicWinner').style.display = 'block';
                document.getElementById('publicWinnerName').textContent = data.winnerName;
                document.getElementById('publicWinnerGuess').textContent = data.winnerGuess;
                document.getElementById('publicProductImg').src = data.image;
                if(data.winnerImage) document.getElementById('publicWinnerAvatar').src = data.winnerImage;
            }
        } else {
            // محدش كسب
            document.getElementById('compTimeUp').style.display = 'block';
        }
    }
}

// ===========================
// 5. Products Logic
// ===========================
function setupFirebaseListeners() {
    db.collection("products").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        const grid = document.getElementById('productsGrid');
        if (!snapshot.empty) {
            AppState.products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            grid.innerHTML = ''; 
            renderProducts();
            if (AppState.adminLoggedIn) renderAdminProducts();
        } else {
            grid.innerHTML = '<p style="text-align:center;">لا توجد منتجات حالياً</p>';
        }
    });
}

function renderProducts() {
    document.getElementById('productsGrid').innerHTML = AppState.products.map(p => `
        <div class="product-card">
            <img src="${p.image || 'https://via.placeholder.com/300'}" class="product-image">
            <div class="product-info">
                <h3>${sanitizeHTML(p.name)}</h3>
                <p>${sanitizeHTML(p.description)}</p>
                <div class="product-price">${formatCurrency(p.price)} EGP</div>
            </div>
        </div>
    `).join('');
}

function renderAdminProducts() {
    document.getElementById('adminProductsList').innerHTML = AppState.products.map(p => `
        <div style="border-bottom:1px solid #ccc; padding:15px; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${p.image || ''}" style="width:40px; height:40px; object-fit:cover; border-radius:5px;">
                <div><b>${sanitizeHTML(p.name)}</b><br><small>${formatCurrency(p.price)} EGP</small></div>
            </div>
            <div>
                <button class="btn" onclick="startEditProduct('${p.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

window.startEditProduct = function(id) {
    const p = AppState.products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('productName').value = p.name;
    document.getElementById('productDescription').value = p.description;
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productImage').value = p.image || ''; 
    
    const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
    submitBtn.textContent = "تحديث المنتج";
    submitBtn.style.backgroundColor = "#28a745"; 
    editingProductId = id;
    document.getElementById('adminPanel').style.display = 'block';
}

window.deleteProduct = function(id) {
    if(confirm('هل تريد حذف هذا المنتج؟')) {
        db.collection("products").doc(id).delete().then(() => alert('تم الحذف')).catch(err => alert(err.message));
    }
}

function resetForm() {
    document.getElementById('addProductForm').reset();
    editingProductId = null;
    document.querySelector('#addProductForm button[type="submit"]').textContent = "إضافة المنتج";
    document.querySelector('#addProductForm button[type="submit"]').style.backgroundColor = "";
}

auth.onAuthStateChanged(user => {
    if (user && user.email) {
        AppState.adminLoggedIn = true;
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        renderAdminProducts(); 
    } else {
        AppState.adminLoggedIn = false;
        document.getElementById('adminLogin').style.display = 'block';
        document.getElementById('adminDashboard').style.display = 'none';
    }
});

// ===========================
// 6. Event Listeners & Admin Actions
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    setupFirebaseListeners();
    setupCompetitionListener(); 

    // التحكم في لوحة الأدمن المخفية
    const mobileTrigger = document.getElementById('footerDate'); 
    let tapCount = 0; let tapTimer = null;
    if (mobileTrigger) {
        mobileTrigger.addEventListener('click', () => {
            tapCount++;
            if (tapCount >= 7) { document.getElementById('adminPanel').style.display = 'block'; tapCount = 0; }
            clearTimeout(tapTimer);
            tapTimer = setTimeout(() => { tapCount = 0; }, 1000);
        });
    }
    document.addEventListener('keydown', e => { if(e.ctrlKey && e.shiftKey && e.key === 'A') document.getElementById('adminPanel').style.display = 'block'; });
    document.getElementById('adminClose').onclick = () => { document.getElementById('adminPanel').style.display = 'none'; resetForm(); };
    document.getElementById('adminLoginForm').onsubmit = (e) => {
        e.preventDefault();
        auth.signInWithEmailAndPassword(document.getElementById('adminEmail').value, document.getElementById('adminPassword').value).catch(err => alert(err.message));
    };
    document.getElementById('adminLogout').onclick = () => auth.signOut().then(() => document.getElementById('adminPanel').style.display = 'none');

    // أدمن: معاينة البلور فورياً وتحديث اللوحة المباشرة
    const compImageFileInput = document.getElementById('compImageFileAdmin');
    const compInitialBlurInput = document.getElementById('compInitialBlurAdmin');
    const adminPreviewImg = document.getElementById('adminImagePreview');

    function updateAdminPreview() {
        const blurValue = compInitialBlurInput.value || 50;
        if (compImageFileInput.files && compImageFileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                adminPreviewImg.src = e.target.result;
                adminPreviewImg.style.display = 'inline-block';
                adminPreviewImg.style.filter = `blur(${blurValue}px)`;
            }
            reader.readAsDataURL(compImageFileInput.files[0]);
        } else if (AppState.currentCompData && AppState.currentCompData.image) {
            adminPreviewImg.src = AppState.currentCompData.image;
            adminPreviewImg.style.display = 'inline-block';
            adminPreviewImg.style.filter = `blur(${blurValue}px)`;
        }
    }
    compImageFileInput.addEventListener('change', updateAdminPreview);
    compInitialBlurInput.addEventListener('input', updateAdminPreview);

    // أدمن: إضافة منتج جديد وضغطه تلقائياً لـ ImgBB
    document.getElementById('addProductForm').onsubmit = (e) => {
        e.preventDefault();
        const productData = { 
            name: document.getElementById('productName').value, 
            description: document.getElementById('productDescription').value, 
            price: parseFloat(document.getElementById('productPrice').value), 
            createdAt: editingProductId ? AppState.products.find(p => p.id === editingProductId).createdAt : Date.now()
        };
        const fileInput = document.getElementById('productImageFile');
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');

        const saveToDb = (data) => {
            if(editingProductId) db.collection("products").doc(editingProductId).update(data).then(() => { resetForm(); alert("تم التحديث ✅"); });
            else db.collection("products").add(data).then(() => { resetForm(); alert("تمت الإضافة ✅"); });
        };

        if (fileInput.files[0]) {
            submitBtn.textContent = "جاري ضغط ورفع الصورة..."; submitBtn.disabled = true;
            compressImage(fileInput.files[0], 800, 0.6)
                .then(compressedFile => uploadToImgBB(compressedFile))
                .then(url => { productData.image = url; submitBtn.textContent = "إضافة المنتج"; submitBtn.disabled = false; saveToDb(productData); })
                .catch(err => { submitBtn.textContent = "إضافة المنتج"; submitBtn.disabled = false; alert(err.message); });
        } else {
            productData.image = document.getElementById('productImage').value;
            saveToDb(productData);
        }
    };

    // أدمن: إطلاق المسابقة وحفظ إعدادات التغبيش المخصصة
    document.getElementById('competitionAdminForm').onsubmit = (e) => {
        e.preventDefault();
        const startStr = document.getElementById('compStartTimeAdmin').value;
        const endStr = document.getElementById('compEndTimeAdmin').value;
        const validNamesArr = document.getElementById('compValidNamesAdmin').value.split(',').map(item => item.trim());
        const blurInterval = document.getElementById('compBlurIntervalAdmin').value;
        const initialBlur = parseInt(document.getElementById('compInitialBlurAdmin').value) || 50;
        const blurDrop = parseInt(document.getElementById('compBlurDropAdmin').value) || 5;

        const fileInput = document.getElementById('compImageFileAdmin');
        const submitBtn = document.querySelector('#competitionAdminForm button[type="submit"]');

        if (!fileInput.files[0] && (!AppState.currentCompData || !AppState.currentCompData.image)) { alert("يجب اختيار صورة!"); return; }

        submitBtn.textContent = "جاري الضغط والرفع..."; submitBtn.disabled = true;

        const saveComp = (imageUrl) => {
            db.collection("settings").doc("competition").set({
                active: true,
                startTime: new Date(startStr).getTime(),
                endTime: new Date(endStr).getTime(),
                image: imageUrl,
                validNames: validNamesArr,
                blurInterval: parseInt(blurInterval),
                initialBlur: initialBlur,
                blurDrop: blurDrop,
                winnerName: null, winnerGuess: null, winnerUID: null, winnerImage: null
            }).then(() => { alert("تم إطلاق المسابقة بنجاح! 🚀"); submitBtn.textContent = "إطلاق المسابقة 🚀"; submitBtn.disabled = false; })
            .catch(err => { alert(err.message); submitBtn.disabled = false; });
        };

        if (fileInput.files[0]) {
            compressImage(fileInput.files[0], 1000, 0.7) // دقة أعلى قليلاً لتناسب تأثير البلور
                .then(compressedFile => uploadToImgBB(compressedFile))
                .then(url => saveComp(url))
                .catch(err => { alert(err.message); submitBtn.disabled = false; });
        } else saveComp(AppState.currentCompData.image);
    };

    document.getElementById('stopCompBtn').onclick = () => {
        if(confirm('إيقاف المسابقة؟')) db.collection("settings").doc("competition").update({ active: false }).then(() => alert('تم الإيقاف'));
    };

// مستخدم: إرسال التخمين (محاولة واحدة فقط لكل مسابقة)
    document.getElementById('guessForm').onsubmit = (e) => {
        e.preventDefault();
        if (!AppState.currentCompData) return;

        // بنعمل مفتاح سري في المتصفح مربوط بوقت المسابقة دي تحديداً
        // عشان لما تعمل مسابقة جديدة، المفتاح يتغير والناس تقدر تشارك تاني
        const compId = AppState.currentCompData.startTime; 
        const guessStorageKey = 'most3malinjo_guessed_' + compId;

        // بنتحقق: هل الزائر ده استهلك محاولته في المسابقة دي؟
        if (localStorage.getItem(guessStorageKey)) {
            alert("لقد استنفدت محاولتك الوحيدة 🚨! لا يمكنك التخمين مرة أخرى، انتظر إعلان النتيجة.");
            return;
        }

        const guessName = document.getElementById('guessFullName').value.trim();
        const guessValue = document.getElementById('guessValue').value.trim().toLowerCase();
        const validArr = AppState.currentCompData.validNames;

        let isCorrect = validArr.some(valid => guessValue.includes(valid.toLowerCase()) || valid.toLowerCase().includes(guessValue));

        // التحقق في الخلفية بدون علم المستخدم
        if (isCorrect) {
            // لو الإجابة صح ومحدش كسب قبله، نسجله في صمت كفائز
            if (!AppState.currentCompData.winnerName) {
                db.collection("settings").doc("competition").update({
                    winnerName: guessName,
                    winnerGuess: guessValue,
                    winnerUID: myUserId 
                });
            }
        }

        // --- الإجراء الموحد للجميع (صح أو خطأ) ---
        
        // 1. تسجيل إن الزائر استهلك محاولته للأبد في هذه المسابقة
        localStorage.setItem(guessStorageKey, 'true');
        
        // 2. تفريغ الحقول
        document.getElementById('guessForm').reset();
        
        // 3. إظهار الرسالة الموحدة
        alert("تم إرسال إجابتك بنجاح! سيتم إعلان النتيجة فور انتهاء العداد ⏳");
    };

    // فائز: رفع الصورة الشخصية وضغطها بشدة لتوفير المساحة
    document.getElementById('winnerPhotoForm').onsubmit = (e) => {
        e.preventDefault();
        const file = document.getElementById('winnerPhotoFile').files[0];
        const btn = document.querySelector('#winnerPhotoForm button');
        
        btn.textContent = "جاري الرفع..."; btn.disabled = true;
        compressImage(file, 400, 0.5) // أبعاد صغيرة ومناسبة للأفاتار الشخصي
            .then(compressedFile => uploadToImgBB(compressedFile))
            .then(url => {
                db.collection("settings").doc("competition").update({ winnerImage: url })
                .then(() => { alert("تم رفع صورتك بنجاح! ستظهر الآن لجميع الزوار ✨"); });
            }).catch(err => { alert("حدث خطأ في الرفع"); btn.textContent = "رفع الصورة"; btn.disabled = false; });
    };

    // نموذج تواصل معنا (متأمن عشان ميوقفش باقي الأكواد لو مش موجود في الـ HTML)
    const contactFormEl = document.getElementById('contactForm');
    if (contactFormEl) {
        contactFormEl.onsubmit = (e) => {
            e.preventDefault();
            db.collection("messages").add({
                name: document.getElementById('contactName').value, contact: document.getElementById('contactEmail').value,
                message: document.getElementById('contactMessage').value, timestamp: Date.now()
            }).then(() => {
                const msgDiv = document.getElementById('formMessage');
                if(msgDiv) { msgDiv.textContent = 'تم الإرسال بنجاح!'; msgDiv.className = 'form-message success'; }
                contactFormEl.reset(); 
                if(msgDiv) setTimeout(() => msgDiv.style.display='none', 5000);
            });
        };
    }

    // نافذة عرض وتكبير الصور (Zoom)
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    let currentZoom = 1;

    if (modal && modalImg) {
        document.addEventListener('click', (e) => {
            // لو الزائر داس على أي صورة في الموقع (ما عدا اللغز والمودال)
            if (e.target.tagName === 'IMG' && 
                e.target.id !== 'compMysteryImage' && 
                e.target.id !== 'modalImage' && 
                e.target.id !== 'adminImagePreview') { 
                
                e.preventDefault(); 
                modal.style.display = "block"; 
                modalImg.src = e.target.src; 
                currentZoom = 1; 
                modalImg.style.transform = `scale(1)`; 
            }
            
            // قفل النافذة لو داس على علامة X أو داس برة الصورة
            if (e.target.classList.contains('close-modal') || e.target.classList.contains('image-modal')) {
                modal.style.display = "none";
            }
        });

        // تشغيل الزووم ببكرة الماوس جوه النافذة
        modalImg.addEventListener('wheel', (e) => {
            e.preventDefault(); 
            currentZoom += e.deltaY < 0 ? 0.1 : -0.1;
            if(currentZoom < 0.5) currentZoom = 0.5; 
            if(currentZoom > 5) currentZoom = 5;
            modalImg.style.transform = `scale(${currentZoom})`;
        });
    }

}); // دي قفلة الـ DOMContentLoaded الأساسيةالأساسية






