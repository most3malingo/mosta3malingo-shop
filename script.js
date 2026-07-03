// ===========================
// 1. State & User ID
// ===========================
const AppState = {
    products: [],
    currentCompData: null
};

const UPLOAD_ENDPOINT = "https://most3malingo.shop/upload";
const API_ENDPOINT = "https://most3malingo.shop/api";

// إنشاء كود سري فريد لكل زائر لتحديد الفائز بدقة
let myUserId = localStorage.getItem('most3malinjo_uid');
if(!myUserId) {
    myUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('most3malinjo_uid', myUserId);
}

// ===========================
// 2. Helper Functions & Image Compression
// ===========================
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

// دالة رفع الصور على R2 عن طريق الـ Cloudflare Worker
async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: formData });
    const data = await response.json();
    if (response.ok && data.url) return data.url;
    else throw new Error(data.error || "فشل رفع الصورة، تأكد من اتصال الإنترنت");
}

// ===========================
// 3. زينة الاحتفال (بتشتغل مرة واحدة بس أول ما تكسب)
// ===========================
let celebrationFired = false;

function fireCelebration() {
    if (celebrationFired) return;
    celebrationFired = true;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.getElementById('celebrationCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const COLORS = ['#f1c40f', '#1abc9c', '#e74c3c', '#3498db', '#ffffff'];
    const pieces = [];
    for (let i = 0; i < 130; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 7;
        pieces.push({
            x: w / 2,
            y: h * 0.25,
            vx: Math.cos(angle) * speed * 0.7,
            vy: Math.sin(angle) * speed - 4,
            size: 4 + Math.random() * 6,
            rot: Math.random() * Math.PI,
            vrot: (Math.random() - 0.5) * 0.3,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            life: 0,
            maxLife: 170 + Math.random() * 25
        });
    }

    function tick() {
        ctx.clearRect(0, 0, w, h);
        let alive = false;

        for (let i = 0; i < pieces.length; i++) {
            const p = pieces[i];
            if (p.life > p.maxLife) continue;

            p.vy += 0.1;
            p.vx *= 0.992;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vrot;
            p.life++;

            const fade = 1 - Math.max(0, (p.life - p.maxLife * 0.6) / (p.maxLife * 0.4));
            if (fade <= 0 || p.y > h + 40) continue;
            alive = true;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = Math.max(0, Math.min(1, fade));
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
            ctx.restore();
        }

        if (alive) requestAnimationFrame(tick);
        else ctx.clearRect(0, 0, w, h);
    }
    tick();
}

// ===========================
// 4. Competition Logic
// ===========================
let competitionInterval = null;
let competitionEndTimeout = null;

function setupCompetitionListener() {
    async function loadAndRender() {
        let data = null;
        try {
            const res = await fetch(API_ENDPOINT + '/competition');
            data = await res.json();
        } catch (e) {
            data = null;
        }

        if (!data) {
            document.getElementById('competitionSection').style.display = 'none';
            return;
        }
        AppState.currentCompData = data;
        renderCompetition(data);
        scheduleEndCheck(data);
    }

    // بدل الـ Polling المستمر، بنجيب البيانات مرة واحدة بس عند فتح الصفحة،
    // وبنحدد Timeout واحد بالظبط لحظة انتهاء المسابقة عشان نتأكد فيها هل
    // حد كسب ولا لأ. العدّاد نفسه بيتحسب محليًا كل ثانية من غير أي طلب.
    function scheduleEndCheck(data) {
        if (competitionEndTimeout) clearTimeout(competitionEndTimeout);
        if (!data.active || !data.end_time) return;

        const msUntilEnd = new Date(data.end_time).getTime() - Date.now();
        if (msUntilEnd > 0) {
            competitionEndTimeout = setTimeout(loadAndRender, msUntilEnd + 500);
        }
    }

    loadAndRender();
}

function renderCompetition(data) {
    const compSection = document.getElementById('competitionSection');

    if (!data.active) {
        compSection.style.display = 'none';
        if (competitionInterval) clearInterval(competitionInterval);
        return;
    }

    compSection.style.display = 'block';
    document.getElementById('compMysteryImage').src = data.image; // إظهار الصورة في كل الحالات

    // عرض الجائزة الحقيقية بوضوح (منفصلة تمامًا عن صورة اللغز المبلورة)
    document.getElementById('prizeShowcaseImg').src = data.product_image || '';
    document.getElementById('prizeShowcaseName').textContent = data.product_name || '';

    // تشغيل العداد وتحديث الشاشة بناءً على الوقت
    if (competitionInterval) clearInterval(competitionInterval);
    competitionInterval = setInterval(() => updateCompetitionUI(data), 1000);
    updateCompetitionUI(data);
}

function updateCompetitionUI(data) {
    const now = Date.now();
    const start = new Date(data.start_time).getTime();
    const end = new Date(data.end_time).getTime();

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

        const initialBlur = data.initial_blur || 50;
        const blurDropPerInterval = data.blur_drop || 5;
        const minutesPassed = (now - start) / (1000 * 60);
        const intervalsPassed = Math.floor(minutesPassed / data.blur_interval);

        let currentBlur = initialBlur - (intervalsPassed * blurDropPerInterval);
        if (currentBlur < 0) currentBlur = 0;

        document.getElementById('compMysteryImage').style.filter = `blur(${currentBlur}px)`;
    }
    else if (now >= end) {
        // انتهى الوقت! الآن نظهر النتائج
        if (competitionInterval) clearInterval(competitionInterval);

        if (data.winner_name) {
            if (data.winner_uid === myUserId) {
                document.getElementById('compWinnerOnly').style.display = 'block';
                fireCelebration();
                document.getElementById('winnerProductImg').src = data.image;
                document.getElementById('winnerWonProductImg').src = data.product_image;
                document.getElementById('winnerProductNameOnly').textContent = data.product_name;
                if (data.winner_image) {
                    document.querySelector('.winner-action-box').style.display = 'none';
                    document.getElementById('winnerOwnPhoto').src = data.winner_image;
                    document.getElementById('winnerPhotoUploaded').style.display = 'block';
                }
            } else {
                document.getElementById('compPublicWinner').style.display = 'block';
                document.getElementById('publicWinnerName').textContent = data.winner_name;
                document.getElementById('publicWinnerGuess').textContent = data.product_name;
                document.getElementById('publicProductImg').src = data.image;
                document.getElementById('publicWonProductImg').src = data.product_image;
                if (data.winner_image) document.getElementById('publicWinnerAvatar').src = data.winner_image;
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
function setupProductsListener() {
    async function loadProducts() {
        const grid = document.getElementById('productsGrid');
        let data = null;
        try {
            const res = await fetch(API_ENDPOINT + '/products');
            data = await res.json();
        } catch (e) {
            data = null;
        }

        if (!data) {
            grid.innerHTML = '<p style="text-align:center;">حصل خطأ في تحميل المنتجات</p>';
            return;
        }

        AppState.products = data || [];
        if (AppState.products.length) {
            renderProducts();
        } else {
            grid.innerHTML = '<p style="text-align:center;">لا توجد منتجات حالياً</p>';
        }
    }

    loadProducts();

    // المنتجات بتتغير نادرًا، فبنعمل تحديث دوري بسيط بدل اتصال Realtime دائم
    // لكل زائر (بيقلل الاتصالات المتزامنة على Supabase بشكل كبير)
    setInterval(loadProducts, 60000);
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';

    AppState.products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';

        const img = document.createElement('img');
        img.className = 'product-image';
        img.src = p.image || 'https://via.placeholder.com/300';
        card.appendChild(img);

        const info = document.createElement('div');
        info.className = 'product-info';

        const name = document.createElement('h3');
        name.textContent = p.name;
        info.appendChild(name);

        const desc = document.createElement('p');
        desc.textContent = p.description;
        info.appendChild(desc);

        const price = document.createElement('div');
        price.className = 'product-price';
        price.textContent = `${formatCurrency(p.price)} EGP`;
        info.appendChild(price);

        card.appendChild(info);
        grid.appendChild(card);
    });
}

// ===========================
// 6. Event Listeners
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    setupProductsListener();
    setupCompetitionListener();

    // مستخدم: إرسال التخمين (محاولة واحدة فقط لكل مسابقة). التحقق من صحة
    // الإجابة بيحصل بالكامل على السيرفر (submit_competition_guess)، الموقع
    // مبيعرفش هل الإجابة صح ولا لأ.
    document.getElementById('guessForm').onsubmit = async (e) => {
        e.preventDefault();
        if (!AppState.currentCompData) return;

        // بنعمل مفتاح سري في المتصفح مربوط بوقت المسابقة دي تحديداً
        // عشان لما تعمل مسابقة جديدة، المفتاح يتغير والناس تقدر تشارك تاني
        const compId = AppState.currentCompData.start_time;
        const guessStorageKey = 'most3malinjo_guessed_' + compId;

        // بنتحقق: هل الزائر ده استهلك محاولته في المسابقة دي؟
        if (localStorage.getItem(guessStorageKey)) {
            alert("لقد استنفدت محاولتك الوحيدة 🚨! لا يمكنك التخمين مرة أخرى، انتظر إعلان النتيجة.");
            return;
        }

        const guessName = document.getElementById('guessFullName').value.trim();
        const guessValue = document.getElementById('guessValue').value.trim();

        const { error } = await db.rpc('submit_competition_guess', {
            p_name: guessName,
            p_guess: guessValue,
            p_visitor_id: myUserId
        });

        if (error) {
            alert(error.message || "حصل خطأ، حاول تاني");
            return;
        }

        // 1. تسجيل إن الزائر استهلك محاولته للأبد في هذه المسابقة
        localStorage.setItem(guessStorageKey, 'true');

        // 2. تفريغ الحقول
        document.getElementById('guessForm').reset();

        // 3. إظهار الرسالة الموحدة (صح أو خطأ)
        alert("تم إرسال إجابتك بنجاح! سيتم إعلان النتيجة فور انتهاء العداد ⏳");
    };

    // فائز: رفع الصورة الشخصية وضغطها بشدة لتوفير المساحة
    document.getElementById('winnerPhotoForm').onsubmit = (e) => {
        e.preventDefault();
        const file = document.getElementById('winnerPhotoFile').files[0];
        const btn = document.querySelector('#winnerPhotoForm button');

        btn.textContent = "جاري الرفع..."; btn.disabled = true;
        compressImage(file, 400, 0.5) // أبعاد صغيرة ومناسبة للأفاتار الشخصي
            .then(compressedFile => uploadImage(compressedFile))
            .then(url => db.rpc('submit_winner_photo', { p_visitor_id: myUserId, p_image_url: url }))
            .then(({ error }) => {
                if (error) throw error;
                alert("تم رفع صورتك بنجاح! ستظهر الآن لجميع الزوار ✨");
            })
            .catch(err => { alert(err.message || "حدث خطأ في الرفع"); btn.textContent = "رفع الصورة"; btn.disabled = false; });
    };

    // نافذة عرض وتكبير الصور (Zoom)
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    let currentZoom = 1;

    if (modal && modalImg) {
        document.addEventListener('click', (e) => {
            // لو الزائر داس على أي صورة في الموقع (ما عدا اللغز والمودال)
            if (e.target.tagName === 'IMG' &&
                e.target.id !== 'compMysteryImage' &&
                e.target.id !== 'modalImage') {

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

});
