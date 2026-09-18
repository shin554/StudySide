let modalMode = null;
let currentNoteId = null;
let deleteTarget = null;
let editTarget = null;
let deleteMode = false;
let currentPageId = null;
let quill = null;
let targetImageNode = null;

const app = document.getElementById("app");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalInput = document.getElementById("modalInput");
const confirmBtn = document.getElementById("confirmBtn");

// --------------------------------------------------
// 🖼️ 画像アイコンのBlot定義（HTMLからの読み込みにも対応）
// --------------------------------------------------
const Embed = Quill.import('blots/embed');
class ImageIconBlot extends Embed {
  static create(value) {
    let node = super.create();
    node.setAttribute('contenteditable', 'false');
    node.setAttribute('data-src', typeof value === 'object' ? value.src : value);
    node.innerText = "🖼️ 画像";
    node.className = "image-icon-tag";

    // 左クリック：画像プレビュー
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      openImagePreviewModal(node.getAttribute('data-src'));
    });

    // 右クリック：削除モーダル呼び出し
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDeleteImageModal(node);
    });

    return node;
  }

  static value(node) {
    return { src: node.getAttribute('data-src') };
  }
}
ImageIconBlot.blotName = 'imageIcon';
ImageIconBlot.tagName = 'span';
ImageIconBlot.className = 'image-icon-tag';
Quill.register(ImageIconBlot);

// 仮データ
let notes = JSON.parse(localStorage.getItem("notes")) || [
  {
    id: 1,
    title: "世界史",
    pages: [
      {
        id: 1,
        title: "ローマ帝国の拡大",
        updatedAt: "2026/06/12 18:20",
        content: "<h2>ローマ帝国の拡大</h2><p>ポエニ戦争によって地中海の覇権を握ったローマは、<span style=\"background-color: rgb(255, 245, 157);\">領土を大幅に拡大</span>させた。</p>"
      }
    ]
  }
];

let symbols = JSON.parse(localStorage.getItem("symbols")) || [
  { id: "check", key: "✔", shortcut: "1" },
  { id: "arrow", key: "→", shortcut: "2" }
];

// ホーム画面
function showHome() {
  app.innerHTML = `
    <button class="primary-btn" onclick="openAddNoteModal()">
      + ノート追加
    </button>
  `;

  notes.forEach(note => {
    app.innerHTML += `
      <div class="card" onclick="showNote(${note.id})">
        <div class="card-title">${note.title}</div>
        <div class="card-subtitle">${note.pages.length}ページ</div>
        <button onclick="openEditNoteModal(${note.id}); event.stopPropagation();">編集</button>
        <button onclick="openDeleteModal(${note.id}); event.stopPropagation();">削除</button>
      </div>
    `;
  });
}

// ノート画面
function showNote(noteId) {
  const note = getNote(noteId);
  if (!note) return showHome();

  app.innerHTML = `
    <div class="note-header">
      <button class="primary-btn back-btn" onclick="showHome()">← 戻る</button>
      <span class="note-title-text">${note.title}</span>
    </div>
    <button class="primary-btn" onclick="openAddPageModal(${note.id})">＋ ページ追加</button>
  `;

  note.pages.forEach(page => {
    app.innerHTML += `
      <div class="card" onclick="showPage(${note.id}, ${page.id})">
        <div class="card-title">${page.title}</div>
        <div class="card-subtitle">${page.updatedAt}</div>
        <button onclick="openEditPageModal(${note.id}, ${page.id}); event.stopPropagation();">編集</button>
        <button onclick="openDeletePageModal(${note.id}, ${page.id}); event.stopPropagation();">削除</button>
      </div>
    `;
  });
}

// ページ画面（エディタ配置を元通り復元）
function showPage(noteId, pageId) {
  const note = getNote(noteId);
  const page = note.pages.find(p => p.id === pageId);

  currentNoteId = noteId;
  currentPageId = pageId;

  app.innerHTML = `
  <div class="page-topbar">
    <div class="page-title-group">
      <button class="primary-btn back-btn" onclick="showNote(${note.id})">← 戻る</button>
      <span class="page-breadcrumb">
        <span class="parent-note-title">${note.title}</span>
        <span class="breadcrumb-separator">＜</span>
        <span class="current-page-title">${page.title}</span>
      </span>
    </div>
    <span id="saveStatus">保存済み</span>
  </div>

  <div class="toolbar">
    <div class="toolbar-buttons">
      <button id="btnMarker" type="button" onmousedown="event.preventDefault(); toggleMarker();">🟨 マーカー</button>
      <button id="btnH2" type="button" onmousedown="event.preventDefault(); toggleH2();">🏷️ 見出し</button>
      <button type="button" onclick="insertImage()">📷 画像</button>
      
      <div class="symbol-group">
        <input id="symbolInput" placeholder="記号" />
        <button onclick="addSymbol()">追加</button>
        <button onclick="removeSymbol()">削除</button>
      </div>
      <div id="symbolBar"></div>
    </div>
  </div>
  
  <div class="editor-container">
    <div id="quillEditor"></div>
  </div>

  <div class="floating-controls">
    <button class="float-btn" onclick="toggleToc()" title="目次">📖 目次</button>
    <button class="float-btn" onclick="scrollToTop()" title="一番上へ">↑</button>
    <div id="tocMenu" class="toc-menu hidden"></div>
  </div>
`;

// Quill初期化
  quill = new Quill('#quillEditor', {
    theme: 'snow',
    modules: { toolbar: false }
  });
 
// 🛑【Backspace & Delete 阻止】（直前・直後のみに限定した精密判定）
  const quillContainer = document.querySelector('#quillEditor');
  if (quillContainer) {
    quillContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // ① 範囲選択されている場合：選択範囲に直接アイコンが含まれている時のみブロック
        if (!range.collapsed) {
          const fragment = range.cloneContents();
          if (fragment.querySelector('.image-icon-tag')) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        } 
        // ② カーソル位置（単一）の場合：真隣（直前/直後）にあるかチェック
        else {
          let targetNode = null;

          if (e.key === 'Backspace') {
            // カーソルの「すぐ左隣」の要素を厳密に取得
            if (range.startOffset > 0) {
              const node = range.startContainer;
              if (node.nodeType === Node.ELEMENT_NODE) {
                targetNode = node.childNodes[range.startOffset - 1];
              } else if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
                targetNode = node.previousSibling;
              }
            } else if (range.startContainer.previousSibling) {
              targetNode = range.startContainer.previousSibling;
            }
          } else if (e.key === 'Delete') {
            // カーソルの「すぐ右隣」の要素を厳密に取得
            const node = range.startContainer;
            if (node.nodeType === Node.ELEMENT_NODE) {
              targetNode = node.childNodes[range.startOffset];
            } else if (node.nodeType === Node.TEXT_NODE && range.startOffset === node.textContent.length) {
              targetNode = node.nextSibling;
            }
          }

          // 真隣が「.image-icon-tag」そのものである場合のみ消去をブロック
          if (targetNode && targetNode.nodeType === Node.ELEMENT_NODE && targetNode.classList.contains('image-icon-tag')) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    }, true);
  }

 // 📋 【クリップボード貼り付けのアイコン化】
  if (quillContainer) {
    quillContainer.addEventListener('paste', (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;

      const items = clipboardData.items;
      let hasImage = false;

      for (let i = 0; i < items.length; i++) {
        // 貼り付けられたデータの中に画像が含まれているかチェック
        if (items[i].type.indexOf('image') !== -1) {
          hasImage = true;
          const file = items[i].getAsFile();
          const reader = new FileReader();

          reader.onload = (event) => {
            quill.focus();
            const range = quill.getSelection(true) || { index: quill.getLength() };
            
            // 🖼️ 巨大な <img> ではなく「画像アイコン」として挿入
            quill.insertEmbed(range.index, 'imageIcon', { src: event.target.result });
            quill.setSelection(range.index + 1);
          };
          reader.readAsDataURL(file);
        }
      }

      // 画像の貼り付けだった場合、Quill標準の「巨大画像挿入」をブロック
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true); // 👈 `true`（キャプチャフェーズ）でQuillより先にイベントを横取り
  }

  // --------------------------------------------------
  // 🎹 ショートカットキー設定
  // --------------------------------------------------
  // 🟨 マーカー: Ctrl + M
  quill.keyboard.addBinding({
    key: 'm',
    shortKey: true
  }, function(range, context) {
    toggleMarker();
    return false;
  });

  // 🏷️ H2見出し: Ctrl + H
  quill.keyboard.addBinding({
    key: 'h',
    shortKey: true
  }, function(range, context) {
    toggleH2();
    return false;
  });

  if (page.content) {
    quill.clipboard.dangerouslyPasteHTML(page.content);
  }

  renderSymbols();

  let saveTimer = null;

  quill.on('editor-change', (eventName) => {
    if (eventName === 'text-change') {
      const saveStatus = document.getElementById("saveStatus");
      if (saveStatus) saveStatus.innerText = "保存中...";

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const p = getPage(currentNoteId, currentPageId);
        if (p) {
          p.content = quill.root.innerHTML;
          p.updatedAt = new Date().toLocaleString();
          saveData();
        }
        if (saveStatus) saveStatus.innerText = "保存済み";
      }, 500);

      renderToc();
    }

    updateButtonStates();
  });

  renderToc();
}

// 🟨 マーカー ON/OFF
function toggleMarker() {
  if (!quill) return;
  quill.focus();
  const range = quill.getSelection();
  if (!range) return;

  const currentFormat = quill.getFormat(range);
  if (currentFormat.background === '#fff59d') {
    quill.format('background', false);
  } else {
    quill.format('background', '#fff59d');
  }

  updateButtonStates();
}

// 🏷️ H2 見出し ON/OFF
function toggleH2() {
  if (!quill) return;
  quill.focus();
  const range = quill.getSelection();
  if (!range) return;

  const currentFormat = quill.getFormat(range);
  if (currentFormat.header === 2) {
    quill.format('header', false);
  } else {
    quill.format('header', 2);
  }

  updateButtonStates();
}

// ボタンの状態チェック
function updateButtonStates() {
  if (!quill) return;

  const btnMarker = document.getElementById("btnMarker");
  const btnH2 = document.getElementById("btnH2");

  const range = quill.getSelection();
  if (range) {
    const format = quill.getFormat(range);

    if (btnMarker) {
      if (format.background === '#fff59d') {
        btnMarker.classList.add("active-tool");
      } else {
        btnMarker.classList.remove("active-tool");
      }
    }

    if (btnH2) {
      if (format.header === 2) {
        btnH2.classList.add("active-tool");
      } else {
        btnH2.classList.remove("active-tool");
      }
    }
  } else {
    if (btnMarker) btnMarker.classList.remove("active-tool");
    if (btnH2) btnH2.classList.remove("active-tool");
  }
}

// 記号（シンボル）挿入
function insertSymbol(symbol) {
  if (!quill) return;
  quill.focus();
  const range = quill.getSelection(true);
  quill.insertText(range.index, symbol);
  quill.setSelection(range.index + symbol.length);
}

// 📷 画像を挿入する関数
function insertImage() {
  if (!quill) return;

  const input = document.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('accept', 'image/*');
  input.click();

  input.onchange = () => {
    const file = input.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        quill.focus();
        const range = quill.getSelection(true) || { index: quill.getLength() };
        quill.insertEmbed(range.index, 'imageIcon', { src: e.target.result });
        quill.setSelection(range.index + 1);
      };
      reader.readAsDataURL(file);
    }
  };
}

// 目次機能
function renderToc() {
  const tocMenu = document.getElementById("tocMenu");
  if (!tocMenu || !quill) return;

  const h2Elements = quill.root.querySelectorAll("h2");

  if (h2Elements.length === 0) {
    tocMenu.innerHTML = "<div class='toc-item empty'>見出しがありません</div>";
    return;
  }

  let html = "";
  h2Elements.forEach((el, index) => {
    const title = el.innerText.trim() || "無題の見出し";
    html += `<div class="toc-item" onclick="jumpToHeadingIndex(${index})">🏷️ ${title}</div>`;
  });
  tocMenu.innerHTML = html;
}

function jumpToHeadingIndex(index) {
  if (!quill) return;
  const h2Elements = quill.root.querySelectorAll("h2");
  if (h2Elements[index]) {
    h2Elements[index].scrollIntoView({ behavior: "smooth", block: "center" });
    toggleToc();
  }
}

function toggleToc() {
  const tocMenu = document.getElementById("tocMenu");
  if (tocMenu) tocMenu.classList.toggle("hidden");
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// モーダル機能
function openAddNoteModal() { openModal("note", "ノート追加", "追加"); }
function openAddPageModal(noteId) { currentNoteId = noteId; openModal("page", "ページ追加", "追加"); }

function openDeleteModal(noteId) {
  const note = getNote(noteId);
  deleteTarget = noteId;
  openModal("delete", `${note.title} を削除しますか？`, "削除", false);
}

function openDeletePageModal(noteId, pageId) {
  const note = getNote(noteId);
  const page = note.pages.find(p => p.id === pageId);
  deleteTarget = { noteId, pageId };
  openModal("deletePage", `${page.title} を削除しますか？`, "削除", false);
}

function openEditNoteModal(noteId) {
  const note = getNote(noteId);
  editTarget = noteId;
  openModal("editNote", "ノート名変更", "変更");
  modalInput.value = note.title;
}

function openEditPageModal(noteId, pageId) {
  const page = getPage(noteId, pageId);
  editTarget = { noteId, pageId };
  openModal("editPage", "ページ名変更", "変更");
  modalInput.value = page.title;
}

function openImagePreviewModal(src) {
  modalMode = "imagePreview";
  modalTitle.innerText = "";
  modalInput.style.display = "none";
  confirmBtn.style.display = "none"; // 確定ボタンは非表示
  
  let imgContainer = document.getElementById("imagePreviewContainer");
  if (!imgContainer) {
    imgContainer = document.createElement("div");
    imgContainer.id = "imagePreviewContainer";
    // modal-contentの直下に追加
    modal.querySelector(".modal-content").appendChild(imgContainer);
  }
  
  // 🖼️ 画像 ＋ その直下にキャンセルボタンを配置する構造
  imgContainer.innerHTML = `
    <img src="${src}" class="preview-large-img" />
    <div class="image-preview-btn-area">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    </div>
  `;
  
  // 元のモーダル下部ボタンエリアは非表示
  const defaultButtons = modal.querySelector(".modal-buttons");
  if (defaultButtons) defaultButtons.style.display = "none";

  modal.classList.add("modal-image-preview");
  modal.classList.remove("hidden");
}

function openDeleteImageModal(node) {
  targetImageNode = node; // 右クリックされたアイコン要素（HTMLノード）を直接保持
  modalMode = "deleteImage";
  modalTitle.innerText = "この画像を削除しますか？";
  confirmBtn.innerText = "削除";
  confirmBtn.style.display = "inline-block";
  confirmBtn.classList.add("active");
  modalInput.style.display = "none";

  const imgContainer = document.getElementById("imagePreviewContainer");
  if (imgContainer) imgContainer.remove();

  modal.classList.remove("hidden");
}

function openModal(mode, title, buttonText, showInput = true) {
  modalMode = mode;
  modalTitle.innerText = title;
  confirmBtn.innerText = buttonText;
  confirmBtn.classList.remove("active");
  
  if (showInput) {
    modal.classList.add("modal-has-input");
  } else {
    modal.classList.remove("modal-has-input");
  }

  modalInput.style.display = showInput ? "block" : "none";
  modalInput.value = "";
  modal.classList.remove("hidden");

  if (showInput) {
    setTimeout(() => {
      modalInput.focus();
      const len = modalInput.value.length;
      modalInput.setSelectionRange(len, len);
      checkInputLength();
    }, 50);
  }
}

function checkInputLength() {
  if (modalInput.value.trim().length > 0) {
    confirmBtn.classList.add("active");
  } else {
    confirmBtn.classList.remove("active");
  }
}

function closeModal() {
    modal.classList.add("hidden");
    modal.classList.remove("modal-image-preview");
    modalInput.style.display = "block";
    confirmBtn.style.display = "inline-block";
    
    // 通常ボタンエリアを表示状態に戻す
    const defaultButtons = modal.querySelector(".modal-buttons");
    if (defaultButtons) defaultButtons.style.display = "flex";

    const imgContainer = document.getElementById("imagePreviewContainer");
    if (imgContainer) imgContainer.remove();
}

function confirmModal() {
if (modalMode === "deleteImage") {
    if (targetImageNode) {
      // 記憶していたノードを直接消す、ダメならQuillから消す（二重構えで確実に削除）
      const blot = Quill.find(targetImageNode);
      if (blot) {
        blot.deleteAt(0, 1);
      } else {
        targetImageNode.remove(); // 直接HTMLから抹消
      }
      
      // 保存処理
      if (quill) {
        const p = getPage(currentNoteId, currentPageId);
        if (p) {
          p.content = quill.root.innerHTML;
          saveData();
        }
      }
    }
    targetImageNode = null;
    finishModal();
    return;
  }

  if (modalMode === "delete") {
    notes = notes.filter(n => n.id !== deleteTarget);
    finishModal();
    showHome();
    return;
  }
  if (modalMode === "deletePage") {
    const note = getNote(deleteTarget.noteId);
    if (!note) return;
    note.pages = note.pages.filter(p => Number(p.id) !== Number(deleteTarget.pageId));
    finishModal();
    showNote(note.id);
    return;
  }
  if (modalMode === "editNote") {
    const title = modalInput.value.trim();
    if (!title) return;
    const note = getNote(editTarget);
    note.title = title;
    finishModal();
    showHome();
    return;
  }
  if (modalMode === "editPage") {
    const title = modalInput.value.trim();
    if (!title) return;
    const page = getPage(editTarget.noteId, editTarget.pageId);
    page.title = title;
    finishModal();
    showNote(editTarget.noteId);
    return;
  }

  const title = modalInput.value.trim();
  if (!title) return;

  if (modalMode === "note") {
    const newNote = { id: Date.now(), title, pages: [] };
    notes.push(newNote);
    finishModal();
    showNote(newNote.id);
    return;
  }
  if (modalMode === "page") {
    const note = getNote(currentNoteId);
    if (!note) return;
    const newPage = {
      id: Date.now(),
      title,
      updatedAt: new Date().toLocaleString(),
      content: ""
    };
    note.pages.push(newPage);
    finishModal();
    showPage(currentNoteId, newPage.id);
  }
}

if (modalInput) {
  modalInput.addEventListener("input", checkInputLength);
  modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      confirmModal();
    }
  });
}

function getNote(noteId) { return notes.find(n => n.id === noteId); }
function getPage(noteId, pageId) {
  const note = getNote(noteId);
  return note ? note.pages.find(p => p.id === pageId) : null;
}
function finishModal() { saveData(); closeModal(); }

function saveData() {
  localStorage.setItem("notes", JSON.stringify(notes));
  localStorage.setItem("symbols", JSON.stringify(symbols));
}

function renderSymbols() {
  const bar = document.getElementById("symbolBar");
  if (!bar) return;
  bar.innerHTML = "";

  symbols.forEach((sym, index) => {
    const btn = document.createElement("button");
    btn.innerText = sym.key;
    btn.onclick = () => {
      if (deleteMode) {
        symbols.splice(index, 1);
        saveSymbols();
        renderSymbols();
        return;
      }
      insertSymbol(sym.key);
    };
    bar.appendChild(btn);
  });
}

function addSymbol() {
  const input = document.getElementById("symbolInput");
  const symbol = input.value.trim();
  if (!symbol) return;

  symbols.push({ id: Date.now().toString(), key: symbol, shortcut: "" });
  input.value = "";
  saveSymbols();
  renderSymbols();
}

function removeSymbol() {
  const input = document.getElementById("symbolInput");
  const symbol = input.value.trim();
  if (!symbol) return;

  const index = symbols.findIndex(s => s.key === symbol);
  if (index === -1) return;

  symbols.splice(index, 1);
  input.value = "";
  saveSymbols();
  renderSymbols();
}

function saveSymbols() {
  localStorage.setItem("symbols", JSON.stringify(symbols));
}

// グローバル登録
window.closeModal = closeModal;
window.confirmModal = confirmModal;
window.showHome = showHome;
window.showNote = showNote;
window.showPage = showPage;
window.openAddNoteModal = openAddNoteModal;
window.openAddPageModal = openAddPageModal;
window.openEditNoteModal = openEditNoteModal;
window.openEditPageModal = openEditPageModal;
window.openDeleteModal = openDeleteModal;
window.openDeletePageModal = openDeletePageModal;
window.toggleMarker = toggleMarker;
window.toggleH2 = toggleH2;
window.toggleToc = toggleToc;
window.jumpToHeadingIndex = jumpToHeadingIndex;
window.scrollToTop = scrollToTop;
window.addSymbol = addSymbol;
window.removeSymbol = removeSymbol;
window.insertImage = insertImage;


showHome();