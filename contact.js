document.addEventListener('DOMContentLoaded', () => {
    const contactFormEl = document.getElementById('contactForm');
    const submitBtn = contactFormEl.querySelector('button[type="submit"]');
    const msgDiv = document.getElementById('formMessage');

    contactFormEl.onsubmit = async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;

        const { error } = await db.from('messages').insert({
            name: document.getElementById('contactName').value,
            contact: document.getElementById('contactEmail').value,
            message: document.getElementById('contactMessage').value
        });

        if (error) {
            msgDiv.textContent = 'حصل خطأ في الإرسال، حاول تاني.';
            msgDiv.className = 'form-message error';
            submitBtn.disabled = false;
            return;
        }

        msgDiv.textContent = 'تم إرسال رسالتك بنجاح! هنرد عليك قريب.';
        msgDiv.className = 'form-message success';
        contactFormEl.reset();
        submitBtn.disabled = false;
    };
});
