// ===========================
// 1. State
// ===========================
const UPLOAD_ENDPOINT = "https://most3malingo.shop/upload";

const AppState = {
    products: [],
    adminLoggedIn: false,
    currentCompData: null
};
let editingProductId = null;

// ===========================
// 2. Helpers & Image Compression
// ===========================
function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: formData });
    const data = await response.json();
    if (response.ok && data.url) return data.url;
    else throw new Error(data.error || "فشل رفع الصورة، تأكد من اتصال الإنترنت");
}

// ===========================
// 3. Products
// ===========================
function setupProductsListener() {
    async function loadProducts() {
        const { data, error } = await db.from('products').select('*').order('created_at', { ascending: false });
        if (error) return;
        AppState.products = data || [];
        if (AppState.adminLoggedIn) renderAdminProducts();
        populateCompProductSelect();
    }

    loadProducts();
    setInterval(loadProducts, 15000);
}

function populateCompProductSelect() {
    const select = document.getElementById('compProductAdmin');
    if (!select) return;
    const previousValue = select.value;

    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- اختار منتج من المتجر --';
    select.appendChild(placeholder);

    AppState.products.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${formatCurrency(p.price)} EGP — ${p.name}`;
        select.appendChild(option);
    });

    if (previousValue && AppState.products.some(p => p.id === previousValue)) {
        select.value = previousValue;
    }
}

function renderAdminProducts() {
    const list = document.getElementById('adminProductsList');
    list.innerHTML = '';

    AppState.products.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = 'border-bottom:1px solid #ccc; padding:15px; display:flex; justify-content:space-between; align-items:center;';

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; align-items:center; gap:10px;';

        const img = document.createElement('img');
        img.src = p.image || '';
        img.style.cssText = 'width:40px; height:40px; object-fit:cover; border-radius:5px;';
        left.appendChild(img);

        const infoDiv = document.createElement('div');
        const b = document.createElement('b');
        b.textContent = p.name;
        const small = document.createElement('small');
        small.textContent = `${formatCurrency(p.price)} EGP`;
        infoDiv.appendChild(b);
        infoDiv.appendChild(document.createElement('br'));
        infoDiv.appendChild(small);
        left.appendChild(infoDiv);

        const actions = document.createElement('div');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => startEditProduct(p.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteProduct(p.id));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        row.appendChild(left);
        row.appendChild(actions);
        list.appendChild(row);
    });
}

function startEditProduct(id) {
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
}

function deleteProduct(id) {
    if(confirm('هل تريد حذف هذا المنتج؟')) {
        db.from('products').delete().eq('id', id).then(({ error }) => {
            if (error) alert(error.message); else alert('تم الحذف');
        });
    }
}

function resetForm() {
    document.getElementById('addProductForm').reset();
    editingProductId = null;
    document.querySelector('#addProductForm button[type="submit"]').textContent = "إضافة المنتج";
    document.querySelector('#addProductForm button[type="submit"]').style.backgroundColor = "";
}

// ===========================
// 4. Auth State & Competition Data
// ===========================
db.auth.onAuthStateChange((event, session) => {
    if (session && session.user && session.user.email) {
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

function setupCompetitionListener() {
    async function load() {
        const { data } = await db.from('competition_settings').select('*').eq('id', 1).single();
        AppState.currentCompData = data;
    }

    load();
    setInterval(load, 10000);
}

// ===========================
// 5. Event Listeners & Admin Actions
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    setupProductsListener();
    setupCompetitionListener();

    document.getElementById('adminLoginForm').onsubmit = async (e) => {
        e.preventDefault();
        const { error } = await db.auth.signInWithPassword({
            email: document.getElementById('adminEmail').value,
            password: document.getElementById('adminPassword').value
        });
        if (error) alert(error.message);
    };
    document.getElementById('adminLogout').onclick = () => db.auth.signOut();

    // معاينة البلور فورياً بناءً على صورة اللغز المرفوعة (مش صورة المنتج)
    const compProductSelect = document.getElementById('compProductAdmin');
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
        } else {
            adminPreviewImg.style.display = 'none';
        }
    }
    compImageFileInput.addEventListener('change', updateAdminPreview);
    compInitialBlurInput.addEventListener('input', updateAdminPreview);

    // إضافة منتج جديد وضغطه تلقائياً قبل الرفع
    document.getElementById('addProductForm').onsubmit = (e) => {
        e.preventDefault();
        const productData = {
            name: document.getElementById('productName').value,
            description: document.getElementById('productDescription').value,
            price: parseFloat(document.getElementById('productPrice').value)
        };
        const fileInput = document.getElementById('productImageFile');
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');

        const saveToDb = (data) => {
            const query = editingProductId
                ? db.from('products').update(data).eq('id', editingProductId)
                : db.from('products').insert(data);

            query.then(({ error }) => {
                if (error) { alert(error.message); return; }
                resetForm();
                alert(editingProductId ? "تم التحديث ✅" : "تمت الإضافة ✅");
            });
        };

        if (fileInput.files[0]) {
            submitBtn.textContent = "جاري ضغط ورفع الصورة..."; submitBtn.disabled = true;
            compressImage(fileInput.files[0], 800, 0.6)
                .then(compressedFile => uploadImage(compressedFile))
                .then(url => { productData.image = url; submitBtn.textContent = "إضافة المنتج"; submitBtn.disabled = false; saveToDb(productData); })
                .catch(err => { submitBtn.textContent = "إضافة المنتج"; submitBtn.disabled = false; alert(err.message); });
        } else {
            productData.image = document.getElementById('productImage').value;
            saveToDb(productData);
        }
    };

    // إطلاق المسابقة: صورة اللغز (مبلورة) منفصلة عن المنتج (الجايزة اللي بتظهر اسمها بوضوح)
    document.getElementById('competitionAdminForm').onsubmit = (e) => {
        e.preventDefault();
        const startStr = document.getElementById('compStartTimeAdmin').value;
        const endStr = document.getElementById('compEndTimeAdmin').value;
        const validNamesArr = document.getElementById('compValidNamesAdmin').value.split(',').map(item => item.trim());
        const blurInterval = document.getElementById('compBlurIntervalAdmin').value;
        const initialBlur = parseInt(document.getElementById('compInitialBlurAdmin').value) || 50;
        const blurDrop = parseInt(document.getElementById('compBlurDropAdmin').value) || 5;

        const selectedProduct = AppState.products.find(p => p.id === compProductSelect.value);
        const submitBtn = document.querySelector('#competitionAdminForm button[type="submit"]');

        if (!selectedProduct) { alert("لازم تختار منتج من المتجر عشان يكون جايزة المسابقة!"); return; }
        if (!compImageFileInput.files[0] && (!AppState.currentCompData || !AppState.currentCompData.image)) { alert("لازم ترفع صورة اللغز اللي هتتبلور!"); return; }

        submitBtn.textContent = "جاري الضغط والرفع..."; submitBtn.disabled = true;

        const saveComp = (puzzleImageUrl) => {
            db.from('competition_settings').update({
                active: true,
                start_time: new Date(startStr).toISOString(),
                end_time: new Date(endStr).toISOString(),
                image: puzzleImageUrl,
                product_id: selectedProduct.id,
                product_name: selectedProduct.name,
                product_image: selectedProduct.image,
                valid_names: validNamesArr,
                blur_interval: parseInt(blurInterval),
                initial_blur: initialBlur,
                blur_drop: blurDrop,
                winner_name: null, winner_guess: null, winner_uid: null, winner_image: null
            }).eq('id', 1).then(({ error }) => {
                if (error) { alert(error.message); submitBtn.disabled = false; return; }
                alert("تم إطلاق المسابقة بنجاح! 🚀"); submitBtn.textContent = "إطلاق المسابقة 🚀"; submitBtn.disabled = false;
            });
        };

        if (compImageFileInput.files[0]) {
            compressImage(compImageFileInput.files[0], 1000, 0.7)
                .then(compressedFile => uploadImage(compressedFile))
                .then(url => saveComp(url))
                .catch(err => { alert(err.message); submitBtn.disabled = false; });
        } else {
            saveComp(AppState.currentCompData.image);
        }
    };

    document.getElementById('stopCompBtn').onclick = () => {
        if(confirm('إيقاف المسابقة؟')) db.from('competition_settings').update({ active: false }).eq('id', 1).then(() => alert('تم الإيقاف'));
    };
});
