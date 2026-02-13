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
    adminLoggedIn: false
};

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
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2
    });
}

// ===========================
// 4. Firestore Logic
// ===========================
function setupFirebaseListeners() {
    db.collection("products").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
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
            grid.innerHTML = '<p style="text-align:center;">لا توجد منتجات حالياً</p>';
        }
    });
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    
    grid.innerHTML = AppState.products.map(p => {
        return `
        <div class="product-card">
            <img src="${p.image || 'https://via.placeholder.com/300'}" class="product-image">
            <div class="product-info">
                <h3>${sanitizeHTML(p.name)}</h3>
                <p>${sanitizeHTML(p.description)}</p>
                <div class="product-price">
                    ${formatCurrency(p.price)} EGP
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function renderAdminProducts() {
    const list = document.getElementById('adminProductsList');
    list.innerHTML = AppState.products.map(p => `
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
        db.collection("products").doc(id).delete()
            .then(() => alert('تم حذف المنتج بنجاح'))
            .catch(err => alert('حدث خطأ: ' + err.message));
    }
}

function resetForm() {
    document.getElementById('addProductForm').reset();
    editingProductId = null;
    const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
    submitBtn.textContent = "إضافة المنتج";
    submitBtn.style.backgroundColor = "";
}

// ===========================
// 5. Auth State Listener
// ===========================
auth.onAuthStateChanged(user => {
    const loginDiv = document.getElementById('adminLogin');
    const dashboardDiv = document.getElementById('adminDashboard');
    
    if (user && user.email) {
        AppState.adminLoggedIn = true;
        if(loginDiv) loginDiv.style.display = 'none';
        if(dashboardDiv) dashboardDiv.style.display = 'block';
        renderAdminProducts(); 
    } else {
        AppState.adminLoggedIn = false;
        if(loginDiv) loginDiv.style.display = 'block';
        if(dashboardDiv) dashboardDiv.style.display = 'none';
    }
});

// ===========================
// 6. Event Listeners
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    setupFirebaseListeners();

    // Admin panel trigger (mobile)
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

    // Keyboard shortcut for admin panel
    document.addEventListener('keydown', e => {
        if(e.ctrlKey && e.shiftKey && e.key === 'A') {
            document.getElementById('adminPanel').style.display = 'block';
        }
    });

    // Close admin panel
    document.getElementById('adminClose').onclick = () => {
        document.getElementById('adminPanel').style.display = 'none';
        resetForm();
    };

    // Admin login
    document.getElementById('adminLoginForm').onsubmit = (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value;
        const pass = document.getElementById('adminPassword').value;
        
        auth.signInWithEmailAndPassword(email, pass)
            .then(() => {
                alert('تم تسجيل الدخول بنجاح');
            })
            .catch(err => {
                alert('خطأ في تسجيل الدخول: ' + err.message);
            });
    };
    
    // Admin logout
    document.getElementById('adminLogout').onclick = () => {
        auth.signOut()
            .then(() => {
                alert('تم تسجيل الخروج');
                document.getElementById('adminPanel').style.display = 'none';
            });
    };

    // Add/Edit product
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
                image: imageData, 
                createdAt: editingProductId ? AppState.products.find(p => p.id === editingProductId).createdAt : Date.now()
            };
            
            if (editingProductId) {
                if(imageData === "" && !url) delete productData.image; 
                db.collection("products").doc(editingProductId).update(productData)
                    .then(() => { 
                        resetForm(); 
                        alert("تم تحديث المنتج بنجاح ✅"); 
                    })
                    .catch(err => alert("خطأ: " + err.message));
            } else {
                db.collection("products").add(productData)
                    .then(() => {
                        resetForm();
                        alert("تمت إضافة المنتج بنجاح ✅"); 
                    })
                    .catch(err => alert("خطأ: " + err.message));
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

    // Contact form
    document.getElementById('contactForm').onsubmit = (e) => {
        e.preventDefault();
        
        const name = document.getElementById('contactName').value;
        const email = document.getElementById('contactEmail').value;
        const message = document.getElementById('contactMessage').value;
        
        db.collection("messages").add({
            name: name,
            contact: email,
            message: message,
            timestamp: Date.now()
        })
        .then(() => {
            const msgDiv = document.getElementById('formMessage');
            msgDiv.textContent = 'تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.';
            msgDiv.className = 'form-message success';
            document.getElementById('contactForm').reset();
            
            setTimeout(() => {
                msgDiv.style.display = 'none';
            }, 5000);
        })
        .catch(err => {
            const msgDiv = document.getElementById('formMessage');
            msgDiv.textContent = 'حدث خطأ في الإرسال. حاول مرة أخرى.';
            msgDiv.className = 'form-message error';
        });
    };
});






