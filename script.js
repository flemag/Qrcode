// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBvBspabP-KImQ-Jb7cQsqRpYB-YN5Gr8A", // Remplacer par votre clé API
    authDomain: "suivi-covoiturage.firebaseapp.com",
    projectId: "suivi-covoiturage",
    storageBucket: "suivi-covoiturage.firebasestorage.app",
    messagingSenderId: "975520826037",
    appId: "1:975520826037:web:13295fd2bf3a1835e734fc",
    measurementId: "G-NNKVVTNV4D"
};

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} catch (e) {
    console.error("Firebase init error:", e);
}
const db = firebase.firestore();
const auth = firebase.auth();


// App Constants
const COLLECTION_TRAJETS = 'trajets';
const EDITOR_EMAIL = 'steve.duquesne@gmail.com';
const GROUP_MEMBERS = ["Steve", "Marc", "Julien"];

const driverColorClasses = {
    [GROUP_MEMBERS[0]]: "driver-1",
    [GROUP_MEMBERS[1]]: "driver-2",
    [GROUP_MEMBERS[2]]: "driver-3",
};

function getDriverClass(driverName) {
    const cleanName = driverName?.trim();
    return cleanName && driverColorClasses[cleanName] ? driverColorClasses[cleanName] : '';
}

// DOM Elements
const dom = {
    authContainer: document.getElementById('auth-container'),
    contentContainer: document.getElementById('content'),
    profileInfo: document.getElementById('profile-info'),
    loginBtn: document.getElementById('login-btn'),
    formSection: document.getElementById('form-section'),
    formTitle: document.getElementById('form-title'),
    form: document.getElementById('ajout-trajet-form'),
    dateInput: document.getElementById('date'),
    conducteurInput: document.getElementById('conducteur'),
    conducteurList: document.getElementById('conducteur-list'),
    passengerContainer: document.getElementById('passenger-container'),
    passagerList: document.getElementById('passager-list'),
    addPassengerBtn: document.getElementById('add-passenger-btn'),
    commentaireInput: document.getElementById('commentaire'),
    editIdInput: document.getElementById('edit-id'),
    cancelEditBtn: document.getElementById('cancel-edit'),
    submitBtn: document.getElementById('submit-btn'),
    listeTrajetsDiv: document.getElementById('liste-trajets'),
    filterMonth: document.getElementById('filter-month'),
    filterYear: document.getElementById('filter-year'),
    filterPerson: document.getElementById('filter-person'),
    resetFiltersBtn: document.getElementById('reset-filters'),
    tabBar: document.getElementById('tab-bar'),
    tabButtons: document.querySelectorAll('.tab-button'),
    tableSection: document.getElementById('table-section'),
    tableTitle: document.getElementById('table-title'),
    calendarSection: document.getElementById('calendar-section'),
    prevMonthBtn: document.getElementById('prev-month-btn'),
    currentMonthYear: document.getElementById('current-month-year'),
    nextMonthBtn: document.getElementById('next-month-btn'),
    calendarGrid: document.getElementById('calendar-grid'),
    tripsForDayDiv: document.getElementById('trips-for-day'),
    statsSection: document.getElementById('stats-section'),
    statsContent: document.getElementById('stats-content'),
    statsTitle: document.getElementById('stats-title'),
    notificationDiv: document.getElementById('notification')
};

// App State
let currentView = 'my-trips';
let trajetsUnsubscribe = null;
let currentCalendarDate = new Date();
let calendarTrips = [];
let allTripsDataCache = null;
let isFetchingStats = false;
let notificationTimeoutId = null;

// --- Data Fetching and Management ---

async function fetchAllTripsData() {
    if (allTripsDataCache) {
        console.log("Using cached trip data for suggestions/stats.");
        return allTripsDataCache;
    }
    console.log("Fetching all trip data for suggestions/stats...");
    try {
        const snapshot = await db.collection(COLLECTION_TRAJETS).orderBy("date", "asc").get();
        allTripsDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Fetched ${allTripsDataCache.length} trips.`);
        return allTripsDataCache;
    } catch (error) {
        console.error("Error fetching all trip data:", error);
        allTripsDataCache = null;
        return null;
    }
}

async function updateSuggestionDatalists() {
    const allTrips = await fetchAllTripsData();
    if (!allTrips) {
        const memberOptionsHTML = GROUP_MEMBERS.map(member => `<option value="${member}"></option>`).join('');
        dom.conducteurList.innerHTML = memberOptionsHTML;
        dom.passagerList.innerHTML = memberOptionsHTML;
        return;
    }

    const frequencyMap = {};
    allTrips.forEach(trip => {
        const driver = trip.conducteur?.trim();
        if (driver) frequencyMap[driver] = (frequencyMap[driver] || 0) + 1;
        trip.passagers?.forEach(p => {
            const passenger = String(p)?.trim();
            if (passenger) frequencyMap[passenger] = (frequencyMap[passenger] || 0) + 1;
        });
    });

    const sortedNames = Object.keys(frequencyMap)
        .filter(name => name)
        .sort((a, b) => (frequencyMap[b] - frequencyMap[a]) || a.localeCompare(b));

    const uniqueSuggestionNames = [...new Set([...GROUP_MEMBERS, ...sortedNames])];
    const optionsHTML = uniqueSuggestionNames.map(name => `<option value="${name}"></option>`).join('');

    dom.conducteurList.innerHTML = optionsHTML;
    dom.passagerList.innerHTML = optionsHTML;
    console.log("Suggestion datalists updated.");
}

// --- UI Rendering ---

function renderTrajetsTable(trajets) {
    if (!Array.isArray(trajets)) {
        dom.listeTrajetsDiv.innerHTML = `<div class="empty-message error-message"><i class="fas fa-exclamation-triangle"></i> Erreur: Données invalides.</div>`;
        return;
    }
    if (trajets.length === 0) {
        let msg = "Aucun trajet ne correspond aux filtres.";
        if (!dom.filterMonth.value && !dom.filterYear.value && !dom.filterPerson.value) {
            msg = currentView === 'my-trips' ? "Vous n'avez pas encore participé à des trajets." : "Aucun trajet enregistré.";
        }
        dom.listeTrajetsDiv.innerHTML = `<div class="empty-message"><i class="fas fa-info-circle"></i> ${msg}</div>`;
        return;
    }

    const isEditor = auth.currentUser?.email === EDITOR_EMAIL;
    let html = `<table><thead><tr><th>Date</th><th>Conducteur</th><th>Passagers</th><th>Commentaire</th><th>Ajouté par</th><th>Actions</th></tr></thead><tbody>`;
    trajets.forEach(t => {
        let dateStr = 'N/A';
        if (t.date) {
            try {
                dateStr = new Date(t.date + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch (e) {
                dateStr = t.date;
                console.warn("Date parse error:", e);
            }
        }
        const actions = isEditor ? `<button class="btn-edit" data-id="${t.id}" title="Modifier"><i class="fas fa-edit"></i></button><button class="btn-delete" data-id="${t.id}" title="Supprimer"><i class="fas fa-trash"></i></button>` : '';
        const passengers = t.passagers?.filter(p => p?.trim()).map(p => `<span class="badge badge-passenger">${String(p).trim()}</span>`).join(' ') || '<em>Aucun</em>';
        const driverName = t.conducteur?.trim() || '?';
        const driverClass = getDriverClass(driverName);
        html += `<tr class="${driverClass}"><td data-label="Date">${dateStr}</td><td data-label="Conducteur" class="${driverClass}">${driverName}</td><td data-label="Passagers">${passengers}</td><td data-label="Commentaire">${t.commentaire || '-'}</td><td data-label="Ajouté par">${t.createdByName || t.lastModifiedByName || 'Inconnu'}</td><td data-label="Actions" class="action-col">${actions}</td></tr>`;
    });
    html += `</tbody></table>`;
    dom.listeTrajetsDiv.innerHTML = html;
}

function renderCalendar(date) {
    const y = date.getFullYear(), m = date.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const days = last.getDate();
    const startDay = (first.getDay() === 0) ? 6 : first.getDay() - 1;
    const weeks = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    dom.currentMonthYear.textContent = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    let gridHTML = weeks.map(d => `<div class="calendar-day weekday-header">${d}</div>`).join('');
    gridHTML += '<div class="calendar-day empty"></div>'.repeat(startDay);
    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= days; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const tripsForDay = calendarTrips.filter(t => t.date === dateStr);
        let summary = '', driverClassForDay = '';
        if (tripsForDay.length > 0) {
            const driverName = tripsForDay[0].conducteur?.trim() || '?';
            driverClassForDay = getDriverClass(driverName);
            const totalPeople = tripsForDay.reduce((sum, t) => sum + 1 + (t.passagers?.filter(p => p?.trim()).length || 0), 0);
            summary = `<div class="trip-summary" title="${tripsForDay.length} Trajet(s), ${totalPeople} pers.">${tripsForDay.length}T (${totalPeople}p)</div>`;
        }
        gridHTML += `<div class="calendar-day ${driverClassForDay} ${tripsForDay.length ? 'has-trip' : ''} ${dateStr === todayStr ? 'today' : ''}" data-date="${dateStr}"><span class="day-number">${d}</span>${summary}</div>`;
    }
    gridHTML += '<div class="calendar-day empty"></div>'.repeat((7 - (startDay + days) % 7) % 7);
    dom.calendarGrid.innerHTML = gridHTML;
}

function displayTripsForDay(dateStr) {
    const trips = calendarTrips.filter(t => t.date === dateStr);
    let detailsHTML;
    try {
        const dateObj = new Date(Date.UTC(...dateStr.split('-').map((p, i) => i === 1 ? Number(p) - 1 : Number(p))));
        detailsHTML = `<h4>Détails pour le ${dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h4>`;
    } catch (e) {
        detailsHTML = `<h4>Détails pour ${dateStr}</h4>`;
    }
    if (trips.length > 0) {
        detailsHTML += '<ul>';
        trips.forEach(t => {
            const passengersStr = t.passagers?.filter(p => p?.trim()).map(p => String(p).trim()).join(', ') || '<em>Aucun</em>';
            const driverName = t.conducteur?.trim() || '?';
            const driverClass = getDriverClass(driverName);
            detailsHTML += `<li class="${driverClass}"><div><strong>Conducteur : </strong> <span class="driver-name ${driverClass}">${driverName}</span></div><div><strong>Passagers : </strong> ${passengersStr}</div>${t.commentaire ? `<div><strong>Note:</strong> ${t.commentaire}</div>` : ''}</li>`;
        });
        detailsHTML += '</ul>';
    } else {
        detailsHTML += '<p>Aucun trajet enregistré pour ce jour.</p>';
    }
    dom.tripsForDayDiv.innerHTML = detailsHTML;
}

// --- Firestore Subscriptions and Actions ---

function subscribeToTrajets() {
    if (currentView !== 'my-trips' && currentView !== 'all-trips') return;
    if (trajetsUnsubscribe) trajetsUnsubscribe();

    dom.listeTrajetsDiv.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>`;

    let query = db.collection(COLLECTION_TRAJETS).orderBy('date', 'desc');
    const month = dom.filterMonth.value, year = dom.filterYear.value;
    if (month && year) {
        const y = parseInt(year), m = parseInt(month); const start = `${y}-${String(m).padStart(2,'0')}-01`;
        const nextM = new Date(y, m, 1); const end = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2,'0')}-01`;
        query = query.where('date', '>=', start).where('date', '<', end);
    } else if (year) {
        const y = parseInt(year);
        query = query.where('date', '>=', `${y}-01-01`).where('date', '<', `${y + 1}-01-01`);
    }

    trajetsUnsubscribe = query.onSnapshot((snapshot) => {
        let trajets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const term = dom.filterPerson.value.trim().toLowerCase();
        if (term) {
            trajets = trajets.filter(t => (t.conducteur?.toLowerCase().includes(term)) || (t.passagers?.some(p => String(p)?.toLowerCase().includes(term))));
        }
        if (currentView === 'my-trips') {
            const user = auth.currentUser;
            if (user?.uid) {
                const userName = user.displayName?.trim();
                trajets = trajets.filter(t => t.createdByUid === user.uid || (userName && (t.passagers?.some(p => p?.trim() === userName) || t.conducteur?.trim() === userName)));
            } else {
                trajets = [];
            }
        }
        renderTrajetsTable(trajets);
    }, (error) => {
        console.error("Firestore listener error (Table):", error);
        const msg = error.code === 'permission-denied' ? "permissions" : error.message;
        dom.listeTrajetsDiv.innerHTML = `<div class="empty-message error-message"><i class="fas fa-${error.code === 'permission-denied' ? 'lock' : 'exclamation-triangle'}"></i> Erreur: ${msg}</div>`;
        trajetsUnsubscribe = null;
    });
}

async function fetchCalendarTrips(date) {
    dom.calendarGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>`;
    dom.tripsForDayDiv.innerHTML = '<p>Chargement des trajets...</p>';
    const y = date.getFullYear(), m = date.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`;

    try {
        const snapshot = await db.collection(COLLECTION_TRAJETS).where('date', '>=', start).where('date', '<=', end).orderBy('date', 'asc').get();
        calendarTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar(currentCalendarDate);
        dom.tripsForDayDiv.innerHTML = '<p>Cliquez sur un jour pour voir les détails.</p>';
    } catch (error) {
        console.error("Error fetching calendar trips:", error);
        showNotification("Erreur chargement calendrier.", true);
        dom.calendarGrid.innerHTML = `<div class="empty-message error-message" style="grid-column: 1 / -1;"><i class="fas fa-exclamation-triangle"></i> Erreur.</div>`;
        calendarTrips = [];
        dom.tripsForDayDiv.innerHTML = '<p>Erreur chargement détails.</p>';
    }
}

async function fetchAndRenderDriverOverview() {
    if (isFetchingStats) return;
    isFetchingStats = true;
    dom.statsContent.innerHTML = `<progress></progress>`;

    try {
        const allTrips = await fetchAllTripsData();
        if (!allTrips) {
            dom.statsContent.innerHTML = `<p><i class="fas fa-info-circle"></i> Aucune donnée de trajet pour générer des suggestions.</p>`;
            isFetchingStats = false;
            return;
        }

        // Helper to generate combinations
        function getCombinations(array, size) {
            const result = [];
            function combination(index, currentCombo) {
                if (currentCombo.length === size) {
                    result.push([...currentCombo]);
                    return;
                }
                if (index === array.length) return;
                currentCombo.push(array[index]);
                combination(index + 1, currentCombo);
                currentCombo.pop();
                combination(index + 1, currentCombo);
            }
            combination(0, []);
            return result;
        }

        const scenarios = [
            ...getCombinations(GROUP_MEMBERS, 3),
            ...getCombinations(GROUP_MEMBERS, 2)
        ].sort((a, b) => b.length - a.length || a.join(',').localeCompare(b.join(',')));

        let cardsHtml = '<div class="grid">';
        const todayStr = new Date().toISOString().split('T')[0];

        for (const group of scenarios) {
            const groupSet = new Set(group);
            const groupTrips = allTrips.filter(trip => {
                const participants = new Set([trip.conducteur?.trim(), ...(trip.passagers?.map(p => String(p)?.trim()) || [])]);
                if (participants.size !== groupSet.size) return false;
                return [...participants].every(p => groupSet.has(p));
            });

            const groupStats = {};
            group.forEach(member => {
                groupStats[member] = { name: member, timesDriven: 0, lastDriveDate: null, futureDrives: 0 };
            });

            groupTrips.forEach(trip => {
                const driver = trip.conducteur?.trim();
                if (group.includes(driver)) {
                    groupStats[driver].timesDriven++;
                    if (trip.date > (groupStats[driver].lastDriveDate || '')) {
                         groupStats[driver].lastDriveDate = trip.date;
                    }
                    if (trip.date > todayStr) {
                         groupStats[driver].futureDrives++;
                    }
                }
            });

            let suggestedDriver = null;
            let reason = "Aucun historique de trajet pour ce groupe.";

            if (groupTrips.length > 0) {
                const sortedGroupMembers = [...group].sort((a, b) => {
                    const sA = groupStats[a], sB = groupStats[b];
                    if (sA.futureDrives !== sB.futureDrives) return sA.futureDrives - sB.futureDrives;
                    const dateA = sA.lastDriveDate ? new Date(sA.lastDriveDate) : new Date(0);
                    const dateB = sB.lastDriveDate ? new Date(sB.lastDriveDate) : new Date(0);
                    if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
                    if (sA.timesDriven !== sB.timesDriven) return sA.timesDriven - sB.timesDriven;
                    return a.localeCompare(b);
                });

                suggestedDriver = sortedGroupMembers[0];
                const stats = groupStats[suggestedDriver];
                if (stats.futureDrives > 0) {
                    reason = `Conduira ${stats.futureDrives}x prochainement mais reste le meilleur choix.`;
                } else if (stats.lastDriveDate) {
                    const daysAgo = Math.round((new Date(todayStr) - new Date(stats.lastDriveDate)) / (1000 * 60 * 60 * 24));
                    reason = `Dernière conduite il y a ${daysAgo} jour(s).`;
                } else {
                    reason = `N'a jamais conduit dans cette configuration.`;
                }
            } else {
                suggestedDriver = [...group].sort()[0];
            }

            cardsHtml += `
                <article>
                    <header><strong>Groupe : ${group.join(', ')}</strong></header>
                    ${suggestedDriver ? `
                    <div style="text-align: center;">
                        <p><small>Conducteur Suggéré</small></p>
                        <h3 style="margin: 0;"><i class="fas fa-star" style="color: var(--pico-primary);"></i> ${suggestedDriver}</h3>
                        <p><small><em>${reason}</em></small></p>
                    </div>` : `<p>Aucune suggestion disponible.</p>`}
                </article>`;
        }
        cardsHtml += '</div>';
        dom.statsContent.innerHTML = cardsHtml;

    } catch (error) {
        console.error("Error in fetchAndRenderDriverOverview:", error);
        const msg = error.code === 'permission-denied' ? "permissions." : `Erreur: ${error.message}`;
        dom.statsContent.innerHTML = `<p>${msg}</p>`;
    } finally {
        isFetchingStats = false;
    }
}

async function editTrajet(trajetId) {
    if (!trajetId) {
        showNotification("ID manquant.", true);
        return;
    }
    await updateSuggestionDatalists();
    switchView('form');
    try {
        const docRef = db.collection(COLLECTION_TRAJETS).doc(trajetId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            showNotification("Trajet non trouvé.", true);
            resetForm();
            return;
        }
        const t = docSnap.data();
        dom.dateInput.value = t.date || '';
        dom.conducteurInput.value = t.conducteur || '';
        dom.commentaireInput.value = t.commentaire || '';
        dom.editIdInput.value = trajetId;
        dom.formTitle.textContent = 'Modifier le Trajet';
        dom.submitBtn.innerHTML = '<i class="fas fa-save"></i> Mettre à jour';
        dom.cancelEditBtn.style.display = 'inline-flex';
        dom.passengerContainer.innerHTML = '';
        if (t.passagers?.length > 0) {
            t.passagers.forEach(p => addPassengerField(String(p).trim()));
        } else {
            addPassengerField();
        }
        updatePassengerRemoveButtonsState();
    } catch (error) {
        const msg = error.code === 'permission-denied' ? "permissions" : error.message;
        showNotification(`Erreur récupération: ${msg}`, true);
        resetForm();
    }
}

async function deleteTrajet(trajetId) {
    if (!trajetId || auth.currentUser?.email !== EDITOR_EMAIL) {
        showNotification("Action non autorisée.", true);
        return;
    }
    if (window.confirm("Supprimer ce trajet ? Cette action est irréversible.")) {
        try {
            await db.collection(COLLECTION_TRAJETS).doc(trajetId).delete();
            showNotification("Trajet supprimé.");
            allTripsDataCache = null; // Invalidate cache
            if (dom.editIdInput.value === trajetId) resetForm();
            if (currentView === 'calendar') fetchCalendarTrips(currentCalendarDate);
            else if (currentView === 'stats') fetchAndRenderDriverOverview();
        } catch (error) {
            const msg = error.code === 'permission-denied' ? "permissions" : error.message;
            showNotification(`Erreur suppression: ${msg}`, true);
        }
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const date = dom.dateInput.value, conducteur = dom.conducteurInput.value.trim();
    if (!date || !conducteur || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        showNotification("Date ou conducteur manquant/invalide.", true);
        return;
    }
    const commentaire = dom.commentaireInput.value.trim();
    const passagers = Array.from(dom.passengerContainer.querySelectorAll('.passenger-input')).map(input => input.value.trim()).filter(Boolean);
    const trajetId = dom.editIdInput.value;
    const user = auth.currentUser;

    const data = {
        date,
        conducteur,
        passagers,
        commentaire,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (user) {
        data.lastModifiedByUid = user.uid;
        data.lastModifiedByName = user.displayName || user.email;
        if (!trajetId) {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.createdByUid = user.uid;
            data.createdByName = user.displayName || user.email;
        }
    }

    dom.submitBtn.disabled = true;
    dom.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde...';

    try {
        if (trajetId) {
            await db.collection(COLLECTION_TRAJETS).doc(trajetId).update(data);
            showNotification("Trajet mis à jour !");
        } else {
            await db.collection(COLLECTION_TRAJETS).add(data);
            showNotification("Trajet ajouté !");
        }
        allTripsDataCache = null; // Invalidate cache
        resetForm();
        switchView('my-trips');
    } catch (error) {
        const msg = error.code === 'permission-denied' ? "permissions" : error.message;
        console.error("Error saving trajet:", error);
        showNotification(`Erreur sauvegarde: ${msg}`, true);
    } finally {
        dom.submitBtn.disabled = false;
        dom.submitBtn.innerHTML = dom.editIdInput.value ? '<i class="fas fa-save"></i> Mettre à jour' : 'Enregistrer';
    }
}

// --- Event Listeners and Initial Setup ---

// --- Authentication Logic ---
auth.onAuthStateChanged(user => {
    const loggedIn = !!user;
    dom.authContainer.style.display = loggedIn ? 'none' : 'block';
    dom.contentContainer.style.display = loggedIn ? 'block' : 'none';

    // Show the correct navigation based on screen size
    if (loggedIn) {
        if (window.innerWidth < 768) {
            dom.tabBar.style.display = 'flex';
            document.getElementById('desktop-nav').style.display = 'none';
        } else {
            dom.tabBar.style.display = 'none';
            document.getElementById('desktop-nav').style.display = 'block';
        }
    } else {
        dom.tabBar.style.display = 'none';
        document.getElementById('desktop-nav').style.display = 'none';
    }


    if (trajetsUnsubscribe) trajetsUnsubscribe();
    if (dom.listeTrajetsDiv.dataset.listenerAttached) {
        dom.listeTrajetsDiv.removeEventListener('click', handleTableActions);
        delete dom.listeTrajetsDiv.dataset.listenerAttached;
    }

    if (loggedIn) {
        dom.profileInfo.innerHTML = `<div>${user.displayName || user.email}</div><img src="${user.photoURL || 'https://via.placeholder.com/40'}" alt="Avatar" referrerpolicy="no-referrer"><button id="logout-btn" title="Déconnexion">Déconnexion</button>`;
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut().catch(e => showNotification("Erreur déconnexion.", true)));

        populateYearFilter();
        resetForm();

        dom.listeTrajetsDiv.addEventListener('click', handleTableActions);
        dom.listeTrajetsDiv.dataset.listenerAttached = 'true';

        switchView('my-trips');
        showNotification(`Bienvenue ${user.displayName || user.email} !`);
    } else {
        dom.profileInfo.innerHTML = '';
        ['listeTrajetsDiv', 'calendarGrid', 'tripsForDayDiv', 'statsContent'].forEach(elId => dom[elId].innerHTML = '');
        dom.tripsForDayDiv.innerHTML = '<p>Veuillez vous connecter.</p>';
        currentCalendarDate = new Date();
        dom.contentContainer.querySelectorAll('.content-section').forEach(s => {
            s.classList.remove('active');
            s.style.display = 'none';
        });
        document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b.dataset.view === 'my-trips'));
        allTripsDataCache = null;
        isFetchingStats = false;
        currentView = 'my-trips';
    }
});


// --- Event Listeners and Initial Setup ---

function setupEventListeners() {
    dom.loginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            const msg = {
                'auth/popup-closed-by-user': "Fenêtre de connexion fermée.",
                'auth/cancelled-popup-request': "Autre fenêtre de connexion ouverte.",
            }[error.code] || `Erreur connexion Google: ${error.message}`;
            showNotification(msg, true);
        });
    });

    dom.addPassengerBtn.addEventListener('click', () => addPassengerField());
    dom.passengerContainer.addEventListener('click', (e) => {
        if (e.target.closest('.remove-passenger-btn')) {
            const row = e.target.closest('.passenger-row');
            if (dom.passengerContainer.querySelectorAll('.passenger-row').length > 1) row.remove();
            else row.querySelector('.passenger-input').value = '';
            updatePassengerRemoveButtonsState();
        }
    });

    dom.cancelEditBtn.addEventListener('click', resetForm);
    dom.form.addEventListener('submit', handleFormSubmit);

    const debouncedTableRefresh = debounce(subscribeToTrajets, 400);
    ['filterMonth', 'filterYear'].forEach(id => dom[id].addEventListener('change', subscribeToTrajets));
    dom.filterPerson.addEventListener('input', debouncedTableRefresh);
    dom.resetFiltersBtn.addEventListener('click', () => {
        dom.filterMonth.value = '';
        dom.filterYear.value = new Date().getFullYear();
        dom.filterPerson.value = '';
        if (['my-trips', 'all-trips'].includes(currentView)) subscribeToTrajets();
    });

    const allNavButtons = document.querySelectorAll('.tab-button');
    allNavButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            const view = button.dataset.view;
            if (view) {
                if (dom.editIdInput.value && currentView === 'form' && !window.confirm("Modifications non enregistrées. Quitter quand même ?")) {
                    return;
                }
                if (currentView === 'form') resetForm();
                switchView(view);
            }
        });
    });

    dom.prevMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        fetchCalendarTrips(currentCalendarDate);
    });
    dom.nextMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        fetchCalendarTrips(currentCalendarDate);
    });

    dom.calendarGrid.addEventListener('click', (event) => {
        const dayElement = event.target.closest('.calendar-day[data-date]');
        if (dayElement && !dayElement.classList.contains('empty') && !dayElement.classList.contains('weekday-header')) {
            const dateStr = dayElement.dataset.date;
            displayTripsForDay(dateStr);
            dom.calendarGrid.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            dayElement.classList.add('selected');
        }
    });
}

// --- Utility Functions ---

function showNotification(message, isError = false) {
    dom.notificationDiv.textContent = message;
    dom.notificationDiv.className = `notification ${isError ? 'error' : ''} show`;
    if (notificationTimeoutId) clearTimeout(notificationTimeoutId);
    notificationTimeoutId = setTimeout(() => { dom.notificationDiv.classList.remove('show'); notificationTimeoutId = null; }, 3500);
}

function populateYearFilter() {
    const currentYear = new Date().getFullYear();
    dom.filterYear.innerHTML = '<option value="">Toutes</option>';
    for (let year = currentYear + 1; year >= currentYear - 5; year--) {
        dom.filterYear.add(new Option(year, year));
    }
    dom.filterYear.value = currentYear;
}

function addPassengerField(value = '') {
    const row = document.createElement('div');
    row.className = 'passenger-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'passenger-input';
    input.placeholder = 'Nom du passager (optionnel)';
    input.value = value;
    input.setAttribute('list', 'passager-list');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-passenger-btn';
    removeBtn.innerHTML = '<i class="fas fa-minus"></i>';
    removeBtn.title = "Supprimer passager";
    row.append(input, removeBtn);
    dom.passengerContainer.appendChild(row);
    updatePassengerRemoveButtonsState();
}

function updatePassengerRemoveButtonsState() {
    const rows = dom.passengerContainer.querySelectorAll('.passenger-row');
    rows.forEach((row, index) => {
        const btn = row.querySelector('.remove-passenger-btn');
        if(btn) btn.style.display = (rows.length > 1 || (index === 0 && rows[0].querySelector('input').value)) ? 'flex' : 'none';
    });
    if (rows.length === 0) {
        addPassengerField();
    }
}

function resetForm() {
    dom.form.reset();
    dom.editIdInput.value = '';
    dom.formTitle.textContent = 'Ajouter un Trajet';
    dom.submitBtn.innerHTML = 'Enregistrer';
    dom.cancelEditBtn.style.display = 'none';
    dom.passengerContainer.innerHTML = '';
    addPassengerField();
    dom.dateInput.value = new Date().toISOString().split('T')[0];
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleTableActions(event) {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    const id = button.dataset.id;
    if (!id) return;

    if (button.classList.contains('btn-edit')) editTrajet(id);
    else if (button.classList.contains('btn-delete')) deleteTrajet(id);
}

function switchView(view) {
    console.log("Switching view to:", view);
    currentView = view;

    // Update tab bar UI
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.toggle('active', button.dataset.view === view);
    });

    // Hide all sections and remove active class
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });

    const targetSectionId = {
        'form': 'form-section',
        'my-trips': 'table-section',
        'all-trips': 'table-section',
        'calendar': 'calendar-section',
        'stats': 'stats-section'
    }[view];

    const activeSection = document.getElementById(targetSectionId);

    if (activeSection) {
        activeSection.style.display = 'block';
        activeSection.classList.add('active');
    }

    // Trigger data loading for the new view
    switch (view) {
        case 'form':
            if (!dom.editIdInput.value) resetForm();
            updateSuggestionDatalists();
            break;
        case 'my-trips':
        case 'all-trips':
            subscribeToTrajets();
            break;
        case 'calendar':
            fetchCalendarTrips(currentCalendarDate);
            break;
        case 'stats':
            fetchAndRenderDriverOverview();
            break;
    }

    if (trajetsUnsubscribe && !['my-trips', 'all-trips'].includes(view)) {
        trajetsUnsubscribe();
        trajetsUnsubscribe = null;
    }
}

// Initial Load
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    dom.contentContainer.style.display = 'none';
    dom.tabBar.style.display = 'none';
    dom.authContainer.style.display = 'block';
    dom.tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === 'my-trips'));
});
