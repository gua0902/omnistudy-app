// =========================================================================
// OmniStudy App - Core JavaScript Controller
// Connects UI with Supabase Backend & handles interactive animations
// =========================================================================

// Initialize Supabase Client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Global State
let usersList = [];
let activeUser = null;
const userMap = new Map();
const activeFilters = { notes: 'all', calendar: 'all', todo: 'all', qa: 'all', quiz: 'all' };
let filterActiveModule = null;

let currentNotes = [];
let currentEvents = [];
let currentTodos = [];
let currentQuestions = [];
let currentSolutions = [];
let currentQuizzes = [];
let formQuizOptions = ['', ''];
let formQuizCorrectIndex = 0;
let currentQuizAnswers = [];
let calendarViewMode = 'month';
let activeTodoSubFilter = 'all';
let activeQaSubFilter = 'all';

function getLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isDateInCurrentWeek(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    sunday.setHours(0, 0, 0, 0);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);
    return d >= sunday && d <= saturday;
}

let activeQuestionId = null;

// Mini Calendar State
let calendarCurrentDate = new Date();
let calendarSelectedDate = new Date();



// =========================================================================
// 10c. Dashboard & Helper Global Actions
// =========================================================================
async function loadDashboardData() {
    try {
        await fetchNotes();
        await fetchCalendarEvents();
        await fetchTodos();
        await fetchQuizzes();
        await fetchQuizAnswers();

        const todayStr = getLocalDateString(new Date());
        const todayTodos = currentTodos.filter(t => t.due_date === todayStr && !t.is_completed);
        const todayEvents = currentEvents.filter(e => e.event_date === todayStr);
        const todayQuizzes = currentQuizzes.filter(q => getLocalDateString(new Date(q.created_at)) === todayStr);
        const todayNotes = currentNotes.filter(n => getLocalDateString(new Date(n.updated_at)) === todayStr);

        document.getElementById('db-count-todo').textContent = todayTodos.length;
        document.getElementById('db-count-events').textContent = todayEvents.length;
        document.getElementById('db-count-quizzes').textContent = todayQuizzes.length;
        document.getElementById('db-count-notes').textContent = todayNotes.length;

        const eventsContainer = document.getElementById('db-focus-events');
        const todosContainer = document.getElementById('db-focus-todos');

        if (eventsContainer) {
            if (todayEvents.length === 0) {
                eventsContainer.innerHTML = '<div class="empty-state-simple">今天沒有排定日程。</div>';
            } else {
                eventsContainer.innerHTML = todayEvents.map(e => `
                    <div class="focus-item">
                        <div class="focus-item-content">
                            <div class="focus-item-title">${e.title}</div>
                            <div class="focus-item-meta">
                                ${getSubjectBadgeHtml(e.subject, "padding: 2px 8px; font-size: 11px;")}
                                <span>${e.start_time.substring(0, 5)} - ${e.end_time.substring(0, 5)}</span>
                            </div>
                        </div>
                        <i data-lucide="clock" style="width: 16px; height: 16px; opacity: 0.5;"></i>
                    </div>
                `).join('');
            }
        }

        if (todosContainer) {
            if (todayTodos.length === 0) {
                todosContainer.innerHTML = '<div class="empty-state-simple">今天沒有待辦任務。</div>';
            } else {
                todosContainer.innerHTML = todayTodos.map(t => `
                    <div class="focus-item">
                        <div class="focus-item-content">
                            <div class="focus-item-title">${t.title}</div>
                            <div class="focus-item-meta">
                                ${getSubjectBadgeHtml(t.subject, "padding: 2px 8px; font-size: 11px;")}
                            </div>
                        </div>
                        <button class="btn-icon" onclick="completeTodoFromDashboard('${t.id}')" title="標示為完成" style="color: var(--text-secondary); cursor: pointer;">
                            <i data-lucide="circle" style="width: 20px; height: 20px;"></i>
                        </button>
                    </div>
                `).join('');
            }
        }

        lucide.createIcons();
    } catch (err) {
        console.error("Error loading dashboard data:", err);
    }
}

window.completeTodoFromDashboard = async function(todoId) {
    try {
        const { error } = await supabaseClient
            .from('todos')
            .update({ is_completed: true })
            .eq('id', todoId);
        if (error) throw error;
        await loadDashboardData();
    } catch (err) {
        console.error("Dashboard complete todo error:", err);
    }
};

window.deleteQuiz = async function(quizId) {
    if (!confirm("確定要刪除此挑戰題目嗎？")) return;
    try {
        const { error } = await supabaseClient.from('quiz_questions').delete().eq('id', quizId);
        if (error) throw error;
        await fetchQuizzes();
        await fetchQuizAnswers();
        renderQuizzes();
    } catch (err) {
        console.error("Delete quiz error:", err);
        alert("操作失敗，請稍後再試！");
    }
};



// =========================================================================
// 10d. Discord-style Quiz Option Builder
// =========================================================================
function renderDiscordPollBuilder() {
    const container = document.getElementById('discord-poll-builder');
    if (!container) return;
    container.innerHTML = '';

    formQuizOptions.forEach((optionText, index) => {
        const letter = String.fromCharCode(65 + index);
        const row = document.createElement('div');
        row.className = 'discord-option-row';

        const isChecked = index === formQuizCorrectIndex ? 'checked' : '';
        const removeBtnHtml = formQuizOptions.length > 2 
            ? `<button type="button" class="btn-discord-remove-option" onclick="removeQuizOptionBuilder(${index})" title="刪除選項">
                 <i data-lucide="x" style="width: 18px; height: 18px;"></i>
               </button>`
            : '';

        row.innerHTML = `
            <label class="discord-radio-wrapper" title="設定為正確答案">
                <input type="radio" name="discord-correct-choice" value="${index}" class="discord-radio-input" ${isChecked} onchange="setQuizCorrectOptionBuilder(${index})">
            </label>
            <span style="font-weight: 600; font-size: 14px; color: var(--text-secondary); width: 20px; display: inline-block;">${letter}.</span>
            <input type="text" class="discord-option-text-input" placeholder="輸入選項 ${letter} 內容..." value="${optionText}" oninput="updateQuizOptionBuilderText(${index}, this.value)" required>
            ${removeBtnHtml}
        `;

        container.appendChild(row);
    });

    const addBtn = document.getElementById('btn-quiz-add-option');
    if (addBtn) {
        addBtn.disabled = formQuizOptions.length >= 4;
    }

    const countLabel = document.getElementById('quiz-options-count');
    if (countLabel) {
        countLabel.textContent = `${formQuizOptions.length}/4 個選項`;
    }

    lucide.createIcons();
}

window.setQuizCorrectOptionBuilder = function(index) {
    formQuizCorrectIndex = index;
};

window.updateQuizOptionBuilderText = function(index, val) {
    formQuizOptions[index] = val;
};

window.removeQuizOptionBuilder = function(index) {
    if (formQuizOptions.length <= 2) return;
    formQuizOptions.splice(index, 1);
    if (formQuizCorrectIndex >= formQuizOptions.length) {
        formQuizCorrectIndex = formQuizOptions.length - 1;
    }
    renderDiscordPollBuilder();
};


// =========================================================================
// 10b. Quiz Challenge module handlers
// =========================================================================
async function fetchQuizzes() {
    try {
        const { data, error } = await supabaseClient
            .from('quiz_questions')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        currentQuizzes = data || [];
    } catch (err) {
        console.error("Error fetching quizzes:", err);
    }
}

async function fetchQuizAnswers() {
    try {
        const { data, error } = await supabaseClient
            .from('quiz_answers')
            .select('*');
        if (error) throw error;
        currentQuizAnswers = data || [];
    } catch (err) {
        console.error("Error fetching quiz answers:", err);
    }
}

function renderQuizzes() {
    const searchVal = document.getElementById('search-quiz') ? document.getElementById('search-quiz').value.toLowerCase().trim() : '';
    const subjectVal = activeFilters.quiz;

    const listEl = document.getElementById('quiz-grid');
    if (!listEl) return;

    const filtered = currentQuizzes.filter(item => {
        const matchesSearch = item.question_text.toLowerCase().includes(searchVal) ||
                             item.option_a.toLowerCase().includes(searchVal) ||
                             item.option_b.toLowerCase().includes(searchVal) ||
                             (item.option_c && item.option_c.toLowerCase().includes(searchVal)) ||
                             (item.option_d && item.option_d.toLowerCase().includes(searchVal)) ||
                             (item.chapter && item.chapter.toLowerCase().includes(searchVal));
        const matchesSubject = (subjectVal === 'all') || 
                               (subjectVal === 'none' && (!item.subject || item.subject === 'none')) || 
                               (item.subject === subjectVal);
        return matchesSearch && matchesSubject;
    });

    listEl.innerHTML = '';
    if (filtered.length === 0) {
        listEl.innerHTML = `
        <div class="empty-state">
          <i data-lucide="help-circle"></i>
          <div class="empty-state-title">尚無學科出題</div>
          <div>點擊「新增出題」開始設計挑戰。</div>
        </div>`;
        lucide.createIcons();
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'quiz-card';
        
        // Find if active user has answered this quiz
        const userAnswer = currentQuizAnswers.find(ans => ans.quiz_id === item.id && ans.user_id === (activeUser ? activeUser.id : null));
        const hasAnswered = !!userAnswer;

        // Calculate statistics for A, B, C, D
        const allAnswersForQuiz = currentQuizAnswers.filter(ans => ans.quiz_id === item.id);
        const totalVotes = allAnswersForQuiz.length;
        
        const countVotes = (opt) => allAnswersForQuiz.filter(ans => ans.selected_option === opt).length;
        const getPercent = (opt) => {
            if (totalVotes === 0) return 0;
            return Math.round((countVotes(opt) / totalVotes) * 100);
        };

        const percentA = getPercent('A');
        const percentB = getPercent('B');
        const percentC = getPercent('C');
        const percentD = getPercent('D');

        const creator = userMap.get(item.created_by) || `使用者`;
        const subjectClass = getSubjectClass(item.subject);

        let imgHtml = '';
        if (item.image_url) {
            imgHtml = `<img src="${item.image_url}" class="quiz-image" alt="Quiz image" />`;
        }

        // Render card content
        let optionsHtml = '';
        const options = [
            { key: 'A', text: item.option_a, percent: percentA },
            { key: 'B', text: item.option_b, percent: percentB },
            { key: 'C', text: item.option_c, percent: percentC },
            { key: 'D', text: item.option_d, percent: percentD }
        ].filter(opt => opt.text);

        if (!hasAnswered) {
            optionsHtml = `
            <div class="poll-options">
              ${options.map(opt => `
                <button class="poll-option-btn" onclick="submitQuizAnswer('${item.id}', '${opt.key}')">
                  <span class="poll-option-text">${opt.key}. ${opt.text}</span>
                </button>
              `).join('')}
            </div>
            `;
        } else {
            optionsHtml = `
            <div class="poll-options answered">
              ${options.map(opt => {
                  let statusClass = '';
                  let prefix = '';
                  
                  if (opt.key === item.correct_option) {
                      statusClass = 'correct';
                      prefix = '✓ ';
                  } else if (userAnswer.selected_option === opt.key) {
                      statusClass = 'incorrect';
                      prefix = '✗ ';
                  }

                  const isUserSelection = userAnswer.selected_option === opt.key ? 'selected' : '';

                  return `
                    <button class="poll-option-btn ${statusClass} ${isUserSelection}" disabled>
                      <div class="poll-progress-fill" data-percent="${opt.percent}"></div>
                      <span class="poll-option-text"><strong>${prefix}${opt.key}.</strong> ${opt.text}</span>
                      <span class="poll-option-percent">${opt.percent}%</span>
                    </button>
                  `;
              }).join('')}
            </div>
            `;
        }

        // Status badge
        let statusBadge = '';
        if (hasAnswered) {
            if (userAnswer.selected_option === item.correct_option) {
                statusBadge = `<span class="quiz-badge-correct"><i data-lucide="check"></i> 答對了</span>`;
            } else {
                statusBadge = `<span class="quiz-badge-incorrect"><i data-lucide="x"></i> 答錯了 (正確答案是 ${item.correct_option})</span>`;
            }
        } else {
            statusBadge = `<span>尚未作答</span>`;
        }

        // Delete button for creator only
        let deleteBtnHtml = '';
        if (activeUser && item.created_by === activeUser.id) {
            deleteBtnHtml = `<button class="btn-icon" onclick="deleteQuiz('${item.id}')" title="刪除題目" style="color: var(--text-secondary); cursor: pointer;"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>`;
        }

        // Explanation rendering if answered
        let explanationHtml = '';
        if (hasAnswered) {
            explanationHtml = `
            <div class="quiz-explanation-box">
              <strong>💡 題目解析：</strong>
              <div>${parseMarkdown(item.explanation) || '此題目尚無解析。'}</div>
            </div>
            `;
        }

        card.innerHTML = `
          <div class="card-header">
            ${getSubjectBadgeHtml(item.subject)}
            <div class="card-meta">
              <span class="user-avatar">${creator.substring(0, 2)}</span>
              <span>出題者: ${creator} | ${item.chapter ? `章節: ${item.chapter}` : '跨章節'}</span>
              ${deleteBtnHtml}
            </div>
          </div>
          <div class="quiz-question-title">${item.question_text}</div>
          ${imgHtml}
          ${optionsHtml}
          ${explanationHtml}
          <div class="quiz-card-footer">
            ${statusBadge}
            <span>${totalVotes} 人已參與投票</span>
          </div>
        `;

        listEl.appendChild(card);
    });

    lucide.createIcons();

    setTimeout(() => {
        document.querySelectorAll('.poll-options.answered .poll-progress-fill').forEach(fill => {
            const pct = fill.getAttribute('data-percent');
            fill.style.width = `${pct}%`;
        });
    }, 100);
}

window.submitQuizAnswer = async function(quizId, option) {
    if (!activeUser) {
        alert("請先選擇使用者身份！");
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('quiz_answers')
            .insert([{
                quiz_id: quizId,
                user_id: activeUser.id,
                selected_option: option
            }]);
            
        if (error) {
            if (error.code === '23505') {
                alert("您已經回答過此題目！");
            } else {
                throw error;
            }
            return;
        }

        await fetchQuizAnswers();
        renderQuizzes();
    } catch (err) {
        console.error("Error submitting answer:", err);
        alert("提交失敗，請稍後再試！");
    }
};


// =========================================================================
// 1. App Initialization on DOM Loaded
// =========================================================================
window.addEventListener('DOMContentLoaded', async () => {
    console.log("OmniStudy App Initializing (Supabase integrated)...");

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully!', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    }

    // 1.1. Set default body theme on startup (Notes is active tab by default)
    document.body.className = 'theme-dashboard';

    // 1.2. Inject Material You Tab Accent Theme rules
    injectThemeStyles();

    // 1.3. Inject fallback image URL text inputs
    injectUrlInputs();

    // 1.4. Setup file upload previews and reset buttons
    setupPreviewForFileInputs();
    setupPreviewRemoveButtons();

    // 1.5. Fetch users and populate dropdown selectors
    await initUsers();

    // 1.6. Force user selection modal on load
    openModal('modal-force-user');

    // 1.7. Rebind Calendar month controls
    rebindMonthControls();

    // 1.8. Bind UI elements and event listeners
    bindEvents();

    // 1.9. Update selected date text
    updateSelectedDateLabel();

    // 1.10. Initialize pull-to-refresh
    initPullToRefresh();
});

// =========================================================================
// 2. CSS Injector for Material You dynamic tab theme colors
// =========================================================================
function injectThemeStyles() {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        body.theme-notes {
            --accent-indigo: #4f46e5;
            --accent-violet: #7c3aed;
            --gradient-accent: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            --border-focus: rgba(79, 70, 229, 0.4);
        }
        body.theme-calendar {
            --accent-indigo: #7c3aed;
            --accent-violet: #d946ef;
            --gradient-accent: linear-gradient(135deg, #7c3aed 0%, #d946ef 100%);
            --border-focus: rgba(124, 58, 237, 0.4);
        }
        body.theme-todo {
            --accent-indigo: #ea580c;
            --accent-violet: #f59e0b;
            --gradient-accent: linear-gradient(135deg, #ea580c 0%, #f59e0b 100%);
            --border-focus: rgba(234, 88, 12, 0.4);
        }
        body.theme-qa {
            --accent-indigo: #10b981;
            --accent-violet: #059669;
            --gradient-accent: linear-gradient(135deg, #10b981 0%, #059669 100%);
            --border-focus: rgba(16, 185, 129, 0.4);
        }
    `;
    document.head.appendChild(styleEl);
}

// =========================================================================
// 3. User Management Operations (Users)
// =========================================================================
async function initUsers() {
    const fallbackNames = ['3', '7', '18', '34'];
    let fetchedUsers = [];
    
    try {
        console.log("Fetching users from Supabase...");
        const { data, error } = await supabaseClient.from('users').select('*');
        if (error) throw error;
        fetchedUsers = data || [];
    } catch (err) {
        console.error("Fetch users failed:", err);
    }

    // Populate fallback default users if db is empty
    if (fetchedUsers.length === 0) {
        console.log("No users in database. Inserting fallback users...");
        try {
            const insertData = fallbackNames.map(name => ({ name }));
            const { data, error } = await supabaseClient
                .from('users')
                .insert(insertData)
                .select();
            
            if (error) throw error;
            fetchedUsers = data || [];
        } catch (err) {
            console.error("Failed to insert fallback users:", err);
            // Frontend fallback only
            fetchedUsers = fallbackNames.map((name, index) => ({
                id: `00000000-0000-0000-0000-00000000000${index + 1}`,
                name: name
            }));
        }
    }

    usersList = fetchedUsers;
    userMap.clear();
    usersList.forEach(u => userMap.set(u.id, u.name));

    // Populate dropdown selectors
    const dropdown = document.getElementById('user-select');
    const forceDropdown = document.getElementById('force-user-select');
    const savedUserId = localStorage.getItem('omnistudy_user_id');
    
    if (dropdown) {
        dropdown.innerHTML = '';
        usersList.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name;
            dropdown.appendChild(opt);
        });
        if (savedUserId && usersList.some(u => u.id === savedUserId)) {
            dropdown.value = savedUserId;
        }
    }

    if (forceDropdown) {
        forceDropdown.innerHTML = '<option value="" disabled selected>請選擇使用者...</option>';
        usersList.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name;
            forceDropdown.appendChild(opt);
        });
        if (savedUserId && usersList.some(u => u.id === savedUserId)) {
            forceDropdown.value = savedUserId;
        }
    }

    console.log("Users initialized. Saved user ID from storage:", savedUserId);
}

// =========================================================================
// 4. Modal Helpers & Navigation Controls
// =========================================================================
window.openModal = function(id) {
    document.getElementById(id)?.classList.add('active');
};

window.closeModal = function(id) {
    document.getElementById(id)?.classList.remove('active');
};

// Bind Confirmation & Nav events
function bindEvents() {
    // Confirm Forced User on Load
    document.getElementById('btn-confirm-user')?.addEventListener('click', async () => {
        const forceDropdown = document.getElementById('force-user-select');
        const userId = forceDropdown.value;
        if (!userId) {
            alert("請先選擇您的使用者身份！");
            return;
        }
        
        activeUser = usersList.find(u => u.id === userId);
        localStorage.setItem('omnistudy_user_id', userId);
        
        const dropdown = document.getElementById('user-select');
        if (dropdown) {
            dropdown.value = userId;
        }
        
        closeModal('modal-force-user');
        console.log("Forced user confirmed:", activeUser.name);
        
        // Initial fetch of data for the active tab after user is confirmed
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const target = activeTab.getAttribute('data-tab');
            document.body.className = `theme-${target}`;
            await loadDataForView(`panel-${target}`);
        }
    });

    // Logo title click to go back to Dashboard
    document.getElementById('logo-home-btn')?.addEventListener('click', () => {
        const dbBtn = document.getElementById('btn-tab-dashboard');
        if (dbBtn) {
            dbBtn.click();
        }
    });

    // Top Navigation dropdown change
    document.getElementById('user-select')?.addEventListener('change', async (e) => {
        const userId = e.target.value;
        activeUser = usersList.find(u => u.id === userId);
        localStorage.setItem('omnistudy_user_id', userId);
        console.log("Switched active user to:", activeUser.name);
        
        // Reload data for the currently active view
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const target = activeTab.getAttribute('data-tab');
            await loadDataForView(`panel-${target}`);
        }
    });

    // Add New User confirmation
    document.getElementById('btn-save-user')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('new-user-name');
        const name = nameInput.value.trim();
        if (!name) {
            alert("請輸入姓名！");
            return;
        }
        
        try {
            console.log("Adding new user:", name);
            const { data, error } = await supabaseClient
                .from('users')
                .insert({ name })
                .select();
                
            if (error) throw error;
            
            await initUsers();
            
            // Auto select new user
            if (data && data.length > 0) {
                const newUser = data[0];
                const dropdown = document.getElementById('user-select');
                if (dropdown) {
                    dropdown.value = newUser.id;
                    activeUser = newUser;
                    localStorage.setItem('omnistudy_user_id', newUser.id);
                }
            }
            
            nameInput.value = '';
            closeModal('modal-user-form');
        } catch (err) {
            console.error("Failed to add user:", err);
            alert("操作失敗，請稍後再試！");
        }
    });

    // Tab Clicks Handlers
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!activeUser) {
                openModal('modal-force-user');
                return;
            }
            const targetTab = btn.getAttribute('data-tab');
            
            // Set dynamic theme class
            document.body.className = `theme-${targetTab}`;
            
            // Switch tabs explicitly and synchronize active class on both desktop and mobile tab buttons
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => {
                if (b.getAttribute('data-tab') === targetTab) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
            
            const targetPanel = document.getElementById(`panel-${targetTab}`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
            
            await loadDataForView(`panel-${targetTab}`);
        });
    });

    // Funnel Filter Buttons Click Handlers
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            filterActiveModule = btn.getAttribute('data-module');
            const currentSubject = activeFilters[filterActiveModule];
            
            // Highlight currently selected subject
            document.querySelectorAll('.chip-option').forEach(opt => {
                if (opt.getAttribute('data-subject') === currentSubject) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
            
            openModal('modal-filter-subjects');
        });
    });

    // Modal Subject Option Select Handlers
    document.querySelectorAll('.chip-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const subject = opt.getAttribute('data-subject');
            if (!filterActiveModule) return;
            
            activeFilters[filterActiveModule] = subject;
            
            // Update Filter Button UI
            const filterBtn = document.getElementById(`btn-filter-${filterActiveModule}`);
            if (filterBtn) {
                const labelEl = filterBtn.querySelector('.filter-label');
                if (subject === 'all') {
                    labelEl.textContent = '篩選';
                    filterBtn.classList.remove('active-filter');
                } else {
                    labelEl.textContent = `篩選: ${subject}`;
                    filterBtn.classList.add('active-filter');
                }
            }
            
            closeModal('modal-filter-subjects');
            
            // Refresh grid
            if (filterActiveModule === 'notes') renderNotes();
            if (filterActiveModule === 'calendar') renderEvents();
            if (filterActiveModule === 'todo') renderTodos();
            if (filterActiveModule === 'qa') renderQuestions();
        });
    });

    // Search input observers
    document.getElementById('search-notes')?.addEventListener('input', renderNotes);
    document.getElementById('search-calendar')?.addEventListener('input', renderEvents);
    // Calendar Month/Week view toggles
    document.getElementById('btn-view-month')?.addEventListener('click', () => {
        calendarViewMode = 'month';
        document.getElementById('btn-view-month').classList.add('active-view');
        document.getElementById('btn-view-week').classList.remove('active-view');
        animateCalendarRender();
    });
    document.getElementById('btn-view-week')?.addEventListener('click', () => {
        calendarViewMode = 'week';
        document.getElementById('btn-view-week').classList.add('active-view');
        document.getElementById('btn-view-month').classList.remove('active-view');
        animateCalendarRender();
    });

    function animateCalendarRender() {
        const grid = document.getElementById('calendar-days');
        if (grid) {
            grid.classList.add('fade-out');
            setTimeout(() => {
                renderMiniCalendar();
                grid.classList.remove('fade-out');
            }, 200);
        } else {
            renderMiniCalendar();
        }
    }

    document.getElementById('search-todo')?.addEventListener('input', renderTodos);
    // Todo Sub-filters
    document.querySelectorAll('#todo-sub-filters .sub-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#todo-sub-filters .sub-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTodoSubFilter = btn.getAttribute('data-filter');
            renderTodos();
        });
    });

    // QA Sub-filters
    document.querySelectorAll('#qa-sub-filters .sub-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#qa-sub-filters .sub-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeQaSubFilter = btn.getAttribute('data-filter');
            renderQuestions();
        });
    });

    document.getElementById('search-qa')?.addEventListener('input', renderQuestions);
    document.getElementById('search-quiz')?.addEventListener('input', renderQuizzes);

    // Form button triggers
    document.getElementById('btn-open-add-note')?.addEventListener('click', () => {
        document.getElementById('note-form').reset();
        document.getElementById('form-note-id').value = '';
        document.getElementById('note-form-title').textContent = "新增筆記";
        clearImagePreview('note');
        openModal('modal-note-form');
    });

    document.getElementById('btn-open-add-event')?.addEventListener('click', () => {
        document.getElementById('event-form').reset();
        document.getElementById('form-event-id').value = '';
        document.getElementById('event-form-title').textContent = "新增行程";
        clearImagePreview('event');

        // Pre-fill date input with currently selected date in mini calendar
        const dateInput = document.getElementById('event-date');
        if (dateInput) {
            const year = calendarSelectedDate.getFullYear();
            const month = String(calendarSelectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(calendarSelectedDate.getDate()).padStart(2, '0');
            dateInput.value = `${year}-${month}-${day}`;
        }
        openModal('modal-event-form');
    });

    document.getElementById('btn-open-add-todo')?.addEventListener('click', () => {
        document.getElementById('todo-form').reset();
        document.getElementById('form-todo-id').value = '';
        document.getElementById('todo-form-title').textContent = "新增待辦事項";
        clearImagePreview('todo');
        openModal('modal-todo-form');
    });

    document.getElementById('btn-open-add-question')?.addEventListener('click', () => {
        document.getElementById('question-form').reset();
        document.getElementById('form-question-id').value = '';
        document.getElementById('question-form-title').textContent = "學科發問";
        clearImagePreview('question');
        openModal('modal-question-form');
    });

    
}

// View Loader Router
async function loadDataForView(panelId) {
    if (panelId === 'panel-dashboard') {
        await loadDashboardData();
    } else if (panelId === 'panel-notes') {
        await fetchNotes();
        renderNotes();
    } else if (panelId === 'panel-calendar') {
        await fetchCalendarEvents();
        renderMiniCalendar();
        renderEvents();
    } else if (panelId === 'panel-todo') {
        await fetchTodos();
        renderTodos();
    } else if (panelId === 'panel-qa') {
        await fetchQuestions();
        renderQuestions();
    } else if (panelId === 'panel-quiz') {
        await fetchQuizzes();
        await fetchQuizAnswers();
        renderQuizzes();
    }
}

// =========================================================================
// 5. Shared Subject Style & Text Mappings
// =========================================================================
function getSubjectClass(subject) {
    if (subject === '數學' || subject === '物理' || subject === '化學') return 'math';
    if (subject === '國文' || subject === '英文') return 'english';
    if (subject === '生物' || subject === '地科') return 'science';
    return 'general'; // 歷史、地理、公民
}

function getSubjectBadgeHtml(subject, styleStr = '') {
    if (!subject || subject === 'none' || subject === '無') {
        return '';
    }
    const subjectClass = getSubjectClass(subject);
    const styleAttr = styleStr ? ` style="${styleStr}"` : '';
    return `<span class="subject-badge ${subjectClass}"${styleAttr}>${subject}</span>`;
}

function getSubjectDisplayName(subject) {
    return subject || '其他';
}

// Helper to safely parse markdown text
function parseMarkdown(text) {
    if (!text) return '';
    try {
        return marked.parse(text);
    } catch (e) {
        console.error("Markdown parsing failed:", e);
        return text;
    }
}

// =========================================================================
// 6. Fallback Image URL Input Injection & File Handling
// =========================================================================
function injectUrlInputs() {
    const modules = [
        { fileId: 'note-image-file', urlId: 'note-image-url', label: '圖片網址備用方案 (可選)' },
        { fileId: 'event-image-file', urlId: 'event-image-url', label: '圖片網址備用方案 (可選)' },
        { fileId: 'todo-image-file', urlId: 'todo-image-url', label: '圖片網址備用方案 (可選)' },
        { fileId: 'question-image-file', urlId: 'question-image-url', label: '圖片網址備用方案 (可選)' },
        { fileId: 'new-solution-image-file', urlId: 'new-solution-image-url', label: '圖片網址備用方案 (可選)' },
        { fileId: 'quiz-image-file', urlId: 'quiz-image-url', label: '圖片網址備用方案 (可選)' }
    ];
    
    modules.forEach(m => {
        const fileInput = document.getElementById(m.fileId);
        if (fileInput && !document.getElementById(m.urlId)) {
            const widget = fileInput.closest('.file-upload-widget');
            if (widget) {
                const urlGroup = document.createElement('div');
                urlGroup.style.marginTop = '12px';
                urlGroup.innerHTML = `
                    <label for="${m.urlId}" class="form-label" style="font-size: 11px; opacity: 0.8; margin-bottom: 4px; display:block;">${m.label}</label>
                    <input type="url" id="${m.urlId}" class="form-control" placeholder="輸入圖片網址..." style="font-size: 16px; padding: 6px 12px;" />
                `;
                widget.parentNode.insertBefore(urlGroup, widget.nextSibling);
            }
        }
    });
}

function setupPreviewForFileInputs() {
    const inputs = [
        { fileId: 'note-image-file', previewId: 'note-image-preview', containerId: 'note-image-preview-container' },
        { fileId: 'event-image-file', previewId: 'event-image-preview', containerId: 'event-image-preview-container' },
        { fileId: 'todo-image-file', previewId: 'todo-image-preview', containerId: 'todo-image-preview-container' },
        { fileId: 'question-image-file', previewId: 'question-image-preview', containerId: 'question-image-preview-container' },
        { fileId: 'new-solution-image-file', previewId: 'new-solution-image-preview', containerId: 'new-solution-image-preview-container' },
        { fileId: 'quiz-image-file', previewId: 'quiz-image-preview', containerId: 'quiz-image-preview-container' }
    ];
    
    inputs.forEach(item => {
        const fileInput = document.getElementById(item.fileId);
        const preview = document.getElementById(item.previewId);
        const container = document.getElementById(item.containerId);
        
        if (fileInput && preview && container) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        preview.src = evt.target.result;
                        container.style.display = 'block';
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    });
}

function setupPreviewRemoveButtons() {
    const removals = [
        { btnId: 'btn-remove-note-img', previewId: 'note-image-preview', containerId: 'note-image-preview-container', fileId: 'note-image-file', urlId: 'note-image-url' },
        { btnId: 'btn-remove-event-img', previewId: 'event-image-preview', containerId: 'event-image-preview-container', fileId: 'event-image-file', urlId: 'event-image-url' },
        { btnId: 'btn-remove-todo-img', previewId: 'todo-image-preview', containerId: 'todo-image-preview-container', fileId: 'todo-image-file', urlId: 'todo-image-url' },
        { btnId: 'btn-remove-question-img', previewId: 'question-image-preview', containerId: 'question-image-preview-container', fileId: 'question-image-file', urlId: 'question-image-url' },
        { btnId: 'btn-remove-solution-img', previewId: 'new-solution-image-preview', containerId: 'new-solution-image-preview-container', fileId: 'new-solution-image-file', urlId: 'new-solution-image-url' },
        { btnId: 'btn-remove-quiz-img', previewId: 'quiz-image-preview', containerId: 'quiz-image-preview-container', fileId: 'quiz-image-file', urlId: 'quiz-image-url' }
    ];

    removals.forEach(r => {
        document.getElementById(r.btnId)?.addEventListener('click', () => {
            const fileInput = document.getElementById(r.fileId);
            if (fileInput) fileInput.value = '';
            
            const urlInput = document.getElementById(r.urlId);
            if (urlInput) urlInput.value = '';
            
            const preview = document.getElementById(r.previewId);
            if (preview) preview.src = '';
            
            const container = document.getElementById(r.containerId);
            if (container) container.style.display = 'none';
        });
    });
}

function clearImagePreview(prefix) {
    const fileInput = document.getElementById(`${prefix}-image-file`);
    if (fileInput) fileInput.value = '';
    
    const urlInput = document.getElementById(`${prefix}-image-url`);
    if (urlInput) urlInput.value = '';
    
    const preview = document.getElementById(`${prefix}-image-preview`);
    if (preview) preview.src = '';
    
    const container = document.getElementById(`${prefix}-image-preview-container`);
    if (container) container.style.display = 'none';
}

function getFormImageUrl(fileInputId, previewImgId, fallbackUrlId, existingUrl) {
    const fileInput = document.getElementById(fileInputId);
    const previewImg = document.getElementById(previewImgId);
    const fallbackUrlInput = document.getElementById(fallbackUrlId);
    
    // If a new file has been chosen, it needs to be uploaded
    if (fileInput && fileInput.files.length > 0) {
        return 'upload';
    }
    
    // If preview container style is display:none, it means image was deleted by the user
    if (previewImg) {
        const container = previewImg.closest('.image-preview-container');
        if (container && container.style.display === 'none') {
            return null;
        }
    }
    
    // If they typed something in the fallback URL input
    if (fallbackUrlInput && fallbackUrlInput.value.trim()) {
        return fallbackUrlInput.value.trim();
    }
    
    // Otherwise keep the original url
    return existingUrl || null;
}

// Upload file to Supabase Public bucket 'omnistudy'
async function uploadImage(fileInput, urlInput) {
    const file = fileInput.files[0];
    if (file) {
        try {
            console.log("Uploading file to 'omnistudy' bucket...");
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
            const filePath = `uploads/${fileName}`;
            
            const { data, error } = await supabaseClient
                .storage
                .from('omnistudy')
                .upload(filePath, file);
                
            if (error) throw error;
            
            const { data: publicUrlData } = supabaseClient
                .storage
                .from('omnistudy')
                .getPublicUrl(filePath);
                
            console.log("Upload success, public URL:", publicUrlData.publicUrl);
            return publicUrlData.publicUrl;
        } catch (err) {
            console.error("Storage upload failed, trying fallback URL:", err);
            alert("圖片上傳失敗，已自動啟用網址欄位。");
            return urlInput ? urlInput.value.trim() || null : null;
        }
    }
    return urlInput ? urlInput.value.trim() || null : null;
}

// =========================================================================
// 7. Learning Notes Module (Notes)
// =========================================================================
async function fetchNotes() {
    try {
        const { data, error } = await supabaseClient
            .from('notes')
            .select('*')
            .order('updated_at', { ascending: false });
            
        if (error) throw error;
        currentNotes = data || [];
        renderNotes();
    } catch (err) {
        console.error("Fetch notes error:", err);
    }
}

function renderNotes() {
    const searchVal = document.getElementById('search-notes').value.toLowerCase().trim();
    const subjectVal = activeFilters.notes;
    
    const listEl = document.getElementById('notes-grid');
    if (!listEl) return;
    
    // Filter
    const filtered = currentNotes.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchVal) || 
                              item.content.toLowerCase().includes(searchVal);
        const matchesSubject = (subjectVal === 'all') || (item.subject === subjectVal);
        return matchesSearch && matchesSubject;
    });

    listEl.innerHTML = '';
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
              <i data-lucide="inbox"></i>
              <div class="empty-state-title">尚無筆記</div>
              <div>點擊「新增筆記」開始記錄。</div>
            </div>`;
        lucide.createIcons();
        return;
    }

    filtered.forEach(item => {
        const author = userMap.get(item.user_id) || "未知使用者";
        const subjectClass = getSubjectClass(item.subject);
        const subjectDisplayName = getSubjectDisplayName(item.subject);
        const authorInitial = author.charAt(0);
        
        const card = document.createElement('div');
        card.className = `glass-card ${subjectClass}`;
        card.dataset.id = item.id;
        
        let imgHtml = '';
        if (item.image_url) {
            imgHtml = `<img src="${item.image_url}" class="card-img-preview" alt="筆記附圖" />`;
        }

        // Clean Markdown syntax for text preview
        const cleanPreview = item.content.replace(/[#*`~]/g, '');

        card.innerHTML = `
            <div class="card-header">
                ${getSubjectBadgeHtml(item.subject)}
                <span class="card-time-badge">
                    <i data-lucide="clock"></i>
                    ${new Date(item.updated_at).toLocaleDateString()}
                </span>
            </div>
            <h4 class="card-title">${item.title}</h4>
            <p class="card-preview">${cleanPreview}</p>
            ${imgHtml}
            <div class="card-footer">
                <div class="author-info">
                    <div class="author-avatar">${authorInitial}</div>
                    <span>${author}</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            openDetailModal('note', item.id);
        });
        
        listEl.appendChild(card);
    });

    lucide.createIcons();
}

// Save / Update Note
document.getElementById('btn-save-note')?.addEventListener('click', async () => {
    const noteId = document.getElementById('form-note-id').value || null;
    const title = document.getElementById('note-title').value.trim();
    const subject = document.getElementById('note-subject').value;
    const content = document.getElementById('note-content').value.trim();
    
    if (!title || !content) {
        alert("請填寫標題與內容！");
        return;
    }
    
    const fileInput = document.getElementById('note-image-file');
    const urlInput = document.getElementById('note-image-url');
    
    let existingUrl = null;
    if (noteId) {
        const item = currentNotes.find(x => x.id === noteId);
        if (item) existingUrl = item.image_url;
    }
    
    let imageUrl = getFormImageUrl('note-image-file', 'note-image-preview', 'note-image-url', existingUrl);
    if (imageUrl === 'upload') {
        imageUrl = await uploadImage(fileInput, urlInput);
    }
    
    const payload = {
        subject,
        title,
        content,
        image_url: imageUrl,
        user_id: activeUser ? activeUser.id : null,
        updated_at: new Date().toISOString()
    };
    if (noteId) {
        payload.id = noteId;
    }
    
    try {
        const { error } = await supabaseClient.from('notes').upsert(payload);
        if (error) throw error;
        
        closeModal('modal-note-form');
        document.getElementById('note-form').reset();
        clearImagePreview('note');
        await fetchNotes();
    } catch (err) {
        console.error("Save note error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// =========================================================================
// 8. Learning Calendar Module (Calendar)
// =========================================================================
async function fetchCalendarEvents() {
    try {
        const { data, error } = await supabaseClient
            .from('calendar_events')
            .select('*')
            .order('event_date', { ascending: true })
            .order('start_time', { ascending: true });
            
        if (error) throw error;
        currentEvents = data || [];
        renderMiniCalendar();
        renderEvents();
    } catch (err) {
        console.error("Fetch calendar error:", err);
    }
}

// Mini Calendar Renderer
function renderMiniCalendar() {
    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();
    
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (monthYearLabel) {
        const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", 
                            "七月", "八月", "九月", "十月", "十一月", "十二月"];
        monthYearLabel.innerText = `${year}年 ${monthNames[month]}`;
    }
    
    const daysGrid = document.getElementById('calendar-days');
    if (!daysGrid) return;
    daysGrid.innerHTML = '';
    
    if (calendarViewMode === 'month') {
        const firstDayIndex = new Date(year, month, 1).getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const prevLastDay = new Date(year, month, 0).getDate();
        
        for (let x = firstDayIndex; x > 0; x--) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day other-month';
            dayDiv.innerText = prevLastDay - x + 1;
            daysGrid.appendChild(dayDiv);
        }
        
        for (let i = 1; i <= lastDay; i++) {
            renderDayDiv(year, month, i, daysGrid);
        }
    } else {
        const startOfWeek = new Date(calendarSelectedDate);
        startOfWeek.setDate(calendarSelectedDate.getDate() - calendarSelectedDate.getDay());
        
        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(startOfWeek);
            currentDay.setDate(startOfWeek.getDate() + i);
            
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            if (currentDay.getMonth() !== month) {
                dayDiv.classList.add('other-month');
            }
            dayDiv.innerText = currentDay.getDate();
            
            const today = new Date();
            if (currentDay.getDate() === today.getDate() && currentDay.getMonth() === today.getMonth() && currentDay.getFullYear() === today.getFullYear()) {
                dayDiv.classList.add('today');
            }
            
            if (currentDay.getDate() === calendarSelectedDate.getDate() && currentDay.getMonth() === calendarSelectedDate.getMonth() && currentDay.getFullYear() === calendarSelectedDate.getFullYear()) {
                dayDiv.classList.add('selected');
            }
            
            const dYear = currentDay.getFullYear();
            const dMonth = String(currentDay.getMonth() + 1).padStart(2, '0');
            const dDay = String(currentDay.getDate()).padStart(2, '0');
            const dateStr = `${dYear}-${dMonth}-${dDay}`;
            const dayHasEvent = currentEvents.some(e => e.event_date === dateStr);
            if (dayHasEvent) {
                dayDiv.classList.add('has-event');
            }
            
            dayDiv.addEventListener('click', () => {
                calendarSelectedDate = new Date(dYear, currentDay.getMonth(), currentDay.getDate());
                calendarCurrentDate = new Date(dYear, currentDay.getMonth(), 1);
                
                renderMiniCalendar();
                updateSelectedDateLabel();
                renderEvents();
            });
            
            dayDiv.addEventListener('dblclick', () => {
                calendarSelectedDate = new Date(dYear, currentDay.getMonth(), currentDay.getDate());
                calendarCurrentDate = new Date(dYear, currentDay.getMonth(), 1);
                renderMiniCalendar();
                updateSelectedDateLabel();
                
                const dateInput = document.getElementById('event-date');
                if (dateInput) {
                    dateInput.value = `${dYear}-${dMonth}-${dDay}`;
                }
                openModal('modal-event-form');
            });
            
            daysGrid.appendChild(dayDiv);
        }
    }
}

function renderDayDiv(year, month, i, daysGrid) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    dayDiv.innerText = i;
    
    const today = new Date();
    if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        dayDiv.classList.add('today');
    }
    
    if (i === calendarSelectedDate.getDate() && month === calendarSelectedDate.getMonth() && year === calendarSelectedDate.getFullYear()) {
        dayDiv.classList.add('selected');
    }
    
    const dMonth = String(month + 1).padStart(2, '0');
    const dDay = String(i).padStart(2, '0');
    const dateStr = `${year}-${dMonth}-${dDay}`;
    const dayHasEvent = currentEvents.some(e => e.event_date === dateStr);
    if (dayHasEvent) {
        dayDiv.classList.add('has-event');
    }
    
    dayDiv.addEventListener('click', () => {
        calendarSelectedDate = new Date(year, month, i);
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        dayDiv.classList.add('selected');
        updateSelectedDateLabel();
        renderEvents();
    });
    
    dayDiv.addEventListener('dblclick', () => {
        calendarSelectedDate = new Date(year, month, i);
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        dayDiv.classList.add('selected');
        updateSelectedDateLabel();
        
        const dateInput = document.getElementById('event-date');
        if (dateInput) {
            dateInput.value = `${year}-${dMonth}-${dDay}`;
        }
        openModal('modal-event-form');
    });
    
    daysGrid.appendChild(dayDiv);
}

function updateSelectedDateLabel() {
    const label = document.getElementById('selected-date-label');
    if (label) {
        const year = calendarSelectedDate.getFullYear();
        const month = calendarSelectedDate.getMonth() + 1;
        const date = calendarSelectedDate.getDate();
        label.innerText = `${year}年${month}月${date}日 日程`;
    }
}

function rebindMonthControls() {
    const prevMonthBtn = document.getElementById('btn-prev-month');
    const nextMonthBtn = document.getElementById('btn-next-month');

    if (prevMonthBtn) {
        const newPrev = prevMonthBtn.cloneNode(true);
        prevMonthBtn.parentNode.replaceChild(newPrev, prevMonthBtn);
        newPrev.addEventListener('click', () => {
            calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
            renderMiniCalendar();
        });
    }

    if (nextMonthBtn) {
        const newNext = nextMonthBtn.cloneNode(true);
        nextMonthBtn.parentNode.replaceChild(newNext, nextMonthBtn);
        newNext.addEventListener('click', () => {
            calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
            renderMiniCalendar();
        });
    }
}

function renderEvents() {
    const searchVal = document.getElementById('search-calendar').value.toLowerCase().trim();
    const subjectVal = activeFilters.calendar;
    
    const listEl = document.getElementById('calendar-events-list');
    if (!listEl) return;
    
    const year = calendarSelectedDate.getFullYear();
    const month = String(calendarSelectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(calendarSelectedDate.getDate()).padStart(2, '0');
    const selectedDateStr = `${year}-${month}-${day}`;
    
    const filtered = currentEvents.filter(item => {
        const matchesDate = item.event_date === selectedDateStr;
        const matchesSearch = item.title.toLowerCase().includes(searchVal) || 
                              item.description.toLowerCase().includes(searchVal);
        const matchesSubject = (subjectVal === 'all') || (item.subject === subjectVal);
        return matchesDate && matchesSearch && matchesSubject;
    });

    listEl.innerHTML = '';
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
              <i data-lucide="calendar"></i>
              <div class="empty-state-title">該日尚無日程</div>
              <div>或點擊「新增行程」。</div>
            </div>`;
        lucide.createIcons();
        return;
    }

    filtered.forEach(item => {
        const author = userMap.get(item.user_id) || "未知使用者";
        const subjectClass = getSubjectClass(item.subject);
        
        const card = document.createElement('div');
        card.className = `agenda-item ${subjectClass}`;
        card.dataset.id = item.id;
        
        card.innerHTML = `
            <div class="agenda-item-left">
                <div class="agenda-item-time">
                    <i data-lucide="clock"></i> 
                    ${item.start_time.substring(0, 5)} - ${item.end_time.substring(0, 5)}
                </div>
                <div class="agenda-item-title">${item.title}</div>
                <div class="agenda-item-author">建立者：${author}</div>
            </div>
            <div>
                <i data-lucide="chevron-right" style="color: var(--text-muted); width: 18px; height: 18px;"></i>
            </div>
        `;
        
        card.addEventListener('click', () => {
            openDetailModal('calendar', item.id);
        });
        
        listEl.appendChild(card);
    });
    
    lucide.createIcons();
}

// Save Event
document.getElementById('btn-save-event')?.addEventListener('click', async () => {
    const eventId = document.getElementById('form-event-id').value || null;
    const title = document.getElementById('event-title').value.trim();
    const subject = document.getElementById('event-subject').value;
    const event_date = document.getElementById('event-date').value;
    const start_time = document.getElementById('event-start-time').value;
    const end_time = document.getElementById('event-end-time').value;
    const description = document.getElementById('event-desc').value.trim();

    if (!title || !event_date || !start_time || !end_time) {
        alert("請填寫所有必要欄位！");
        return;
    }

    const fileInput = document.getElementById('event-image-file');
    const urlInput = document.getElementById('event-image-url');

    let existingUrl = null;
    if (eventId) {
        const item = currentEvents.find(x => x.id === eventId);
        if (item) existingUrl = item.image_url;
    }

    let imageUrl = getFormImageUrl('event-image-file', 'event-image-preview', 'event-image-url', existingUrl);
    if (imageUrl === 'upload') {
        imageUrl = await uploadImage(fileInput, urlInput);
    }

    const payload = {
        subject,
        title,
        description,
        event_date,
        start_time,
        end_time,
        image_url: imageUrl,
        user_id: activeUser ? activeUser.id : null
    };
    if (eventId) {
        payload.id = eventId;
    }

    try {
        const { error } = await supabaseClient.from('calendar_events').upsert(payload);
        if (error) throw error;

        // Check if sync todo checkbox is checked
        const syncTodoChecked = document.getElementById('event-sync-todo')?.checked;
        if (syncTodoChecked) {
            const todoPayload = {
                subject: subject,
                title: `[行程連動] ${title}`,
                description: `來自月曆行程之連動任務。行程說明：${description || '無'}`,
                image_url: imageUrl,
                is_completed: false,
                due_date: event_date,
                user_id: activeUser ? activeUser.id : null
            };
            const { error: todoError } = await supabaseClient.from('todos').insert([todoPayload]);
            if (todoError) console.error("Sync todo error:", todoError);
        }

        closeModal('modal-event-form');
        document.getElementById('event-form').reset();
        clearImagePreview('event');
        const checkbox = document.getElementById('event-sync-todo');
        if (checkbox) checkbox.checked = false;
        await fetchCalendarEvents();
    } catch (err) {
        console.error("Save event error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// =========================================================================
// 9. Todo Tasks Module (Todo List)
// =========================================================================
async function fetchTodos() {
    try {
        const { data, error } = await supabaseClient
            .from('todos')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        currentTodos = data || [];
        renderTodos();
    } catch (err) {
        console.error("Fetch todos error:", err);
    }
}

function renderTodos() {
    const searchVal = document.getElementById('search-todo').value.toLowerCase().trim();
    const subjectVal = activeFilters.todo;
    
    const activeListEl = document.getElementById('todo-active-list');
    const completedListEl = document.getElementById('todo-completed-list');
    const activeCountEl = document.getElementById('active-todo-count');
    const completedCountEl = document.getElementById('completed-todo-count');

    if (!activeListEl || !completedListEl) return;

    // Filter
    const filtered = currentTodos.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchVal) || 
                              item.description.toLowerCase().includes(searchVal);
        const matchesSubject = (subjectVal === 'all') || (item.subject === subjectVal);
        return matchesSearch && matchesSubject;
    });

    const activeTodos = filtered.filter(item => !item.is_completed);
    const completedTodos = filtered.filter(item => item.is_completed);

    if (activeCountEl) activeCountEl.textContent = activeTodos.length;
    if (completedCountEl) completedCountEl.textContent = completedTodos.length;

    activeListEl.innerHTML = '';
    completedListEl.innerHTML = '';

    const createTodoCard = (item) => {
        const author = userMap.get(item.user_id) || "未知使用者";
        const subjectClass = getSubjectClass(item.subject);
        const subjectDisplayName = getSubjectDisplayName(item.subject);
        
        const card = document.createElement('div');
        card.className = `todo-card ${subjectClass} ${item.is_completed ? 'completed' : ''}`;
        card.dataset.id = item.id;
        
        const isOverdue = item.due_date && new Date(item.due_date) < new Date() && !item.is_completed;
        const dueDateHtml = item.due_date 
            ? `<span class="todo-due-tag ${isOverdue ? 'overdue' : ''}"><i data-lucide="calendar"></i> 截止: ${item.due_date}</span>`
            : '';

        card.innerHTML = `
            <div class="todo-card-left">
                <label class="todo-checkbox-wrapper">
                    <input type="checkbox" class="todo-checkbox-input" data-id="${item.id}" ${item.is_completed ? 'checked' : ''} />
                    <span class="todo-checkbox-custom"></span>
                </label>
                <div class="todo-content">
                    <div class="todo-title">${item.title}</div>
                    <div class="todo-meta">
                        ${getSubjectBadgeHtml(item.subject)}
                        <span>建立者：${author}</span>
                        ${dueDateHtml}
                    </div>
                </div>
            </div>
        `;

        // Checkbox Toggle immediately
        const checkbox = card.querySelector('.todo-checkbox-input');
        checkbox.addEventListener('change', async (e) => {
            e.stopPropagation();
            await toggleTodoStatus(item.id, checkbox.checked);
        });

        // Click open details
        card.addEventListener('click', (e) => {
            if (e.target.closest('.todo-checkbox-wrapper')) return;
            openDetailModal('todo', item.id);
        });

        return card;
    };

    if (activeTodos.length === 0) {
        activeListEl.innerHTML = `<div class="empty-state" style="padding: 20px;"><div class="empty-state-title">尚無待辦事項</div><div>點擊「新增待辦」指派任務。</div></div>`;
    } else {
        activeTodos.forEach(item => activeListEl.appendChild(createTodoCard(item)));
    }

    if (completedTodos.length === 0) {
        completedListEl.innerHTML = `<div class="empty-state" style="padding: 20px;"><div class="empty-state-title">無已完成項目</div></div>`;
    } else {
        completedTodos.forEach(item => completedListEl.appendChild(createTodoCard(item)));
    }

    lucide.createIcons();
}

async function toggleTodoStatus(id, isCompleted) {
    try {
        console.log(`Toggling todo status: ${id} -> completed: ${isCompleted}`);
        const { error } = await supabaseClient
            .from('todos')
            .update({ is_completed: isCompleted })
            .eq('id', id);
            
        if (error) throw error;
        
        const todo = currentTodos.find(t => t.id === id);
        if (todo) {
            todo.is_completed = isCompleted;
            renderTodos();
        }
    } catch (err) {
        console.error("Toggle todo status failed:", err);
        alert("操作失敗，請稍後再試！");
    }
}

// Save Todo
document.getElementById('btn-save-todo')?.addEventListener('click', async () => {
    const todoId = document.getElementById('form-todo-id').value || null;
    const title = document.getElementById('todo-title').value.trim();
    const subject = document.getElementById('todo-subject').value;
    const due_date = document.getElementById('todo-due-date').value || null;
    const description = document.getElementById('todo-desc').value.trim();

    if (!title) {
        alert("請輸入待辦任務名稱！");
        return;
    }

    const fileInput = document.getElementById('todo-image-file');
    const urlInput = document.getElementById('todo-image-url');

    let existingUrl = null;
    if (todoId) {
        const item = currentTodos.find(x => x.id === todoId);
        if (item) existingUrl = item.image_url;
    }

    let imageUrl = getFormImageUrl('todo-image-file', 'todo-image-preview', 'todo-image-url', existingUrl);
    if (imageUrl === 'upload') {
        imageUrl = await uploadImage(fileInput, urlInput);
    }

    const payload = {
        subject,
        title,
        description,
        due_date,
        image_url: imageUrl,
        user_id: activeUser ? activeUser.id : null,
        is_completed: todoId ? (currentTodos.find(t => t.id === todoId)?.is_completed || false) : false
    };
    if (todoId) {
        payload.id = todoId;
    }

    try {
        const { error } = await supabaseClient.from('todos').upsert(payload);
        if (error) throw error;

        closeModal('modal-todo-form');
        document.getElementById('todo-form').reset();
        clearImagePreview('todo');
        await fetchTodos();
    } catch (err) {
        console.error("Save todo error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// =========================================================================
// 10. Discipline QA & Solutions Module (QA)
// =========================================================================
async function fetchQuestions() {
    try {
        const { data: questions, error: qError } = await supabaseClient
            .from('questions')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (qError) throw qError;
        
        const { data: solutions, error: sError } = await supabaseClient
            .from('solutions')
            .select('question_id');
            
        if (sError) throw sError;
        
        currentQuestions = questions || [];
        currentSolutions = solutions || [];
        renderQuestions();
    } catch (err) {
        console.error("Fetch QA error:", err);
    }
}

function renderQuestions() {
    const searchVal = document.getElementById('search-qa').value.toLowerCase().trim();
    const subjectVal = activeFilters.qa;
    
    const listEl = document.getElementById('qa-grid');
    if (!listEl) return;

    // Count replies per question
    const countMap = {};
    currentSolutions.forEach(s => {
        countMap[s.question_id] = (countMap[s.question_id] || 0) + 1;
    });

    const filtered = currentQuestions.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchVal) || 
                              item.content.toLowerCase().includes(searchVal);
        const matchesSubject = (subjectVal === 'all') || (item.subject === subjectVal);
        return matchesSearch && matchesSubject;
    });

    listEl.innerHTML = '';
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
              <i data-lucide="help-circle"></i>
              <div class="empty-state-title">尚無問答問題</div>
              <div>點擊「新增問題」發表疑問。</div>
            </div>`;
        lucide.createIcons();
        return;
    }

    filtered.forEach(item => {
        const author = userMap.get(item.asker_id) || "未知使用者";
        const subjectClass = getSubjectClass(item.subject);
        const subjectDisplayName = getSubjectDisplayName(item.subject);
        const authorInitial = author.charAt(0);
        const solCount = countMap[item.id] || 0;
        const isResolved = solCount > 0;
        
        const card = document.createElement('div');
        card.className = `glass-card ${subjectClass}`;
        card.dataset.id = item.id;
        
        let imgHtml = '';
        if (item.image_url) {
            imgHtml = `<img src="${item.image_url}" class="card-img-preview" alt="問題題目照片" />`;
        }

        const cleanPreview = item.content.replace(/[#*`~]/g, '');

        card.innerHTML = `
            <div class="card-header">
                ${getSubjectBadgeHtml(item.subject)}
                <div class="qa-card-status ${isResolved ? 'resolved' : 'unresolved'}">
                    <i data-lucide="${isResolved ? 'check-circle' : 'help-circle'}"></i>
                    ${isResolved ? '已解答' : '未解答'}
                </div>
            </div>
            <h4 class="card-title">${item.title}</h4>
            <p class="card-preview">${cleanPreview}</p>
            ${imgHtml}
            <div class="card-footer">
                <div class="author-info">
                    <div class="author-avatar">${authorInitial}</div>
                    <span>${author}</span>
                </div>
                <div class="solutions-counter">
                    <i data-lucide="message-square"></i>
                    <span>${solCount} 個回答</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            openDetailModal('qa', item.id);
        });
        
        listEl.appendChild(card);
    });

    lucide.createIcons();
}

// Save Question
document.getElementById('btn-save-question')?.addEventListener('click', async () => {
    const questionId = document.getElementById('form-question-id').value || null;
    const title = document.getElementById('question-title').value.trim();
    const subject = document.getElementById('question-subject').value;
    const content = document.getElementById('question-content').value.trim();

    if (!title || !content) {
        alert("請填寫問題簡述與詳細說明！");
        return;
    }

    const fileInput = document.getElementById('question-image-file');
    const urlInput = document.getElementById('question-image-url');

    let existingUrl = null;
    if (questionId) {
        const item = currentQuestions.find(x => x.id === questionId);
        if (item) existingUrl = item.image_url;
    }

    let imageUrl = getFormImageUrl('question-image-file', 'question-image-preview', 'question-image-url', existingUrl);
    if (imageUrl === 'upload') {
        imageUrl = await uploadImage(fileInput, urlInput);
    }

    const payload = {
        subject,
        title,
        content,
        image_url: imageUrl,
        asker_id: activeUser ? activeUser.id : null
    };
    if (questionId) {
        payload.id = questionId;
    }

    try {
        const { error } = await supabaseClient.from('questions').upsert(payload);
        if (error) throw error;

        closeModal('modal-question-form');
        document.getElementById('question-form').reset();
        clearImagePreview('question');
        await fetchQuestions();
    } catch (err) {
        console.error("Save question error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

    // Save Quiz
    document.getElementById('btn-save-quiz')?.addEventListener('click', async () => {
    const quizId = document.getElementById('form-quiz-id').value || null;
    const subject = document.getElementById('quiz-subject').value;
    
    const questionText = document.getElementById('quiz-question-text').value.trim();
    
    // Extract from Discord option builder
    const optionA = formQuizOptions[0] ? formQuizOptions[0].trim() : '';
    const optionB = formQuizOptions[1] ? formQuizOptions[1].trim() : '';
    const optionC = formQuizOptions[2] ? formQuizOptions[2].trim() : '';
    const optionD = formQuizOptions[3] ? formQuizOptions[3].trim() : '';
    
    const correctOption = String.fromCharCode(65 + formQuizCorrectIndex); // A, B, C, D

    if (!questionText || !optionA || !optionB) {
        alert("請填寫題目與至少兩個選項！");
        return;
    }

    const fileInput = document.getElementById('quiz-image-file');
    const urlInput = document.getElementById('quiz-image-url');

    let existingUrl = null;
    if (quizId) {
        const item = currentQuizzes.find(x => x.id === quizId);
        if (item) existingUrl = item.image_url;
    }

    let imageUrl = getFormImageUrl('quiz-image-file', 'quiz-image-preview', 'quiz-image-url', existingUrl);
    if (imageUrl === 'upload') {
        imageUrl = await uploadImage(fileInput, urlInput);
    }

    const chapter = document.getElementById('quiz-chapter').value.trim();
    const explanation = document.getElementById('quiz-explanation').value.trim();

    const payload = {
            subject,
            question_text: questionText,
            option_a: optionA,
            option_b: optionB,
            option_c: optionC,
            option_d: optionD,
            correct_option: correctOption,
            image_url: imageUrl,
            created_by: activeUser ? activeUser.id : null,
            chapter: chapter,
            explanation: explanation
        };
        if (quizId) {
            payload.id = quizId;
        }

        try {
            const { error } = await supabaseClient.from('quiz_questions').upsert(payload);
            if (error) throw error;

            closeModal('modal-quiz-form');
            document.getElementById('quiz-form').reset();
            clearImagePreview('quiz');
            
            await fetchQuizzes();
            await fetchQuizAnswers();
            renderQuizzes();
        } catch (err) {
            console.error("Save quiz error:", err);
            alert("操作失敗，請稍後再試！");
        }
    });

    // Reset Quiz Form image previews
    document.getElementById('btn-open-add-quiz')?.addEventListener('click', () => {
        document.getElementById('quiz-form').reset();
        clearImagePreview('quiz');
        formQuizOptions = ['', ''];
        formQuizCorrectIndex = 0;
        renderDiscordPollBuilder();
    });
    // Discord option builder add option
    document.getElementById('btn-quiz-add-option')?.addEventListener('click', () => {
        if (formQuizOptions.length >= 4) return;
        formQuizOptions.push('');
        renderDiscordPollBuilder();
    });



// =========================================================================
// 11. View detailed modals & Solutions thread
// =========================================================================
async function openDetailModal(type, id) {
    let item = null;
    let authorName = "未知使用者";

    if (type === 'note') {
        item = currentNotes.find(x => x.id === id);
        if (!item) return;
        authorName = userMap.get(item.user_id) || "未知使用者";
        
        const subjectClass = getSubjectClass(item.subject);
        const subjectDisplayName = getSubjectDisplayName(item.subject);
        
        const tagEl = document.getElementById('detail-note-subject');
        if (tagEl) {
            if (item.subject && item.subject !== 'none') {
                tagEl.style.display = 'inline-block';
                tagEl.className = `subject-badge ${subjectClass}`;
                tagEl.textContent = item.subject;
            } else {
                tagEl.style.display = 'none';
            }
        }
        
        document.getElementById('detail-note-title').textContent = item.title;
        document.getElementById('detail-note-author').textContent = authorName;
        document.getElementById('detail-note-avatar').textContent = authorName.charAt(0);
        document.getElementById('detail-note-date').textContent = new Date(item.updated_at).toLocaleString();
        
        const imgEl = document.getElementById('detail-note-image');
        if (item.image_url) {
            imgEl.src = item.image_url;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
        
        document.getElementById('detail-note-content').innerHTML = parseMarkdown(item.content);
        
        document.getElementById('btn-edit-note').dataset.id = item.id;
        document.getElementById('btn-delete-note').dataset.id = item.id;
        
        const isNoteOwner = activeUser && item.user_id === activeUser.id;
        document.getElementById('btn-edit-note').style.display = isNoteOwner ? '' : 'none';
        document.getElementById('btn-delete-note').style.display = isNoteOwner ? '' : 'none';
        
        openModal('modal-note-detail');
        
    } else if (type === 'calendar') {
        item = currentEvents.find(x => x.id === id);
        if (!item) return;
        authorName = userMap.get(item.user_id) || "未知使用者";
        
        const subjectClass = getSubjectClass(item.subject);
        const subjectDisplayName = getSubjectDisplayName(item.subject);
        
        const tagEl = document.getElementById('detail-event-subject');
        if (tagEl) {
            if (item.subject && item.subject !== 'none') {
                tagEl.style.display = 'inline-block';
                tagEl.className = `subject-badge ${subjectClass}`;
                tagEl.textContent = item.subject;
            } else {
                tagEl.style.display = 'none';
            }
        }
        
        document.getElementById('detail-event-title').textContent = item.title;
        document.getElementById('detail-event-author').textContent = authorName;
        document.getElementById('detail-event-avatar').textContent = authorName.charAt(0);
        document.getElementById('detail-event-date-text').textContent = item.event_date;
        document.getElementById('detail-event-time-text').textContent = `${item.start_time.substring(0,5)} - ${item.end_time.substring(0,5)}`;
        
        const imgEl = document.getElementById('detail-event-image');
        if (item.image_url) {
            imgEl.src = item.image_url;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
        
        document.getElementById('detail-event-desc').innerHTML = parseMarkdown(item.description || "");
        
        document.getElementById('btn-edit-event').dataset.id = item.id;
        document.getElementById('btn-delete-event').dataset.id = item.id;
        
        const isEventOwner = activeUser && item.user_id === activeUser.id;
        document.getElementById('btn-edit-event').style.display = isEventOwner ? '' : 'none';
        document.getElementById('btn-delete-event').style.display = isEventOwner ? '' : 'none';
        
        openModal('modal-event-detail');
        
    } else if (type === 'todo') {
        item = currentTodos.find(x => x.id === id);
        if (!item) return;
        authorName = userMap.get(item.user_id) || "未知使用者";
        
        const subjectClass = getSubjectClass(item.subject);
        const subjectDisplayName = getSubjectDisplayName(item.subject);
        
        const tagEl = document.getElementById('detail-todo-subject');
        if (tagEl) {
            if (item.subject && item.subject !== 'none') {
                tagEl.style.display = 'inline-block';
                tagEl.className = `subject-badge ${subjectClass}`;
                tagEl.textContent = item.subject;
            } else {
                tagEl.style.display = 'none';
            }
        }
        
        document.getElementById('detail-todo-title').textContent = item.title;
        document.getElementById('detail-todo-author').textContent = authorName;
        document.getElementById('detail-todo-avatar').textContent = authorName.charAt(0);
        document.getElementById('detail-todo-due').textContent = `截止日期: ${item.due_date || '無'}`;
        
        const statusEl = document.getElementById('detail-todo-status');
        if (statusEl) {
            statusEl.textContent = item.is_completed ? "狀態: 已完成" : "狀態: 進行中";
            statusEl.style.color = item.is_completed ? "var(--color-math)" : "var(--color-general)";
        }
        
        const imgEl = document.getElementById('detail-todo-image');
        if (item.image_url) {
            imgEl.src = item.image_url;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
        
        document.getElementById('detail-todo-desc').innerHTML = parseMarkdown(item.description || "");
        
        document.getElementById('btn-edit-todo').dataset.id = item.id;
        document.getElementById('btn-delete-todo').dataset.id = item.id;
        
        const isTodoOwner = activeUser && item.user_id === activeUser.id;
        document.getElementById('btn-edit-todo').style.display = isTodoOwner ? '' : 'none';
        document.getElementById('btn-delete-todo').style.display = isTodoOwner ? '' : 'none';
        
        openModal('modal-todo-detail');
        
    } else if (type === 'qa') {
        item = currentQuestions.find(x => x.id === id);
        if (!item) return;
        authorName = userMap.get(item.asker_id) || "未知使用者";
        
        const subjectClass = getSubjectClass(item.subject);
        const subjectDisplayName = getSubjectDisplayName(item.subject);
        
        const tagEl = document.getElementById('detail-qa-subject');
        if (tagEl) {
            if (item.subject && item.subject !== 'none') {
                tagEl.style.display = 'inline-block';
                tagEl.className = `subject-badge ${subjectClass}`;
                tagEl.textContent = item.subject;
            } else {
                tagEl.style.display = 'none';
            }
        }
        
        document.getElementById('detail-qa-title').textContent = item.title;
        document.getElementById('detail-qa-author').textContent = authorName;
        document.getElementById('detail-qa-avatar').textContent = authorName.charAt(0);
        document.getElementById('detail-qa-date').textContent = new Date(item.created_at).toLocaleDateString();
        
        const imgEl = document.getElementById('detail-qa-image');
        if (item.image_url) {
            imgEl.src = item.image_url;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
        
        document.getElementById('detail-qa-content').innerHTML = parseMarkdown(item.content);
        
        document.getElementById('btn-edit-question').dataset.id = item.id;
        document.getElementById('btn-delete-question').dataset.id = item.id;
        
        const isQaOwner = activeUser && item.asker_id === activeUser.id;
        document.getElementById('btn-edit-question').style.display = isQaOwner ? '' : 'none';
        document.getElementById('btn-delete-question').style.display = isQaOwner ? '' : 'none';
        
        // Setup solutions thread inside detail panel
        activeQuestionId = item.id;
        document.getElementById('solution-form').reset();
        clearImagePreview('new-solution');

        await loadSolutions(item.id);
        openModal('modal-qa-detail');
    }
    
    lucide.createIcons();
}

// Load Solutions Thread
async function loadSolutions(questionId) {
    const listEl = document.getElementById('solutions-list');
    if (!listEl) return;
    
    listEl.innerHTML = `<div class="text-center py-6 text-gray-400 text-sm">載入解答中...</div>`;
    
    try {
        const { data: solutions, error } = await supabaseClient
            .from('solutions')
            .select('*')
            .eq('question_id', questionId)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        listEl.innerHTML = '';
        if (solutions.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state" style="padding: 30px;">
                  <i data-lucide="message-square"></i>
                  <div class="empty-state-title">目前尚無解答，歡迎提供您的解題步驟。</div>
                </div>`;
            lucide.createIcons();
            return;
        }

        solutions.forEach((sol, index) => {
            const solverName = userMap.get(sol.solver_id) || "未知使用者";
            const timeStr = new Date(sol.created_at).toLocaleString();
            
            const card = document.createElement('div');
            card.className = 'solution-card';
            
            let imgHtml = '';
            if (sol.image_url) {
                imgHtml = `<img src="${sol.image_url}" class="solution-card-img" alt="解題算式圖片" />`;
            }

            card.innerHTML = `
                <div class="solution-card-header">
                    <span class="solution-card-author">回覆 #${index + 1} By ${solverName}</span>
                    <span class="solution-card-time">${timeStr}</span>
                </div>
                <div class="solution-card-body markdown-body">
                    ${parseMarkdown(sol.content)}
                </div>
                ${imgHtml}
            `;
            
            listEl.appendChild(card);
        });
    } catch (err) {
        console.error("Load solutions error:", err);
        listEl.innerHTML = `<div class="text-center py-6 text-rose-500 text-sm">載入解答失敗：${err.message}</div>`;
    }
    
    lucide.createIcons();
}

// Submit Solution Form inside QA Modal
document.getElementById('btn-submit-solution')?.addEventListener('click', async () => {
    const content = document.getElementById('new-solution-content').value.trim();
    if (!content) {
        alert("請輸入解題說明！");
        return;
    }
    
    if (!activeQuestionId) {
        alert("無效的問題 ID！");
        return;
    }
    
    const fileInput = document.getElementById('new-solution-image-file');
    const urlInput = document.getElementById('new-solution-image-url');
    
    let imageUrl = getFormImageUrl('new-solution-image-file', 'new-solution-image-preview', 'new-solution-image-url', null);
    if (imageUrl === 'upload') {
        imageUrl = await uploadImage(fileInput, urlInput);
    }
    
    try {
        console.log("Submitting solution for question:", activeQuestionId);
        const { error } = await supabaseClient
            .from('solutions')
            .insert({
                question_id: activeQuestionId,
                solver_id: activeUser ? activeUser.id : null,
                content,
                image_url: imageUrl
            });
            
        if (error) throw error;
        
        console.log("Solution submitted successfully!");
        document.getElementById('solution-form').reset();
        clearImagePreview('new-solution');
        await loadSolutions(activeQuestionId);
        await fetchQuestions(); // Refresh QA counts
    } catch (err) {
        console.error("Submit solution error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// =========================================================================
// 12. Edit Button Prefills
// =========================================================================

// Edit Note
document.getElementById('btn-edit-note')?.addEventListener('click', () => {
    const id = document.getElementById('btn-edit-note').dataset.id;
    const item = currentNotes.find(x => x.id === id);
    if (!item) return;
    
    closeModal('modal-note-detail');
    
    document.getElementById('note-form-title').textContent = "編輯筆記";
    document.getElementById('form-note-id').value = item.id;
    document.getElementById('note-title').value = item.title;
    document.getElementById('note-subject').value = item.subject;
    document.getElementById('note-content').value = item.content;
    
    const preview = document.getElementById('note-image-preview');
    const previewContainer = document.getElementById('note-image-preview-container');
    const urlInput = document.getElementById('note-image-url');
    
    if (urlInput) urlInput.value = item.image_url || '';

    if (item.image_url) {
        if (preview) preview.src = item.image_url;
        if (previewContainer) previewContainer.style.display = 'block';
    } else {
        if (preview) preview.src = '';
        if (previewContainer) previewContainer.style.display = 'none';
    }
    
    openModal('modal-note-form');
});

// Edit Event
document.getElementById('btn-edit-event')?.addEventListener('click', () => {
    const id = document.getElementById('btn-edit-event').dataset.id;
    const item = currentEvents.find(x => x.id === id);
    if (!item) return;
    
    closeModal('modal-event-detail');
    
    document.getElementById('event-form-title').textContent = "編輯行程";
    document.getElementById('form-event-id').value = item.id;
    document.getElementById('event-title').value = item.title;
    document.getElementById('event-subject').value = item.subject;
    document.getElementById('event-date').value = item.event_date;
    document.getElementById('event-start-time').value = item.start_time.substring(0,5);
    document.getElementById('event-end-time').value = item.end_time.substring(0,5);
    document.getElementById('event-desc').value = item.description || "";
    
    const preview = document.getElementById('event-image-preview');
    const previewContainer = document.getElementById('event-image-preview-container');
    const urlInput = document.getElementById('event-image-url');

    if (urlInput) urlInput.value = item.image_url || '';

    if (item.image_url) {
        if (preview) preview.src = item.image_url;
        if (previewContainer) previewContainer.style.display = 'block';
    } else {
        if (preview) preview.src = '';
        if (previewContainer) previewContainer.style.display = 'none';
    }
    
    openModal('modal-event-form');
});

// Edit Todo
document.getElementById('btn-edit-todo')?.addEventListener('click', () => {
    const id = document.getElementById('btn-edit-todo').dataset.id;
    const item = currentTodos.find(x => x.id === id);
    if (!item) return;
    
    closeModal('modal-todo-detail');
    
    document.getElementById('todo-form-title').textContent = "編輯待辦事項";
    document.getElementById('form-todo-id').value = item.id;
    document.getElementById('todo-title').value = item.title;
    document.getElementById('todo-subject').value = item.subject;
    document.getElementById('todo-due-date').value = item.due_date || "";
    document.getElementById('todo-desc').value = item.description || "";
    
    const preview = document.getElementById('todo-image-preview');
    const previewContainer = document.getElementById('todo-image-preview-container');
    const urlInput = document.getElementById('todo-image-url');

    if (urlInput) urlInput.value = item.image_url || '';

    if (item.image_url) {
        if (preview) preview.src = item.image_url;
        if (previewContainer) previewContainer.style.display = 'block';
    } else {
        if (preview) preview.src = '';
        if (previewContainer) previewContainer.style.display = 'none';
    }
    
    openModal('modal-todo-form');
});

// Edit Question
document.getElementById('btn-edit-question')?.addEventListener('click', () => {
    const id = document.getElementById('btn-edit-question').dataset.id;
    const item = currentQuestions.find(x => x.id === id);
    if (!item) return;
    
    closeModal('modal-qa-detail');
    
    document.getElementById('question-form-title').textContent = "編輯問題";
    document.getElementById('form-question-id').value = item.id;
    document.getElementById('question-title').value = item.title;
    document.getElementById('question-subject').value = item.subject;
    document.getElementById('question-content').value = item.content;
    
    const preview = document.getElementById('question-image-preview');
    const previewContainer = document.getElementById('question-image-preview-container');
    const urlInput = document.getElementById('question-image-url');

    if (urlInput) urlInput.value = item.image_url || '';

    if (item.image_url) {
        if (preview) preview.src = item.image_url;
        if (previewContainer) previewContainer.style.display = 'block';
    } else {
        if (preview) preview.src = '';
        if (previewContainer) previewContainer.style.display = 'none';
    }
    
    openModal('modal-question-form');
});

// =========================================================================
// 13. Delete Handlers
// =========================================================================

// Delete Note
document.getElementById('btn-delete-note')?.addEventListener('click', async () => {
    const id = document.getElementById('btn-delete-note').dataset.id;
    if (!id) return;
    if (!confirm("確定要刪除此項目嗎？")) return;
    
    try {
        const { error } = await supabaseClient.from('notes').delete().eq('id', id);
        if (error) throw error;
        
        closeModal('modal-note-detail');
        await fetchNotes();
    } catch (err) {
        console.error("Delete note error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// Delete Event
document.getElementById('btn-delete-event')?.addEventListener('click', async () => {
    const id = document.getElementById('btn-delete-event').dataset.id;
    if (!id) return;
    if (!confirm("確定要刪除此項目嗎？")) return;
    
    try {
        const { error } = await supabaseClient.from('calendar_events').delete().eq('id', id);
        if (error) throw error;
        
        closeModal('modal-event-detail');
        await fetchCalendarEvents();
    } catch (err) {
        console.error("Delete event error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// Delete Todo
document.getElementById('btn-delete-todo')?.addEventListener('click', async () => {
    const id = document.getElementById('btn-delete-todo').dataset.id;
    if (!id) return;
    if (!confirm("確定要刪除此項目嗎？")) return;
    
    try {
        const { error } = await supabaseClient.from('todos').delete().eq('id', id);
        if (error) throw error;
        
        closeModal('modal-todo-detail');
        await fetchTodos();
    } catch (err) {
        console.error("Delete todo error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// Delete Question
document.getElementById('btn-delete-question')?.addEventListener('click', async () => {
    const id = document.getElementById('btn-delete-question').dataset.id;
    if (!id) return;
    if (!confirm("確定要刪除此項目嗎？")) return;
    
    try {
        const { error } = await supabaseClient.from('questions').delete().eq('id', id);
        if (error) throw error;
        
        closeModal('modal-qa-detail');
        await fetchQuestions();
    } catch (err) {
        console.error("Delete question error:", err);
        alert("操作失敗，請稍後再試！");
    }
});

// =========================================================================
// 14. Pull-to-refresh Module
// =========================================================================
function initPullToRefresh() {
    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    const pullThreshold = 70; // 70px
    
    // Create pull-to-refresh indicator element
    const ptrIndicator = document.createElement('div');
    ptrIndicator.id = 'pull-to-refresh-indicator';
    ptrIndicator.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(ptrIndicator);

    // Inject css for the indicator
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        #pull-to-refresh-indicator {
            position: fixed;
            top: -50px;
            left: 50%;
            transform: translateX(-50%) translateY(0);
            width: 40px;
            height: 40px;
            background-color: var(--bg-card);
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            pointer-events: none;
            opacity: 0;
            border: var(--border-thin);
        }
        #pull-to-refresh-indicator .spinner {
            width: 20px;
            height: 20px;
            border: 2.5px solid var(--primary-light);
            border-top: 2.5px solid var(--primary-color);
            border-radius: 50%;
            animation: ptr-spin 0.8s linear infinite;
        }
        @keyframes ptr-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(styleEl);

    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0 && e.touches.length === 1) {
            startY = e.touches[0].pageY;
            currentY = startY;
            isPulling = false;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (window.scrollY > 0 || e.touches.length !== 1) return;
        
        currentY = e.touches[0].pageY;
        const diffY = currentY - startY;
        
        if (diffY > 0) {
            isPulling = true;
            // Calculate pull distance with resistance
            const pullDist = Math.min(diffY * 0.4, 100);
            
            ptrIndicator.style.opacity = Math.min(pullDist / pullThreshold, 1);
            ptrIndicator.style.transform = `translateX(-50%) translateY(${pullDist + 20}px)`;
            ptrIndicator.style.transition = 'none'; // Instant response to finger
        }
    }, { passive: true });

    document.addEventListener('touchend', async () => {
        if (!isPulling) return;
        isPulling = false;
        
        const diffY = currentY - startY;
        const pullDist = diffY * 0.4;
        
        if (pullDist >= pullThreshold) {
            // Trigger refresh
            ptrIndicator.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
            ptrIndicator.style.transform = `translateX(-50%) translateY(90px)`; // Hold at refreshing position
            ptrIndicator.style.opacity = '1';
            
            // Get active tab and trigger loadDataForView
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const target = activeTab.getAttribute('data-tab');
                console.log(`Pull-to-refresh triggered for tab: ${target}`);
                try {
                    await loadDataForView(`panel-${target}`);
                } catch (err) {
                    console.error("PTR load error:", err);
                }
            }
            
            // Smoothly slide back after data is loaded
            setTimeout(() => {
                ptrIndicator.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease';
                ptrIndicator.style.transform = `translateX(-50%) translateY(0)`;
                ptrIndicator.style.opacity = '0';
            }, 600);
        } else {
            // Cancel and slide back immediately
            ptrIndicator.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
            ptrIndicator.style.transform = `translateX(-50%) translateY(0)`;
            ptrIndicator.style.opacity = '0';
        }
    });
}
