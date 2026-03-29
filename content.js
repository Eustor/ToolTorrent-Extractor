/**
 * ToolTorrent Extractor — content.js
 * Injeta um FAB na página do torrent, abre um modal com imagens e metadados
 * extraídos, e baixa os itens selecionados via chrome.downloads API.
 *
 * Compatível com trackers Gazelle / UNIT3D.
 */

(function () {
  'use strict';

  // Evita injeção duplicada
  if (window.toolTorrentExtractorLoaded) return;
  window.toolTorrentExtractorLoaded = true;

  // ─── Configuração ────────────────────────────────────────────────────────────
  const CONFIG = {
    // true  → pergunta onde salvar a cada download
    // false → usa pasta padrão de downloads
    SAVE_AS: false,

    // Delay entre downloads de imagem (ms) — evita bloqueio por rate-limit
    DOWNLOAD_DELAY: 150,

    // Prefixo da subpasta criada no diretório de downloads
    SUBFOLDER_PREFIX: 'ToolTorrent',
  };

  // ─── Utilitários ─────────────────────────────────────────────────────────────

  function sanitizeFilename(name) {
    return (name || 'arquivo')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200) || 'arquivo';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Extração de dados ────────────────────────────────────────────────────────

  function extractTorrentData() {
    const data = {
      title: '',
      coverImage: '',
      details: [],
      descriptionImages: [],
      descriptionText: '',
      tags: [],
      url: window.location.href,
    };

    // TÍTULO — tenta vários seletores comuns
    const titleSelectors = [
      '#torrent_details h1',
      '.torrent_title',
      'h1.page-title',
      '.box h1',
      'h2.torrent-title',
    ];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        data.title = el.textContent.trim();
        break;
      }
    }
    if (!data.title) {
      data.title = document.title.split('::')[0].trim() || 'torrent_info';
    }

    // IMAGEM DA CAPA — div com classe contendo "covers" ou "cover"
    const coverSelectors = [
      'div[class*="covers"] img',
      'div[class*="cover"] img',
      '.torrent-cover img',
      '.poster img',
    ];
    for (const sel of coverSelectors) {
      const img = document.querySelector(sel);
      if (img && img.src) {
        data.coverImage = img.src;
        break;
      }
    }

    // TABELA DE DETALHES — div com classe "box" excluindo comentários
    const tableSelectors = [
      'div[class*="box"]:not([class*="comment"]) table tr',
      '.torrent_detail_table tr',
      '#torrent_details table tr',
      '.box:not(.box_comments) table tr',
    ];
    let tableRows = null;
    for (const sel of tableSelectors) {
      const rows = document.querySelectorAll(sel);
      if (rows.length > 0) { tableRows = rows; break; }
    }
    if (tableRows) {
      tableRows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim();
          let value = cells[1].textContent.trim().replace(/\s+/g, ' ');
          // Para categoria prefere o texto do link
          if (index === 1 || label.toLowerCase().includes('categor')) {
            const link = cells[1].querySelector('a');
            if (link) value = link.textContent.trim();
          }
          data.details.push({ label, value });
        }
      });
    }

    // DESCRIÇÃO E IMAGENS — div com classe "main_column" ou fallbacks
    const mainColumnSelectors = [
      'div[class*="main_column"]:not([class*="comment"])',
      '.torrent_description',
      '#description',
      '.description:not(.comments)',
      '.torrent-description',
    ];
    let mainColumn = null;
    for (const sel of mainColumnSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Clona para remover comentários sem afetar a página
        mainColumn = el.cloneNode(true);
        const removeSelectors = [
          // Seção de comentários
          '[class*="comment"]', '[id*="comment"]', '.comments', '#comments',
          // UI de adicionar comentário, formulários, botões de ação
          'form', 'noscript', 'script', 'style',
          '[class*="add_comment"]', '[id*="add_comment"]',
          '[class*="reply"]', '[class*="report"]', '[class*="quote"]',
          '[class*="sidebar"]',
          // Lista de arquivos do torrent e informações de peers
          '[class*="filelist"]', '[id*="filelist"]',
          '[class*="file_list"]', '[id*="file_list"]',
          '[class*="files"]', '#files',
          '[class*="peers"]', '[class*="seeder"]', '[class*="leecher"]',
          // Ações de torrent (favoritar, votar, denunciar)
          '[class*="vote"]', '[class*="bookmark"]',
          '[class*="torrent_action"]', '[class*="actions"]',
          // Cabeçalhos/navegação internos que não são descrição
          '[class*="colhead"]', '[class*="thead"]',
        ];
        removeSelectors.forEach((sel) => {
          mainColumn.querySelectorAll(sel).forEach((node) => node.remove());
        });
        break;
      }
    }

    if (mainColumn) {
      // Imagens da descrição
      mainColumn.querySelectorAll('img').forEach((img) => {
        if (img.src) data.descriptionImages.push(img.src);
      });

      // Imagens em BBCode [img]url[/img] que podem estar em texto não renderizado
      const bbcodeMatches = mainColumn.innerHTML.match(/\[img\](.*?)\[\/img\]/gi);
      if (bbcodeMatches) {
        bbcodeMatches.forEach((match) => {
          const url = match.replace(/\[img\]|\[\/img\]/gi, '').trim();
          if (url && !data.descriptionImages.includes(url)) {
            data.descriptionImages.push(url);
          }
        });
      }

      // Texto da descrição — converte tags HTML para quebras de linha legíveis
      data.descriptionText = mainColumn.innerHTML
        .replace(/<!--[\s\S]*?-->/g, '')   // remove comentários HTML (<!-- ... -->)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/-->/g, '')               // remove --> soltos que escaparam
        .replace(/[ \t]+$/gm, '')          // remove espaços no fim de cada linha
        .split('\n')
        .filter((line) => {
          const t = line.trim();
          // Remove linhas que são só artefatos de interface
          if (t === '') return true;                                   // mantém linhas em branco
          if (t.length <= 2) return false;                             // muito curtas ([ ] | ↑)
          if (/^[-–—=_→←↑↓►◄▲▼|[\]{}()/\\]+$/.test(t)) return false; // só símbolos
          if (/^(-->|-+>|=>)$/.test(t)) return false;                  // setas soltas
          if (/^\s*\d+\s*$/.test(t)) return false;                     // só números (contadores)
          return true;
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')        // normaliza múltiplas linhas em branco
        .trim();
    }

    // TAGS
    const tagsSelectors = [
      'div[class*="box_tags"]:not([class*="comment"])',
      '.torrent-tags',
      '.tags:not(.comment-tags)',
    ];
    for (const sel of tagsSelectors) {
      const tagsDiv = document.querySelector(sel);
      if (tagsDiv) {
        tagsDiv.querySelectorAll('a').forEach((tag) => {
          const text = tag.textContent.trim();
          if (text) data.tags.push(text);
        });
        break;
      }
    }

    return data;
  }

  /**
   * Coleta todos os links de download de .torrent da página.
   * Retorna array de { url, label }.
   */
  function extractTorrentLinks() {
    const links = [];
    const seen  = new Set();

    document.querySelectorAll('a[href*="action=download"], a.torrent_download').forEach((el) => {
      const url = el.href;
      if (!url || url.startsWith('magnet:') || seen.has(url)) return;
      seen.add(url);

      // Tenta obter label descritivo: texto do link, título, ou célula da tabela
      let label = el.textContent.trim();
      if (!label) label = el.title.trim();
      if (!label) label = el.closest('td')?.textContent.trim() || '';
      if (!label) label = el.closest('tr')?.querySelector('td')?.textContent.trim() || '';
      label = label.substring(0, 100) || 'Torrent';

      links.push({ url, label });
    });

    // Fallback: constrói URL a partir do ?id= da página atual
    if (links.length === 0) {
      const idMatch = window.location.search.match(/[?&]id=(\d+)/);
      if (idMatch) {
        const base = window.location.origin + window.location.pathname;
        links.push({
          url: `${base}?action=download&id=${idMatch[1]}&source=details`,
          label: 'Torrent',
        });
      }
    }

    return links;
  }

  /**
   * Busca o nome real do arquivo via cabeçalho Content-Disposition do servidor.
   * Retorna null se não conseguir determinar.
   */
  async function fetchTorrentFilename(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', credentials: 'include' });
      const cd  = res.headers.get('Content-Disposition');
      if (cd) {
        // RFC 5987: filename*=UTF-8''nome%20arquivo.torrent
        const rfc = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
        if (rfc) return decodeURIComponent(rfc[1]);
        // Simples: filename="nome.torrent" ou filename=nome.torrent
        const simple = cd.match(/filename[^;=\n]*=\s*['"]?([^'"\n;]+)/i);
        if (simple) return simple[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
    return null;
  }

  /**
   * Coleta TODAS as imagens da página excluindo comentários e ícones pequenos.
   * Inclui imagens referenciadas em links (<a href="*.jpg">).
   */
  function getAllImages() {
    const images = [];
    const seenUrls = new Set();

    // Todas as <img> da página
    document.querySelectorAll('img').forEach((img) => {
      const inComments =
        img.closest('[class*="comment"]') ||
        img.closest('[id*="comment"]') ||
        img.closest('.comments');

      if (img.src && !seenUrls.has(img.src) && !inComments) {
        // Ignora ícones e imagens muito pequenas
        if (img.naturalWidth > 50 || img.width > 50) {
          images.push({ url: img.src, alt: img.alt || 'Imagem', selected: true });
          seenUrls.add(img.src);
        }
      }
    });

    // Links diretos para imagens
    const imgExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const imgLinkSel = imgExtensions.map((e) => `a[href$=".${e}"]`).join(',');
    document.querySelectorAll(imgLinkSel).forEach((link) => {
      const inComments =
        link.closest('[class*="comment"]') ||
        link.closest('[id*="comment"]') ||
        link.closest('.comments');

      if (link.href && !seenUrls.has(link.href) && !inComments) {
        images.push({ url: link.href, alt: 'Imagem (link)', selected: true });
        seenUrls.add(link.href);
      }
    });

    return images;
  }

  // ─── Formatação do TXT ────────────────────────────────────────────────────────

  function formatTorrentInfo(data) {
    const sep = '═'.repeat(70);
    const div = '─'.repeat(70);
    const lines = [];

    lines.push(sep);
    lines.push('  INFORMACOES DO TORRENT');
    lines.push(sep);
    lines.push('');

    lines.push(`TITULO:\n   ${data.title}\n`);
    lines.push(`URL:\n   ${data.url}\n`);
    lines.push(div);

    if (data.coverImage) {
      lines.push(`\nIMGEM DA CAPA:\n   ${data.coverImage}\n   [img]${data.coverImage}[/img]\n`);
      lines.push(div);
    }

    if (data.details.length > 0) {
      lines.push('\nINFORMACOES TECNICAS:\n');
      const maxLen = Math.max(...data.details.map((d) => d.label.length));
      data.details.forEach(({ label, value }) => {
        lines.push(`   ${label.padEnd(maxLen)}  ->  ${value}`);
      });
      lines.push(`\n${div}`);
    }

    if (data.tags.length > 0) {
      lines.push(`\nTAGS:\n   ${data.tags.join(' | ')}\n`);
      lines.push(div);
    }

    if (data.descriptionText) {
      lines.push('\nDESCRICAO:\n');
      data.descriptionText.split('\n').forEach((line) => {
        lines.push(line.trim() ? `   ${line}` : '');
      });
      lines.push(`\n${div}`);
    }

    if (data.descriptionImages.length > 0) {
      lines.push(`\nSCREENSHOTS E IMAGENS (${data.descriptionImages.length}):\n`);
      data.descriptionImages.forEach((url, i) => {
        lines.push(`   ${i + 1}. ${url}`);
        lines.push(`      [img]${url}[/img]\n`);
      });
      lines.push(div);
    }

    lines.push('');
    lines.push(sep);
    lines.push(`  Gerado por ToolTorrent Extractor — ${new Date().toLocaleString('pt-BR')}`);
    lines.push(sep);

    return lines.join('\n');
  }

  // ─── Downloads ───────────────────────────────────────────────────────────────

  function sendDownload(url, filename) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'download', url, filename, saveAs: CONFIG.SAVE_AS },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response.downloadId);
          } else {
            reject(new Error(response?.error || 'Download falhou'));
          }
        }
      );
    });
  }

  function downloadTextFile(content, filename) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      sendDownload(url, filename)
        .then((id) => { URL.revokeObjectURL(url); resolve(id); })
        .catch((err) => { URL.revokeObjectURL(url); reject(err); });
    });
  }

  function downloadImage(url, index, folderName) {
    let name = '';
    try {
      const pathname = new URL(url).pathname;
      name = decodeURIComponent(pathname.split('/').pop());
    } catch (_) {}

    // Fallback se não conseguir extrair nome válido com extensão
    if (!name || !name.includes('.')) {
      let ext = 'jpg';
      try {
        const clean = url.split('?')[0].split('#')[0];
        const possible = clean.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(possible)) ext = possible;
      } catch (_) {}
      name = `image_${String(index + 1).padStart(3, '0')}.${ext}`;
    }

    return sendDownload(url, `${folderName}/${sanitizeFilename(name)}`);
  }

  async function downloadAll(modal) {
    const torrentData   = modal._torrentData;
    const allImages     = modal._allImages;
    const torrentLinks  = modal._torrentLinks;

    // Torrents selecionados
    const selectedTorrents = [];
    modal.querySelectorAll('.tt-torrent-checkbox').forEach((cb) => {
      if (cb.checked) selectedTorrents.push(torrentLinks[parseInt(cb.dataset.index, 10)]);
    });

    // Imagens selecionadas
    const selectedImages = [];
    modal.querySelectorAll('.tt-img-checkbox').forEach((cb) => {
      if (cb.checked) selectedImages.push(allImages[parseInt(cb.dataset.index, 10)]);
    });

    const torrentInfo = modal.querySelector('#tt-torrent-info').value;
    const safeName    = sanitizeFilename(torrentData.title);
    const folderName  = `${CONFIG.SUBFOLDER_PREFIX}/${safeName}`;

    const btn = modal.querySelector('#tt-download-btn');
    btn.disabled = true;

    let totalCount = 1 + selectedImages.length + selectedTorrents.length;
    let downloaded  = 0;

    try {
      // 1. Arquivos .torrent selecionados
      for (let i = 0; i < selectedTorrents.length; i++) {
        const t = selectedTorrents[i];
        btn.textContent = `Baixando torrent ${i + 1} de ${selectedTorrents.length}...`;
        try {
          // Busca nome real via Content-Disposition do servidor
          let filename = await fetchTorrentFilename(t.url);
          if (!filename) filename = `${safeName}${selectedTorrents.length > 1 ? `_${i + 1}` : ''}.torrent`;
          await sendDownload(t.url, `${folderName}/${sanitizeFilename(filename)}`);
          downloaded++;
        } catch (err) {
          console.warn(`[ToolTorrent] Falha torrent "${t.label}":`, err.message);
        }
        await sleep(CONFIG.DOWNLOAD_DELAY);
      }

      // 2. Arquivo TXT
      btn.textContent = `Baixando ${safeName}.txt...`;
      await downloadTextFile(torrentInfo, `${folderName}/${safeName}.txt`);
      downloaded++;

      // 3. Imagens selecionadas (sequencial com delay)
      for (let i = 0; i < selectedImages.length; i++) {
        btn.textContent = `Baixando imagem ${i + 1} de ${selectedImages.length}...`;
        try {
          await downloadImage(selectedImages[i].url, i, folderName);
          downloaded++;
        } catch (err) {
          console.warn(`[ToolTorrent] Falha imagem ${i + 1}:`, err.message);
        }
        await sleep(CONFIG.DOWNLOAD_DELAY);
      }

      btn.textContent = `✓ ${downloaded} de ${totalCount} arquivo(s) baixados!`;
      setTimeout(() => modal.remove(), 2000);
    } catch (err) {
      console.error('[ToolTorrent] Erro:', err);
      btn.textContent = 'Erro no download';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Baixar Selecionados'; }, 3000);
    }
  }

  // ─── UI — FAB ─────────────────────────────────────────────────────────────────

  function createFAB() {
    const fab = document.createElement('div');
    fab.id = 'tt-fab';
    fab.title = 'ToolTorrent Extractor';
    fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
    </svg>`;
    document.body.appendChild(fab);
    fab.addEventListener('click', openModal);
    return fab;
  }

  // ─── UI — Modal ───────────────────────────────────────────────────────────────

  function openModal() {
    // Remove modal existente (toggle)
    const existing = document.getElementById('tt-modal');
    if (existing) { existing.remove(); return; }

    const torrentData  = extractTorrentData();
    const allImages    = getAllImages();
    const torrentLinks = extractTorrentLinks();

    const modal = document.createElement('div');
    modal.id = 'tt-modal';
    modal._torrentData  = torrentData;
    modal._allImages    = allImages;
    modal._torrentLinks = torrentLinks;

    const imagesHtml = allImages.length === 0
      ? '<p class="tt-no-images">Nenhuma imagem encontrada.</p>'
      : allImages.map((img, i) => `
          <div class="tt-image-item">
            <label>
              <input type="checkbox" class="tt-img-checkbox" data-index="${i}" checked>
              <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt)}" loading="lazy"
                   onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22150%22%3E%3Crect fill=%22%23333%22 width=%22150%22 height=%22150%22/%3E%3Ctext fill=%22%23666%22 font-size=%2212%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3E?%3C/text%3E%3C/svg%3E'">
            </label>
          </div>
        `).join('');

    const torrentsHtml = torrentLinks.length === 0 ? '' : `
      <div class="tt-section">
        <h3>Torrents disponíveis (${torrentLinks.length})</h3>
        <div class="tt-torrent-list">
          ${torrentLinks.map((t, i) => `
            <label class="tt-torrent-item">
              <input type="checkbox" class="tt-torrent-checkbox" data-index="${i}" checked>
              <span class="tt-torrent-icon">⬇</span>
              <div class="tt-torrent-info">
                <span class="tt-torrent-filename tt-filename-loading" data-index="${i}">buscando nome...</span>
                <span class="tt-torrent-label-hint">${escapeHtml(t.label)}</span>
              </div>
            </label>
          `).join('')}
        </div>
      </div>`;

    modal.innerHTML = `
      <div class="tt-modal-content">
        <div class="tt-modal-header">
          <h2>ToolTorrent Extractor — ${escapeHtml(torrentData.title)}</h2>
          <button class="tt-close-btn">&times;</button>
        </div>
        <div class="tt-modal-body">
          ${torrentsHtml}
          <div class="tt-section">
            <h3>Imagens (${allImages.length})</h3>
            <div class="tt-select-controls">
              <button id="tt-select-all">Selecionar Todas</button>
              <button id="tt-deselect-all">Desmarcar Todas</button>
            </div>
            <div class="tt-images-grid">${imagesHtml}</div>
          </div>
          <div class="tt-section">
            <h3>Dados do Torrent</h3>
            <textarea id="tt-torrent-info" rows="15">${escapeHtml(formatTorrentInfo(torrentData))}</textarea>
          </div>
        </div>
        <div class="tt-modal-footer">
          <button id="tt-download-btn" class="tt-btn-primary">Baixar Selecionados</button>
          <button id="tt-cancel-btn" class="tt-btn-secondary">Cancelar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Busca os nomes reais dos torrents em paralelo e atualiza o modal
    torrentLinks.forEach((t, i) => {
      const el = modal.querySelector(`.tt-torrent-filename[data-index="${i}"]`);
      if (!el) return;
      fetchTorrentFilename(t.url).then((name) => {
        el.textContent = name || t.label;
        el.classList.remove('tt-filename-loading');
      }).catch(() => {
        el.textContent = t.label;
        el.classList.remove('tt-filename-loading');
      });
    });

    modal.querySelector('.tt-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('#tt-cancel-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('#tt-select-all').addEventListener('click', () => {
      modal.querySelectorAll('.tt-img-checkbox').forEach((cb) => (cb.checked = true));
    });
    modal.querySelector('#tt-deselect-all').addEventListener('click', () => {
      modal.querySelectorAll('.tt-img-checkbox').forEach((cb) => (cb.checked = false));
    });
    modal.querySelector('#tt-download-btn').addEventListener('click', () => downloadAll(modal));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Fechar com Escape
    const onKey = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFAB);
  } else {
    createFAB();
  }

})();
