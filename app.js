// Service Workerの登録
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}
document.addEventListener('DOMContentLoaded', () => {
    // --- 定数定義 ---
    const CATEGORIES = ['食費', '交通費', '趣味', '固定費', 'その他'];
    const TAGS = ['個人', '仕事', '家族', '緊急'];
    const MEMO_TEMPLATES = {
        '食費': ['コンビニ', 'スーパー', '外食'],
        '交通費': ['電車', 'バス', 'タクシー'],
    };

    // --- DOM要素の取得 ---
    const expenseFormContainer = document.getElementById('expense-form-container');
    const expenseForm = document.getElementById('expense-form');
    const expenseList = document.getElementById('expense-list');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const categorySelect = document.getElementById('category');
    const tagsContainer = document.getElementById('tags-container');
    const memoTemplateSelect = document.getElementById('memo-template');
    const memoInput = document.getElementById('memo');
    const exportCsvAllBtn = document.getElementById('export-csv-all-btn');
    const exportCsvRangeBtn = document.getElementById('export-csv-range-btn');
    
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

    // --- UUID生成 ---
    function uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // --- UI初期化 ---
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
            
            // タグを設定
            const tags = expense.tags ? expense.tags.split(';') : [];
            document.querySelectorAll('#tags-container input[type="checkbox"]').forEach(cb => {
                cb.checked = tags.includes(cb.value);
            });
        } else {
            // 新規登録モード: 日付の初期値を今日に設定
            document.getElementById('date').value = new Date().toISOString().slice(0, 10);
        }
        
        expenseFormContainer.classList.remove('hidden');
    }

    function hideForm() {
        expenseFormContainer.classList.add('hidden');
        expenseForm.reset();
    }

    // --- CRUD操作 ---
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
            memo: memoInput.value.trim(),
            updated_at: new Date().toISOString()
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

  const expenses = []; //日付で降順ソート

  index.openCursor(null, 'prev').onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      expenses.push(cursor.value);
      cursor.continue();
    } else {
      expenseList.innerHTML = '';

      if (expenses.length === 0) {
        expenseList.innerHTML = '<div class="no-data">NO DATA</div>';
        return;
      }

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

    
    // HTMLエスケープ
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

    // --- CSVエクスポート ---
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
        link.setAttribute("download", `expenses_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function handleExportAll() {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = (e) => exportToCSV(e.target.result);
        request.onerror = (e) => console.error('Error exporting all data:', e.target.error);
    }
    
    function handleExportRange() {
        const start = prompt('開始日 (YYYY-MM-DD) を入力してください:');
        const end = prompt('終了日 (YYYY-MM-DD) を入力してください:');
        
        if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            alert('日付の形式が正しくありません。');
            return;
        }

        const range = IDBKeyRange.bound(start, end);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('date');
        const request = index.getAll(range);

        request.onsuccess = (e) => {
            if (e.target.result.length === 0) {
                alert('指定された範囲にデータはありません。');
                return;
            }
            exportToCSV(e.target.result);
        };
        request.onerror = (e) => console.error('Error exporting range data:', e.target.error);
    }


    // --- イベントリスナーの設定 ---
    addExpenseBtn.addEventListener('click', () => showForm());
    cancelBtn.addEventListener('click', hideForm);
    expenseForm.addEventListener('submit', saveExpense);
    exportCsvAllBtn.addEventListener('click', handleExportAll);
    exportCsvRangeBtn.addEventListener('click', handleExportRange);


    // --- アプリケーションの初期化 ---
    async function main() {
        await initDB();
        initializeUI();
        renderExpenses();
    }

    main();
});
