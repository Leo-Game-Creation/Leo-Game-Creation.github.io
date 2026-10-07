/**
 * Envoi du formulaire de contact vers Formspree.
 * Sans fetch, le navigateur utilise action et _next.
 */
(function () {
    'use strict';

    if (!window.fetch || !window.FormData) return;

    var form = document.querySelector('.page-contact form');
    if (!form) return;

    var button = form.querySelector('button[type="submit"]');
    var error = document.getElementById('contact-error');
    var successUrl = 'https://leogamecreation.fr/merci.html';
    var errorText = "Oups, le message n'a pas pu être envoyé. Réessaie dans un instant.";
    var sending = false;

    function hideError() {
        if (!error) return;
        error.textContent = '';
        error.hidden = true;
    }

    function showError() {
        if (!error) return;
        error.textContent = errorText;
        error.hidden = false;
    }

    form.addEventListener('submit', function (event) {
        if (sending) {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        sending = true;
        hideError();

        var label = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = 'Envoi…';
        }

        fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: {
                Accept: 'application/json'
            }
        }).then(function (response) {
            if (!response.ok) throw new Error('status');
            window.location.href = successUrl;
        }).catch(function () {
            showError();
            sending = false;
            if (button) {
                button.disabled = false;
                button.textContent = label;
            }
        });
    });
})();
