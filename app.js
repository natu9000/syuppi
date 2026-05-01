// Service Worker縺ｮ逋ｻ骭ｲ
// if ('serviceWorker' in navigator) {
//     window.addEventListener('load', () => {
//        // navigator.serviceWorker.register('./sw-v5.js')
//             .then(registration => {
//                 console.log('ServiceWorker registration successful with scope: ', registration.scope);
//             })
//             .catch(error => {
//                 console.log('ServiceWorker registration failed: ', error);
//             });
//     });
// }
// Service Worker の登録
document.addEventListener('DOMContentLoaded', () => {
    const APP_LAST_UPDATED = '2026-05-01';
    const SW_VERSION = 'v7';
    // --- 定数定義 ---
    const CATEGORIES = ['食費', '日用品', '交通', '娯楽', '医療', '交際', '特別支出','美容', 'その他'];
    const TAGS = ['スーパー', 'コンビニ', '飲食店', 'EC', 'ドラッグストア','交通機関', '病院', '美容院'];
    const MEMO_TEMPLATES = {
        '食費': ['朝食', '昼食', '夕食', '飲み物'],
        '日用品': ['消耗品', '生活雑貨'],
        '交通': ['電車', 'バス', 'タクシー'],
        '娯楽': ['映画', 'ゲーム', '書籍'],
        '医療': ['病院', '薬'],
        '特別支出': ['家電', '家具', 'イベント'],
        '交際': ['飲み会', '贈り物'],
        'その他': ['贈り物', '外食', 'Amazon']
    };
    const BUDGET_FOOD_INITIAL = 30000;
    const BUDGET_OTHER_INITIAL = 30000;

    // --- DOM 要素の取得 ---
    const expenseFormContainer = document.getElementById('expense-form-container');
    const expenseForm = document.getElementById('expense-form');
    const expenseList = document.getElementById('expense-list');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const categorySelect = document.getElementById('category');
    const tagsContainer = document.getElementById('tags-container');
    const memoTemplateSelect = document.getElementById('memo-template');
    const memoInput = document.getElementById('memo');
    const exportCsvPrevBtn = document.getElementById('export-csv-prev-btn');
    const exportCsvAllBtn = document.getElementById('export-csv-all-btn');
    const deletePrevBtn = document.getElementById('delete-prev-btn');
    const budgetFoodRemaining = document.getElementById('budget-food-remaining');
    const budgetFoodSpent = document.getElementById('budget-food-spent');
    const budgetFoodTotal = document.getElementById('budget-food-total');
    const budgetOtherRemaining = document.getElementById('budget-other-remaining');
    const budgetOtherSpent = document.getElementById('budget-other-spent');
    const budgetOtherTotal = document.getElementById('budget-other-total');
    const appVersion = document.getElementById('app-version');
    
    // --- データベース関連 ---
    let db;
    const DB_NAME = 'ExpenseDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'expenses';

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = event => {
                console.error('Database error:', event.target.errorCode);
                reject('Database error');
            };

            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    objectStore.createIndex('date', 'date', { unique: false });
                }
            };

            request.onsuccess = event => {
                db = event.target.result;
                console.log('Database opened successfully.');
                resolve(db);
            };
        });
    }

    // --- UUID 生成 ---
    function uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // --- UI 初期化 ---
    function initializeUI() {
        // カテゴリのプルダウンを生成
        CATEGORIES.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });

        // タグのチェックボックスを生成
        TAGS.forEach(tag => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = tag;
            checkbox.name = 'tags';
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${tag}`));
            tagsContainer.appendChild(label);
        });
        
        // メモテンプレートのプルダウンを生成
        for (const category in MEMO_TEMPLATES) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = category;
            MEMO_TEMPLATES[category].forEach(template => {
                const option = document.createElement('option');
                option.value = template;
                option.textContent = template;
                optgroup.appendChild(option);
            });
            memoTemplateSelect.appendChild(optgroup);
        }

        memoTemplateSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                memoInput.value += (memoInput.value ? ' ' : '') + e.target.value;
                e.target.value = ''; // 選択をリセット
            }
        });
        appVersion.textContent = `更新: ${APP_LAST_UPDATED} (${SW_VERSION})`;
    }

    // --- フォーム表示/非表示 ---
    function showForm(expense = null) {
        expenseForm.reset();
        document.getElementById('expense-id').value = '';

        if (expense) {
            // 編集モード
            document.getElementById('expense-id').value = expense.id;
            document.getElementById('date').value = expense.date;
            document.getElementById('amount').value = expense.amount_jpy;
            document.getElementById('category').value = expense.category;
            memoInput.value = expense.memo;
            
            // タグを復元
            const tags = expense.tags ? expense.tags.split(';') : [];
            document.querySelectorAll('#tags-container input[type="checkbox"]').forEach(cb => {
                cb.checked = tags.includes(cb.value);
            });
        } else {
            // 新規登録モードでは今日の日付を初期値に設定
            document.getElementById('date').value = toJSTDateString(new Date());
        }
        
        expenseFormContainer.classList.remove('hidden');
    }

    function hideForm() {
        expenseFormContainer.classList.add('hidden');
        expenseForm.reset();
    }

    // --- CRUD 処理 ---
    function saveExpense(event) {
        event.preventDefault();
        
        const id = document.getElementById('expense-id').value;
        const selectedTags = Array.from(document.querySelectorAll('#tags-container input:checked'))
                                 .map(cb => cb.value)
                                 .join(';');

        const expenseData = {
            id: id || uuidv4(),
            date: document.getElementById('date').value,
            amount_jpy: parseInt(document.getElementById('amount').value, 10),
            category: document.getElementById('category').value,
            tags: selectedTags,
            memo: normalizeMemo(memoInput.value),
            updated_at: toJSTDateTimeString(new Date())
        };

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(expenseData);

        request.onsuccess = () => {
            hideForm();
            renderExpenses();
        };
        request.onerror = (e) => console.error('Error saving expense:', e.target.error);
    }

    function deleteExpense(id) {
        if (!confirm('この支出を削除しますか？')) return;

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => renderExpenses();
        request.onerror = (e) => console.error('Error deleting expense:', e.target.error);
    }

    function editExpense(id) {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = (e) => {
            const expense = e.target.result;
            if (expense) {
                showForm(expense);
            }
        };
        request.onerror = (e) => console.error('Error fetching expense for edit:', e.target.error);
    }

    // --- 支出一覧の描画 ---
function renderExpenses() {
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('date');

  const expenses = []; // 日付の降順で保持

  index.openCursor(null, 'prev').onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      expenses.push(cursor.value);
      cursor.continue();
    } else {
      expenseList.innerHTML = '';

      if (expenses.length === 0) {
        updateBudget(expenses);
        expenseList.innerHTML = '<div class="no-data">NO DATA</div>';
        return;
      }

      updateBudget(expenses);
      expenses.forEach(expense => {
        const item = document.createElement('div');
        item.className = 'expense-item';
        item.innerHTML = `
          <div class="expense-details">
            <div class="date">${expense.date}</div>
            <div class="amount">${expense.amount_jpy.toLocaleString()} 円</div>
            <div class="category">${expense.category}</div>
            ${expense.tags ? `<div class="tags">#${expense.tags.replace(/;/g, ' #')}</div>` : ''}
            ${expense.memo ? `<div class="memo">${escapeHTML(expense.memo)}</div>` : ''}
          </div>
          <div class="expense-actions">
            <button class="edit-btn" data-id="${expense.id}">編集</button>
            <button class="delete-btn" data-id="${expense.id}">削除</button>
          </div>
        `;
        expenseList.appendChild(item);
      });

      document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editExpense(e.target.dataset.id));
      });
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteExpense(e.target.dataset.id));
      });
    }
  };

  index.openCursor(null, 'prev').onerror = (e) =>
    console.error('Error fetching expenses:', e.target.error);
}

    function updateBudget(expenses) {
        let foodSpent = 0;
        let otherSpent = 0;

        expenses.forEach(expense => {
            if (expense.category === '食費') {
                foodSpent += expense.amount_jpy;
            } else {
                otherSpent += expense.amount_jpy;
            }
        });

        const foodRemaining = BUDGET_FOOD_INITIAL - foodSpent;
        const otherRemaining = BUDGET_OTHER_INITIAL - otherSpent;

        budgetFoodTotal.textContent = formatJPY(BUDGET_FOOD_INITIAL);
        budgetFoodSpent.textContent = formatJPY(foodSpent);
        budgetFoodRemaining.textContent = formatJPY(foodRemaining);

        budgetOtherTotal.textContent = formatJPY(BUDGET_OTHER_INITIAL);
        budgetOtherSpent.textContent = formatJPY(otherSpent);
        budgetOtherRemaining.textContent = formatJPY(otherRemaining);
    }

    function formatJPY(amount) {
        return `${amount.toLocaleString()} 円`;
    }

    function normalizeMemo(value) {
        return value.replace(/[\r\n]+/g, ' ').trim();
    }
    
    // HTML エスケープ
    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    // --- CSV エクスポート ---
    function exportToCSV(expenses) {
        const headers = ['id', 'date', 'amount_jpy', 'category', 'tags', 'memo', 'updated_at'];
        let csvContent = headers.join(',') + '\r\n';

        expenses.forEach(exp => {
            const row = [
                exp.id,
                exp.date,
                exp.amount_jpy,
                exp.category,
                `"${exp.tags || ''}"`,
                `"${exp.memo || ''}"`,
                exp.updated_at
            ];
            csvContent += row.join(',') + '\r\n';
        });

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `expenses_${toJSTDateString(new Date())}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function confirmWithExpenseList(expenses, actionLabel) {
        const listText = expenses.map(expense => {
            const memo = expense.memo ? ` ${expense.memo}` : '';
            return `${expense.date} ${expense.amount_jpy.toLocaleString()}円 ${expense.category}${memo}`;
        }).join('\n');
        return confirm(`対象データ:\n${listText}\n\nこの内容で${actionLabel}しますか？`);
    }

    function handleExportAll() {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = (e) => {
            const expenses = e.target.result;
            if (expenses.length === 0) {
                alert('対象データはありません。');
                return;
            }
            if (!confirmWithExpenseList(expenses, '出力')) return;
            exportToCSV(expenses);
        };
        request.onerror = (e) => console.error('Error exporting all data:', e.target.error);
    }
    
    function handleExportPrevMonth() {
        const range = getPrevMonthRange();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('date');
        const request = index.getAll(range);

        request.onsuccess = (e) => {
            const expenses = e.target.result;
            if (expenses.length === 0) {
                alert('前月のデータはありません。');
                return;
            }
            if (!confirmWithExpenseList(expenses, '出力')) return;
            exportToCSV(expenses);
        };
        request.onerror = (e) => console.error('Error exporting range data:', e.target.error);
    }

    function getPrevMonthRange() {
        const nowJST = getJSTNow();
        let year = nowJST.getUTCFullYear();
        let monthIndex = nowJST.getUTCMonth() - 1;
        if (monthIndex < 0) {
            monthIndex = 11;
            year -= 1;
        }
        const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
        const start = formatDateParts(year, monthIndex, 1);
        const end = formatDateParts(year, monthIndex, lastDay);
        return IDBKeyRange.bound(start, end);
    }

    function deletePrevMonthData() {
        const range = getPrevMonthRange();
        const listTransaction = db.transaction([STORE_NAME], 'readonly');
        const listStore = listTransaction.objectStore(STORE_NAME);
        const listIndex = listStore.index('date');
        const listRequest = listIndex.getAll(range);

        listRequest.onsuccess = (e) => {
            const expenses = e.target.result;
            if (expenses.length === 0) {
                alert('前月のデータはありません。');
                return;
            }
            if (!confirmWithExpenseList(expenses, '削除')) return;

            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('date');

            index.openCursor(range).onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => {
                renderExpenses();
            };
            transaction.onerror = (err) => console.error('Error deleting previous month data:', err.target.error);
        };
        listRequest.onerror = (e) => console.error('Error fetching previous month data:', e.target.error);
    }

    function getJSTNow() {
        const now = new Date();
        return new Date(now.getTime() + 9 * 60 * 60 * 1000);
    }

    function toJSTDateString(date) {
        const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        const year = jst.getUTCFullYear();
        const month = jst.getUTCMonth() + 1;
        const day = jst.getUTCDate();
        return formatDateParts(year, month - 1, day);
    }

    function toJSTDateTimeString(date) {
        const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        const year = jst.getUTCFullYear();
        const month = jst.getUTCMonth() + 1;
        const day = jst.getUTCDate();
        const hours = jst.getUTCHours();
        const minutes = jst.getUTCMinutes();
        const seconds = jst.getUTCSeconds();
        return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}+09:00`;
    }

    function formatDateParts(year, monthIndex, day) {
        return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }


    // --- イベントリスナーの設定 ---
    addExpenseBtn.addEventListener('click', () => showForm());
    cancelBtn.addEventListener('click', hideForm);
    expenseForm.addEventListener('submit', saveExpense);
    exportCsvPrevBtn.addEventListener('click', handleExportPrevMonth);
    exportCsvAllBtn.addEventListener('click', handleExportAll);
    deletePrevBtn.addEventListener('click', deletePrevMonthData);


    // --- アプリケーションの初期化 ---
    async function main() {
        await initDB();
        initializeUI();
        renderExpenses();
    }

    main();
});

