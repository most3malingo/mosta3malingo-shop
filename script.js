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
    endMessage: "انتهت المسابقة 🏁", // 👈 الرسالة الافتراضية
    adminLoggedIn: false,
    currentProductId: null,
    pendingBid: null
};

let editingProductId = null; 
let confirmationResult = null;
let productUnsubscribe = null;

// ===========================
// 3. Helper Functions & Global Logic
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


window.finalizeBid = function(newPrice, bidderName, userId = null) {
    if(!AppState.currentProductId) return;

    // 1. تحديث المنتج محلياً فوراً
    const product = AppState.products.find(p => p.id === AppState.currentProductId);
    if(product) {
        product.price = parseFloat(newPrice);
        product.lastBidder = bidderName;
    }

    // 2. حفظ الاسم محلياً
    if(!AppState.adminLoggedIn) {
        localStorage.setItem('savedBidderName', bidderName);
    }

    // بيانات التحديث للداتابيز
    let updateData = { 
        price: parseFloat(newPrice),
        lastBidder: bidderName
    };

    // 3. فحص "البيع الفوري" وإيقاف الزمن
    if (product.maxPrice && newPrice >= product.maxPrice) {
        
        // أ) تحديث الحالة محلياً
        product.isSold = true;
        updateData.isSold = true; 

        const pastTime = Date.now() - 10000; 
        AppState.countdownEndTime = pastTime; 

        // ب) إرسال أمر الإيقاف للسيرفر (بتوقيت ماضي)
        db.collection("settings").doc("timer").set({ 
            endTime: pastTime,
            endMessage: "تم بيع المنتج بالسعر النهائي! 🎉"
        }, { merge: true });

        // ج) تحديث الواجهة فوراً
        renderProducts(); 
        checkWinnerAccess(); 
        
        // د) تحديث التايمر يدوياً عشان يلقط التغيير فوراً
        document.getElementById('countdownTimer').innerText = "تم بيع المنتج بالسعر النهائي! 🎉";

        alert(`🎉 مبروك يا ${bidderName}!\nتم شراء المنتج بنجاح!`);
    } else {
        alert('تم تحديث السعر بنجاح! 👑');
    }

    // 4. إرسال التحديثات
    db.collection("products").doc(AppState.currentProductId).update(updateData);

    // 5. حفظ وقت المستخدم
    if (userId && !AppState.adminLoggedIn) {
        db.collection("users").doc(userId).set({
            lastBidTime: Date.now()
        }, { merge: true }); 
    }

    // إغلاق المودال
    document.getElementById('priceModal').style.display = 'none';
    if (productUnsubscribe) { productUnsubscribe(); productUnsubscribe = null; }
}
window.triggerPhoneVerification = function(price, name) {
    AppState.pendingBid = { price: price, bidderName: name }; 
    document.getElementById('priceModal').style.display = 'none';
    const phoneModal = document.getElementById('phone-modal');
    phoneModal.style.display = 'flex'; 
    phoneModal.classList.remove('hidden');
}


function sendAdminEmail(userName, userPhone) {
    const serviceID = "service_y7x1x3a";
    const templateID = "template_09ngs4f";

    const params = {
        to_name: "Admin",
        user_name: userName,
        user_phone: userPhone,
        message: "تم تفعيل رقم جديد لمزايد"
    };

    if (typeof emailjs !== 'undefined') {
        emailjs.send(serviceID, templateID, params);
    }
}

// ===========================
// 5. Firestore Logic
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
            if (AppState.adminLoggedIn) renderAdminProducts();
        } else {
             grid.innerHTML = '<p style="text-align:center;">No products found.</p>';
        }
    });

    //  الاستماع لتحديثات الوقت والرسالة
    db.collection("settings").doc("timer").onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            AppState.countdownEndTime = data.endTime;
            //  تحديث الرسالة من الداتابيز
            if(data.endMessage) AppState.endMessage = data.endMessage;
            
            // تحديث خانة الرسالة في الأدمن عشان يشوف هو كاتب إيه
            const msgInput = document.getElementById('timerEndMessage');
            if(msgInput && data.endMessage) msgInput.value = data.endMessage;

            updateCountdown();
        } else {
            resetTimer(24, 0, "انتهت المسابقة 🏁");
        }
    });
}

function updatePrice(id, price, name) {
    db.collection("products").doc(id).update({ 
        price: parseFloat(price),
        lastBidder: name
    }).catch(e => alert("Error updating price: " + e.message));
}

// 🔥 دالة ضبط التايمر (بتقبل رسالة دلوقتي)
function resetTimer(h, m, msg) {
    const ms = (h * 3600000) + (m * 60000);
    const endTime = Date.now() + ms;
    
    // حفظ الوقت والرسالة مع بعض
    db.collection("settings").doc("timer").set({ 
        endTime: endTime,
        endMessage: msg || "انتهت المسابقة 🏁"
    });
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const isAuctionEnded = AppState.countdownEndTime && Date.now() > AppState.countdownEndTime;

    grid.innerHTML = AppState.products.map(p => {
        const bidderHtml = p.lastBidder 
            ? `<span class="top-bidder-badge">👑 ${sanitizeHTML(p.lastBidder)}</span>`
            : `<span style="color:#999; font-size:0.8rem;">كن أول من يحدد السعر!</span>`;

        let actionButton;
        if (isAuctionEnded) {
            actionButton = p.lastBidder 
                ? `<div class="winner-box">🏆 الفائز: ${sanitizeHTML(p.lastBidder)}</div>`
                : `<div class="no-winner-box">لم يباع</div>`;
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
                    <div style="margin-top: 8px;">${bidderHtml}</div>
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
        <div style="border-bottom:1px solid #ccc; padding:15px; display:flex; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${p.image || ''}" style="width:40px; height:40px; object-fit:cover; border-radius:5px;">
                <div><b>${sanitizeHTML(p.name)}</b><br><small>${p.price} EGP</small></div>
            </div>
            <div>
                <button class="btn" onclick="startEditProduct('${p.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function startEditProduct(id) {
    const p = AppState.products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('productName').value = p.name;
    document.getElementById('productDescription').value = p.description;
    document.getElementById('productPrice').value = p.price;
    if(p.maxPrice) document.getElementById('productMaxPrice').value = p.maxPrice; 
    document.getElementById('productImage').value = p.image || ''; 
    
    const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
    submitBtn.textContent = "Update Product";
    submitBtn.style.backgroundColor = "#28a745"; 
    editingProductId = id;
    document.getElementById('adminPanel').style.display = 'block';
}

function deleteProduct(id) {
    if(confirm('Delete?')) {
        db.collection("products").doc(id).delete();
    }
}

function resetForm() {
    document.getElementById('addProductForm').reset();
    editingProductId = null;
    const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
    submitBtn.textContent = "Add";
    submitBtn.style.backgroundColor = "";
}

function checkWinnerAccess() {
    const myName = localStorage.getItem('savedBidderName');
    const msgDiv = document.getElementById('contactAccessMsg');
    const form = document.getElementById('contactForm');
    if (!myName) {
        if(msgDiv) msgDiv.innerHTML = `<p style="color: #dc3545;">⛔ انتهت المسابقة.</p>`;
        return;
    }
    const amIWinner = AppState.products.some(p => p.lastBidder === myName);
    if (amIWinner && form) {
        if(msgDiv) msgDiv.style.display = 'none'; 
        form.style.display = 'block';  
        document.getElementById('contactName').value = myName;
    } else if (msgDiv) {
        msgDiv.innerHTML = `<p style="color: #666;">حظ أوفر المرة القادمة!</p>`;
    }
}

window.openPriceModal = (id) => {
    if (AppState.countdownEndTime && Date.now() > AppState.countdownEndTime) {
        // لو الوقت خلصان، اطلع الرسالة المحفوظة
        alert(AppState.endMessage); 
        return;
    }
    AppState.currentProductId = id;
    const modal = document.getElementById('priceModal');
    const savedName = localStorage.getItem('savedBidderName');
    if(savedName) document.getElementById('bidderName').value = savedName;

    const p = AppState.products.find(x => x.id === id);
    if(p) {
        document.getElementById('modalProductName').innerText = p.name;
        document.getElementById('modalCurrentPrice').innerText = formatCurrency(p.price);
        if(p.isSold) {
             modal.style.display = 'none';
             alert("هذا المنتج تم بيعه بالفعل!");
             return;
        }
    }
    modal.style.display = 'block';

    if (productUnsubscribe) productUnsubscribe();
    productUnsubscribe = db.collection("products").doc(id).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('modalCurrentPrice').innerText = formatCurrency(data.price);
            if(data.isSold) {
                modal.style.display = 'none';
                alert("تم بيع المنتج الآن!");
            }
        }
    });
};

auth.onAuthStateChanged(user => {
    const loginDiv = document.getElementById('adminLogin');
    const dashboardDiv = document.getElementById('adminDashboard');
    if (user) {
        if (user.email) {
            AppState.adminLoggedIn = true;
            if(loginDiv) loginDiv.style.display = 'none';
            if(dashboardDiv) dashboardDiv.style.display = 'block';
            renderAdminProducts(); 
        } else {
            AppState.adminLoggedIn = false;
            if(dashboardDiv) dashboardDiv.style.display = 'none';
            if(loginDiv) loginDiv.style.display = 'block'; 
        }
    } else {
        AppState.adminLoggedIn = false;
        if(loginDiv) loginDiv.style.display = 'block';
        if(dashboardDiv) dashboardDiv.style.display = 'none';
    }
});

let auctionEndedTriggered = false;
function updateTimerUI() {
    if(!AppState.countdownEndTime) return;
    const diff = AppState.countdownEndTime - Date.now();
    
    //  هنا التعديل: إظهار الرسالة المخصصة لما الوقت يخلص 
    if(diff <= 0) {
        document.getElementById('countdownTimer').innerText = AppState.endMessage;
        if (!auctionEndedTriggered) {
            auctionEndedTriggered = true;
            renderProducts(); 
            document.getElementById('priceModal').style.display = 'none';
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
// 6. Event Listeners
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    setupFirebaseListeners();
    setInterval(updateTimerUI, 1000);

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
                alert("تم فتح لوحة الأدمن! 🔓");
            }
            clearTimeout(tapTimer);
            tapTimer = setTimeout(() => { tapCount = 0; }, 1000);
        });
    }

    document.addEventListener('keydown', e => {
        if(e.ctrlKey && e.shiftKey && e.key === 'A') document.getElementById('adminPanel').style.display = 'block';
    });
    document.getElementById('adminClose').onclick = () => {
        document.getElementById('adminPanel').style.display = 'none';
        resetForm();
    };

    document.getElementById('adminLoginForm').onsubmit = (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value;
        const pass = document.getElementById('adminPassword').value;
        auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
    };
    
    document.getElementById('adminLogout').onclick = () => auth.signOut();

    document.getElementById('addProductForm').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('productName').value;
        const desc = document.getElementById('productDescription').value;
        const price = document.getElementById('productPrice').value;
        const maxPrice = document.getElementById('productMaxPrice').value; 
        const url = document.getElementById('productImage').value;
        const fileInput = document.getElementById('productImageFile');

        const handleData = (imageData) => {
            const productData = { 
                name, 
                description: desc,
                price: parseFloat(price),
                maxPrice: maxPrice ? parseFloat(maxPrice) : null,
                isSold: false, 
                image: imageData, 
                createdAt: Date.now() 
            };
            
            if (editingProductId) {
                if(imageData === "" && !url) delete productData.image; 
                db.collection("products").doc(editingProductId).update(productData)
                    .then(() => { 
                        resetForm(); 
                        alert("تم التعديل بنجاح ✅"); 
                        renderProducts();
                        renderAdminProducts();
                    });
            } else {
                db.collection("products").add(productData).then(() => {
                    resetForm();
                    alert("تمت الإضافة بنجاح ✅"); 
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

    //  زرار ضبط الوقت (والرسالة) 
    document.getElementById('timerControlForm').onsubmit = (e) => {
        e.preventDefault();
        const h = document.getElementById('timerHours').value;
        const m = document.getElementById('timerMinutes').value;
        const msg = document.getElementById('timerEndMessage').value; // بناخد الرسالة من الخانة
        resetTimer(h, m, msg);
    };

    document.getElementById('contactForm').onsubmit = (e) => {
        e.preventDefault();
        db.collection("messages").add({
            sender: document.getElementById('contactName').value,
            msg: document.getElementById('contactMessage').value,
            time: Date.now()
        }).then(() => alert("Sent!"));
    };

    document.getElementById('modalClose').onclick = () => {
        document.getElementById('priceModal').style.display = 'none';
    };

    document.getElementById('priceOfferForm').onsubmit = (e) => {
        e.preventDefault();
        
        const newPriceInput = document.getElementById('newPrice');
        const bidderNameInput = document.getElementById('bidderName');

        if (!newPriceInput || !bidderNameInput) return alert("البيانات ناقصة!");

        const newPrice = parseFloat(newPriceInput.value);
        const bidderName = bidderNameInput.value;
        
        const currentProduct = AppState.products.find(p => p.id === AppState.currentProductId);
        if (!currentProduct) return alert("المنتج غير موجود!");

        if (currentProduct.isSold) {
            alert("هذا المنتج تم بيعه بالفعل! 🏁");
            document.getElementById('priceModal').style.display = 'none';
            return;
        }

        if (AppState.adminLoggedIn) {
            finalizeBid(newPrice, bidderName);
            return;
        }

        if (newPrice <= currentProduct.price) {
            alert(`لازم السعر يكون أعلى من (${currentProduct.price} EGP)`);
            return;
        }

        const increaseDiff = newPrice - currentProduct.price;
        if (increaseDiff > 100) {
            alert(`⛔ ممنوع تزود أكتر من 100 جنيه في المرة الواحدة!\nالحد الأقصى المسموح لك هو: ${currentProduct.price + 100} EGP`);
            return;
        }

        const user = auth.currentUser;
        if (user) {
            db.collection("users").doc(user.uid).get().then((docSnap) => {
                const userData = docSnap.data();

                if (!userData || !userData.phoneNumber) {
                    triggerPhoneVerification(newPrice, bidderName);
                    return;
                }

                const lastBidTime = userData.lastBidTime || 0;
                const timeNow = Date.now();
                const diffMinutes = (timeNow - lastBidTime) / 1000 / 60; 

                if (diffMinutes < 10) { 
                    const waitTime = Math.ceil(10 - diffMinutes);
                    alert(`⏳ انتظر شوية!\nلازم تستنى ${waitTime} دقيقة قبل ما تقدر تزايد تاني.`);
                    return;
                }

                finalizeBid(newPrice, bidderName, user.uid);

            }).catch(err => {
                console.error(err);
                triggerPhoneVerification(newPrice, bidderName);
            });
        } else {
            triggerPhoneVerification(newPrice, bidderName);
        }
    };
});

};

