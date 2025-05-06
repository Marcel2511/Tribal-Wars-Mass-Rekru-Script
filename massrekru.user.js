// ==UserScript==
// @name         Stämme – Auto-MassRecruit mit dynamischem Threshold und konfigurierbarem Intervall
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Initialrekrutierung, Truppen-Einfügen, dynamischer Threshold, konfigurierbarer Intervall, Auto-Refresh, Logs und Persistenz
// @author       MarcelWollbaum
// @match        https://*.die-staemme.de/game.php*screen=train&mode=mass*
// @match        https://*.die-staemme.de/game.php*screen=train&mode=success&action=train_mass*
// @grant        none
// ==/UserScript==
(function() {
    'use strict';
    console.log('[AutoMassRecruit] Skript geladen');

    // Hilfsfunktion für zufälliges Delay
    function randomDelay(min, max, callback) {
        const delay = Math.random() * (max - min) + min;
        console.log(`[AutoMassRecruit] randomDelay: warte ${delay.toFixed(0)} ms`);
        setTimeout(callback, delay);
    }

    // Nach Erfolg zurück zur Mass-Rekrutierung
    if (location.href.includes('screen=train&mode=success') && location.href.includes('action=train_mass')) {
        console.log('[AutoMassRecruit] Erfolgseite erkannt');
        const backLink = document.querySelector('a[href*="screen=train&mode=mass"][href*="page=0"]');
        if (backLink) {
            randomDelay(1000, 5000, () => {
                console.log('[AutoMassRecruit] Redirect zur Mass-Rekrutierung');
                location.href = backLink.href;
            });
        } else {
            console.warn('[AutoMassRecruit] Rückkehr-Link nicht gefunden');
        }
        return;
    }

    // Persistenz laden
    let running = localStorage.getItem('autoMR_running') === 'true';
    let selectedTypes = [];
    let savedInterval = parseFloat(localStorage.getItem('autoMR_interval')) || 20; // Defaultintervall 20 Minuten
    let savedThreshold = parseInt(localStorage.getItem('autoMR_threshold'), 10) || 5;
    try {
        selectedTypes = JSON.parse(localStorage.getItem('autoMR_selectedTypes')) || [];
        console.log('[AutoMassRecruit] geladene Typen:', selectedTypes);
    } catch (e) {
        selectedTypes = [];
    }

    let reloadTimeout;

    // UI erstellen
    const ui = document.createElement('div');
    Object.assign(ui.style, {
        position: 'fixed', top: '80px', right: '20px',
        background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px',
        borderRadius: '5px', zIndex: 9999, fontFamily: 'Arial, sans-serif', fontSize: '14px'
    });
    ui.innerHTML = `
      <div style="margin-bottom:5px;"><strong>Auto-MassRecruit</strong></div>
      <button id="tm-start">Starten</button>
      <button id="tm-stop" disabled>Stopp</button>
      <div style="margin-top:5px;"><label for="tm-threshold">Threshold (Einheiten):</label><br>
        <input id="tm-threshold" type="number" value="${savedThreshold}" step="1" min="1" style="width:50px">
      </div>
      <div style="margin-top:5px;"><label for="tm-interval-min">Intervall (Minuten):</label><br>
        <input id="tm-interval-min" type="number" value="${savedInterval}" // Default intervall 20 anzeigen step="1" min="1" style="width:50px">
      </div>
      <div style="margin-top:5px;">Status: <span id="tm-status">${running?'läuft':'bereit'}</span></div>
    `;
    document.body.appendChild(ui);

    const btnStart = document.getElementById('tm-start');
    const btnStop = document.getElementById('tm-stop');
    const statusEl = document.getElementById('tm-status');
    const intervalInput = document.getElementById('tm-interval-min');
    const thresholdInput = document.getElementById('tm-threshold');

    if (running) {
        btnStart.disabled = true;
        btnStop.disabled = false;
    }

    // Einheiten-Typen aus Formular lesen
    function parseSelectedTypes() {
        console.log('[AutoMassRecruit] parseSelectedTypes');
        selectedTypes = Array.from(document.querySelectorAll('#mr_all_form input[type=text][name]'))
            .filter(i => parseInt(i.value, 10) > 0)
            .map(i => i.name);
        console.log('[AutoMassRecruit] ausgewählte Typen:', selectedTypes);
    }

    // Truppen einfügen (einmalig)
    function fillTroops(callback) {
        console.log('[AutoMassRecruit] fillTroops: Suche doMRFill-Button');
        const fillBtn = Array.from(document.querySelectorAll('input.btn'))
            .find(b => b.onclick && b.onclick.toString().includes('doMRFill'));
        if (fillBtn) {
            randomDelay(1000, 5000, () => {
                console.log('[AutoMassRecruit] Klick auf Truppen einfügen');
                fillBtn.click();
                callback();
            });
        } else {
            console.warn('[AutoMassRecruit] fillTroops: Button nicht gefunden');
            callback();
        }
    }

    // Rekrutieren-Klick
    function doRecruit() {
        console.log('[AutoMassRecruit] doRecruit: Suche Rekrutieren-Button');
        const btn = document.querySelector('#mass_train_form input.btn-recruit, #mass_train_form button[type=submit]');
        if (btn) {
            randomDelay(1000, 5000, () => {
                console.log('[AutoMassRecruit] Klick auf Rekrutieren');
                btn.click();
            });
        } else {
            console.warn('[AutoMassRecruit] doRecruit: Button nicht gefunden');
            stopLoop();
        }
    }

    // Prüfen und ggf. Rekrutieren
    function checkAndRecruit() {
        console.log('[AutoMassRecruit] checkAndRecruit');
        let need = false;
        const THR = parseInt(thresholdInput.value, 10) || savedThreshold;
        console.log(`[AutoMassRecruit] aktueller Threshold: ${THR}`);
        selectedTypes.forEach(type => {
            document.querySelectorAll(`#mass_train_table input[name*="[${type}]"]`).forEach(input => {
                const vid = input.id.split('_')[1];
                const runVal = parseInt(input.getAttribute('data-running') || '0', 10);
                console.log(`[AutoMassRecruit] ${type}_${vid} running=${runVal}`);
                if (runVal > 0) return;
                const anchor = document.getElementById(`${type}_${vid}_a`);
                if (!anchor) {
                    console.warn(`[AutoMassRecruit] kein Anchor ${type}_${vid}_a`);
                    return;
                }
                const max = parseInt(anchor.textContent.replace(/\D/g, ''), 10);
                console.log(`[AutoMassRecruit] ${type}_${vid} max=${max}`);
                if (max >= THR) {
                    console.log(`[AutoMassRecruit] Setze ${type}_${vid} auf ${THR}`);
                    input.value = THR;
                    input.setAttribute('value', THR);
                    need = true;
                } else {
                    console.log(`[AutoMassRecruit] ${type}_${vid} kann nicht ${THR} bauen, max=${max}`);
                }
            });
        });
        if (need) {
        statusEl.textContent = 'rekrutiert neu';
        doRecruit();
    }
    }

    // Neuladen planen
    function scheduleReload() {
        const minutes = parseFloat(intervalInput.value) || savedInterval;
        const ms = minutes * 60000;
        console.log(`[AutoMassRecruit] nächster Reload in ${minutes} Min (${ms} ms)`);
        localStorage.setItem('autoMR_interval', minutes);
        localStorage.setItem('autoMR_threshold', parseInt(thresholdInput.value, 10));
        reloadTimeout = setTimeout(() => {
            console.log('[AutoMassRecruit] Page Reload');
            location.reload();
        }, ms);
    }

    // Start-Loop
    function startLoop() {
        console.log('[AutoMassRecruit] startLoop');
        if (running) return;
        parseSelectedTypes();
        if (!selectedTypes.length) {
            alert('Bitte Einheiten auswählen');
            console.warn('[AutoMassRecruit] keine Typen');
            return;
        }
        running = true;
        localStorage.setItem('autoMR_running', 'true');
        localStorage.setItem('autoMR_selectedTypes', JSON.stringify(selectedTypes));
        btnStart.disabled = true;
        btnStop.disabled = false;
        statusEl.textContent = 'füge Truppen ein';
        fillTroops(() => {
            statusEl.textContent = 'initial rekrutieren';
            doRecruit();
            statusEl.textContent = 'läuft';
            scheduleReload();
        });
    }

    // Stop-Loop
    function stopLoop() {
        console.log('[AutoMassRecruit] stopLoop');
        running = false;
        localStorage.removeItem('autoMR_running');
        localStorage.removeItem('autoMR_selectedTypes');
        if (reloadTimeout) clearTimeout(reloadTimeout);
        btnStart.disabled = false;
        btnStop.disabled = true;
        statusEl.textContent = 'gestoppt';
    }

    btnStart.addEventListener('click', startLoop);
    btnStop.addEventListener('click', stopLoop);

    // Resume nach Reload
    if (running) {
        console.log('[AutoMassRecruit] resume mit Typen', selectedTypes);
        statusEl.textContent = 'läuft';
        checkAndRecruit();
        scheduleReload();
    }

    console.log('[AutoMassRecruit] Setup done');
})();
