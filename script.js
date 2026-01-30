// ===========================
// 1. Firebase Configuration
// ===========================
const firebaseConfig = {
    apiKey: "AIzaSyBSQQBbrWoZfVlj-0TjHGj8uSuR6b7b-qM",
    authDomain: "most3malinjo.firebaseapp.com",
    projectId: "most3malinjo",
    storageBucket: "most3malinjo.firebasestorage.app",
    messagingSenderId: "1080056902628",
    appId: "1:1080056902628:web:6ab1965773094d84314df1",
    measurementId: "G-BEWNQG7Z5J"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// ===========================
// 2. State Management
// ===========================
const AppState = {
    products: [],
    countdownEndTime: null,
    adminLoggedIn: false,
    currentProductId: null
};

// متغير للتحكم في عملية التعديل
let editingProductId = null; 

// ===========================
// 3. Helper Functions
// ===========================
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-EG', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
}

// ===========================
// 4. Firestore Logic
// ===========================
function setupFirebaseListeners() {
    db.collection("products").orderBy("createdAt", "desc").get().then((snapshot) => {
        const grid = document.getElementById('productsGrid');
        
        if (!snapshot.empty) {
            AppState.products = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            grid.innerHTML = ''; 
            
            renderProducts();

            if (AppState.adminLoggedIn) {
                renderAdminProducts();
            }

        } else {
            if(!localStorage.getItem('init_done_v2')) {
                initializeDummyProducts();
                localStorage.setItem('init_done_v2', 'true');
            } else {
                grid.innerHTML = '<p style="text-align:center;">No products found.</p>';
            }
        }
    });

    db.collection("settings").doc("timer").onSnapshot((doc) => {
        if (doc.exists) {
            AppState.countdownEndTime = doc.data().endTime;
            updateCountdown();
        } else {
            resetTimer(24, 0);
        }
    });
}

function initializeDummyProducts() {
    console.log("Initializing Firestore data...");
    const defaults = [
        { name: 'Leather Wallet', description: 'Genuine leather.', price: 450, image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=400' },
        { name: 'Headphones', description: 'Noise cancelling.', price: 1200, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400' },
        { name: 'Smart Watch', description: 'Fitness tracker.', price: 2500, image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400' }
    ];
    defaults.forEach(p => addProduct(p));
}

// ===========================
// 5. Actions (Add, Delete, Update)
// ===========================
function addProduct(product) {
    db.collection("products").add({
        name: product.name,
        description: product.description,
        price: parseFloat(product.price),
        image: product.image,
        createdAt: Date.now()
    })
    .then(() => console.log("Product Added"))
    .catch(e => alert("Error: " + e.message));
}

function deleteProduct(id) {
    if(confirm('Delete this product?')) {
        db.collection("products").doc(id).delete()
          .catch(e => alert("Error: " + e.message));
    }
}

function updatePrice(id, price, name) {
    db.collection("products").doc(id).update({ 
        price: parseFloat(price),
        lastBidder: name
    })
    .catch(e => alert("Error updating price: " + e.message));
}

function resetTimer(h, m) {
    const ms = (h * 3600000) + (m * 60000);
    const endTime = Date.now() + ms;
    db.collection("settings").doc("timer").set({ endTime: endTime });
}

function startEditProduct(id) {
    const p = AppState.products.find(x => x.id === id);
    if(!p) return;

    document.getElementById('productName').value = p.name;
    document.getElementById('productDescription').value = p.description;
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productImage').value = p.image;

    const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
    submitBtn.textContent = "Update Product";
    submitBtn.style.backgroundColor = "#28a745"; 

    editingProductId = id;

    const panel = document.getElementById('adminPanel');
    if(panel) panel.scrollTop = 0;
}

function resetForm() {
    document.getElementById('addProductForm').reset();
    editingProductId = null;
    const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
    submitBtn.textContent = "Add";
    submitBtn.style.backgroundColor = "";
}

// دالة التحقق من الفائز (لفتح الفورم)
function checkWinnerAccess() {
    const myName = localStorage.getItem('savedBidderName');
    const msgDiv = document.getElementById('contactAccessMsg');
    const form = document.getElementById('contactForm');

    if (!myName) {
        msgDiv.innerHTML = `<p style="color: #dc3545;">⛔ انتهت المسابقة، ولم تشارك بأي عرض.</p>`;
        return;
    }

    const amIWinner = AppState.products.some(p => p.lastBidder === myName);

    if (amIWinner) {
        msgDiv.style.display = 'none'; 
        form.style.display = 'block';  
        document.getElementById('contactName').value = myName;
    } else {
        msgDiv.innerHTML = `<p style="color: #666;">حظ أوفر المرة القادمة! <br> التواصل متاح للفائزين فقط.</p>`;
    }
}

// ===========================
// 6. Rendering Functions
// ===========================
function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const isAuctionEnded = AppState.countdownEndTime && Date.now() > AppState.countdownEndTime;

    grid.innerHTML = AppState.products.map(p => {
        const bidderHtml = p.lastBidder 
            ? `<span class="top-bidder-badge">👑 ${sanitizeHTML(p.lastBidder)}</span>`
            : `<span style="color:#999; font-size:0.8rem;">كن أول من يحدد السعر!</span>`;

        let actionButton;
        if (isAuctionEnded) {
            if (p.lastBidder) {
                actionButton = `
                    <div class="winner-box">
                        🏆 الفائز: ${sanitizeHTML(p.lastBidder)} <br>
                        <small>السعر النهائي: ${formatCurrency(p.price)}</small>
                    </div>`;
            } else {
                actionButton = `<div class="no-winner-box">لم يباع انتظر العرض الجديد</div>`;
            }
        } else {
            actionButton = `<button class="btn btn-primary" onclick="openPriceModal('${p.id}')">Make Offer</button>`;
        }

        return `
        <div class="product-card">
            <img src="${p.image || 'https://via.placeholder.com/300'}" class="product-image">
            <div class="product-info">
                <h3>${sanitizeHTML(p.name)}</h3>
                <p>${sanitizeHTML(p.description)}</p>
                <div class="product-price">
                    ${formatCurrency(p.price)} EGP
                    <div style="margin-top: 8px;">
                        ${bidderHtml}
                    </div>
                </div>
                ${actionButton}
            </div>
        </div>
        `;
    }).join('');
}

function renderAdminProducts() {
    const list = document.getElementById('adminProductsList');
    list.innerHTML = AppState.products.map(p => `
        <div style="border-bottom:1px solid #ccc; padding:15px; display:flex; align-items:center; justify-content:space-between; background:#fff; margin-bottom:5px; border-radius:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${p.image}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
                <div>
                    <b>${sanitizeHTML(p.name)}</b> <br>
                    <small>${p.price} EGP</small>
                </div>
            </div>
            <div>
                <button class="btn" style="background:#007bff; color:white; padding:5px 10px; margin-right:5px;" onclick="startEditProduct('${p.id}')">Edit</button>
                <button class="btn btn-danger" style="padding:5px 10px;" onclick="deleteProduct('${p.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// ===========================
// 7. Auth & Events
// ===========================
auth.onAuthStateChanged(user => {
    const loginDiv = document.getElementById('adminLogin');
    const dashboardDiv = document.getElementById('adminDashboard');
    
    if (user) {
        AppState.adminLoggedIn = true;
        loginDiv.style.display = 'none';
        dashboardDiv.style.display = 'block';
        renderAdminProducts();
    } else {
        AppState.adminLoggedIn = false;
        loginDiv.style.display = 'block';
        dashboardDiv.style.display = 'none';
    }
});

let auctionEndedTriggered = false;

function updateTimerUI() {
    if(!AppState.countdownEndTime) return;
    
    const diff = AppState.countdownEndTime - Date.now();
    
    if(diff <= 0) {
        document.getElementById('countdownTimer').innerText = "انتهت المسابقة 🏁";
        document.getElementById('countdownTimer').style.color = "#fff7f7ff";
        
        if (!auctionEndedTriggered) {
            auctionEndedTriggered = true;
            renderProducts(); 
            document.getElementById('priceModal').style.display = 'none';
            // التحقق من الفائز لفتح الفورم
            checkWinnerAccess();
        }
        return;
    }

    auctionEndedTriggered = false;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdownTimer').innerText = `${h}:${m}:${s}`;
}

// ===========================
// 8. Event Listeners (Main Logic)
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    setupFirebaseListeners();
    setInterval(updateTimerUI, 1000);

    // --- Admin Shortcuts ---
    document.addEventListener('keydown', e => {
        if(e.ctrlKey && e.shiftKey && e.key === 'A') {
            document.getElementById('adminPanel').style.display = 'block';
        }
    });
    
    document.getElementById('adminClose').onclick = () => {
        document.getElementById('adminPanel').style.display = 'none';
        resetForm(); 
    };

    // --- Forms ---
    document.getElementById('adminLoginForm').onsubmit = (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value;
        const pass = document.getElementById('adminPassword').value;
        document.getElementById('loginError').textContent = 'Checking...';
        
        auth.signInWithEmailAndPassword(email, pass)
            .then(() => document.getElementById('loginError').textContent = '')
            .catch(err => document.getElementById('loginError').textContent = err.message);
    };

    document.getElementById('adminLogout').onclick = () => auth.signOut();

    // === Add / Edit Product Logic ===
    document.getElementById('addProductForm').onsubmit = (e) => {
        e.preventDefault();
        
        const name = document.getElementById('productName').value;
        const desc = document.getElementById('productDescription').value;
        const price = document.getElementById('productPrice').value;
        const url = document.getElementById('productImage').value;
        const fileInput = document.getElementById('productImageFile');

        const handleData = (imageData) => {
            const productData = { 
                name, 
                description: desc, 
                price: parseFloat(price), 
                image: imageData 
            };

            if (editingProductId) {
                // حالة التعديل
                if(imageData === "") delete productData.image; 

                db.collection("products").doc(editingProductId).update(productData)
                    .then(() => {
                        alert("تم تعديل المنتج بنجاح ✅");
                        // تحديث يدوي سريع
                        const index = AppState.products.findIndex(p => p.id === editingProductId);
                        if (index !== -1) {
                            AppState.products[index] = { ...AppState.products[index], ...productData };
                        }
                        renderAdminProducts();
                        renderProducts();
                        resetForm();
                    })
                    .catch(err => alert("Error: " + err.message));
            } else {
                // حالة الإضافة
                productData.createdAt = Date.now();
                db.collection("products").add(productData).then((docRef) => {
                     AppState.products.unshift({ id: docRef.id, ...productData });
                     renderAdminProducts();
                     renderProducts();
                     resetForm();
                });
            }
        };

        if (fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => handleData(ev.target.result);
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            handleData(url);
        }
    };

    document.getElementById('timerControlForm').onsubmit = (e) => {
        e.preventDefault();
        resetTimer(document.getElementById('timerHours').value, document.getElementById('timerMinutes').value);
        alert("Timer Updated!");
    };

    // --- Contact Form (Winners Only) ---
    // 👇👇 ده الجزء الجديد اللي أنت سألت عليه 👇👇
    document.getElementById('contactForm').onsubmit = (e) => {
        e.preventDefault();
        
        const name = document.getElementById('contactName').value;
        const contactInfo = document.getElementById('contactEmail').value;
        const message = document.getElementById('contactMessage').value;
        const btn = e.target.querySelector('button');

        btn.textContent = "جاري الإرسال...";
        btn.disabled = true;

        // حفظ الرسالة في Firestore
        db.collection("messages").add({
            senderName: name,
            contactInfo: contactInfo,
            message: message,
            sentAt: Date.now()
        }).then(() => {
            alert("تم إرسال رسالتك بنجاح! سنتواصل معك قريباً لاستلام الجائزة 🎉");
            btn.textContent = "تم الإرسال";
            document.getElementById('contactForm').reset();
        }).catch((error) => {
            console.error(error);
            alert("حدث خطأ، حاول مرة أخرى.");
            btn.textContent = "Send Message";
            btn.disabled = false;
        });
    };

    // --- Modal Logic ---
    const modal = document.getElementById('priceModal');
    document.getElementById('modalClose').onclick = () => {
        modal.style.display = 'none';
        if (productUnsubscribe) { productUnsubscribe(); productUnsubscribe = null; }
    };
    
    window.onclick = (e) => { 
        if(e.target == modal) {
            modal.style.display = 'none';
            if (productUnsubscribe) { productUnsubscribe(); productUnsubscribe = null; }
        }
    };

    // === Price Offer Logic (Admin Override) ===
    document.getElementById('priceOfferForm').onsubmit = (e) => {
        e.preventDefault();
        const newPrice = parseFloat(document.getElementById('newPrice').value);
        const bidderName = document.getElementById('bidderName').value;
        
        const currentProduct = AppState.products.find(p => p.id === AppState.currentProductId);

        if (!currentProduct) return;

        // الشرط الذكي: منع السعر الأقل لغير الأدمن فقط
        if (!AppState.adminLoggedIn && newPrice <= currentProduct.price) {
            alert(`عفواً يا ${bidderName}! لازم تقدم عرض أعلى من السعر الحالي (${currentProduct.price} EGP)`);
            return;
        }

        if(AppState.currentProductId) {
            updatePrice(AppState.currentProductId, newPrice, bidderName);
            
            if(!AppState.adminLoggedIn) {
                localStorage.setItem('savedBidderName', bidderName);
            }
            
            modal.style.display = 'none';
            alert('تم تحديث السعر بنجاح! 👑');
            if (productUnsubscribe) { productUnsubscribe(); productUnsubscribe = null; }
        }
    };

    // --- Mobile Admin Trigger ---
    const mobileTrigger = document.getElementById('footerDate');
    let tapCount = 0;
    let tapTimer = null;

    if (mobileTrigger) {
        mobileTrigger.addEventListener('click', (e) => {
            tapCount++;
            mobileTrigger.style.color = "red";
            setTimeout(() => mobileTrigger.style.color = "", 200);

            if (tapCount >= 7) {
                document.getElementById('adminPanel').style.display = 'block';
                tapCount = 0;
                alert("تم فتح لوحة الأدمن!");
            }
            clearTimeout(tapTimer);
            tapTimer = setTimeout(() => { tapCount = 0; }, 1000);
        });
    }
});

// --- Helper for Countdown Loop ---
function updateCountdown() {}

// --- Open Modal Function ---
let productUnsubscribe = null;

window.openPriceModal = (id) => {
    // 1. منع الفتح لو الوقت انتهى
    if (AppState.countdownEndTime && Date.now() > AppState.countdownEndTime) {
        alert("عفواً، المسابقة انتهت ولا يمكن تقديم عروض الآن!");
        return;
    }

    // 2. حفظ الـ ID
    AppState.currentProductId = id;

    // 3. تجهيز المودال
    const modal = document.getElementById('priceModal');
    const savedName = localStorage.getItem('savedBidderName');
    if(savedName) document.getElementById('bidderName').value = savedName;

    const p = AppState.products.find(x => x.id === id);
    if(p) {
        document.getElementById('modalProductName').innerText = p.name;
        document.getElementById('modalCurrentPrice').innerText = formatCurrency(p.price);
    }
    
    modal.style.display = 'block';

    // 4. تشغيل الاستماع اللحظي
    if (productUnsubscribe) productUnsubscribe();

    productUnsubscribe = db.collection("products").doc(id).onSnapshot((doc) => {
        if (doc.exists) {
            const currentData = doc.data();
            document.getElementById('modalCurrentPrice').innerText = formatCurrency(currentData.price);
            
            const prodIndex = AppState.products.findIndex(x => x.id === id);
            if(prodIndex > -1) {
                AppState.products[prodIndex].price = currentData.price;
                AppState.products[prodIndex].lastBidder = currentData.lastBidder;
                renderProducts(); 
            }
        }
    });

};
